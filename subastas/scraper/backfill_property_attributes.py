"""
Property-portal Phase 1 Leg A — prose-attribute backfill over the ACTIVE pool
(2026-07-11, Ghost).

PARSE-ONLY, NO RE-FETCH. The bien / registry prose is ALREADY stored on each row
(lotDescription / propertyDescription / cadastralData / title), so this backfill
never touches BOE — it reads the stored text, runs the SAME parser the live
scraper now uses (property_attribute_parser.parse_property_attributes, imported
so there is no logic drift), and UPDATEs the seven attribute columns in place:
bedrooms, bathrooms, hasTerrace, hasGarden, hasGarage, hasStorageRoom, floorLevel.

SCOPE = the ~1,802 ACTIVE rows (CELEBRANDOSE + PROXIMA_APERTURA + SUSPENDIDA),
the buyer-facing card set. --include-finished widens (cosmetic / optional).

HONEST-NULL + FILL-ONLY: a column is written ONLY when (a) it is currently NULL
and (b) the parser returned a value. bedrooms/bathrooms are written only when a
count was found; the booleans are written when the parser returned True OR an
explicit False (a negated "sin garaje"); floorLevel only when an anchor was
found. A row with no signal on a field stays NULL — never 0, never false-by-
default, never fabricated.

IDEMPOTENT + RESUMABLE: re-running only fills remaining NULLs; id-cursor
paginated so in-place UPDATEs never cause offset skipping. A done-marker is
written on a full clean pass.

Pre/post-migration safe: each column write is guarded by an information_schema
existence check, so running before the migration is applied is a no-op.

Usage (Ken, on the box, AFTER `prisma migrate deploy` of
20260711_add_property_attrs_catastro and the scheduler rebuild):
    DATABASE_URL=postgres://... python3 -u backfill_property_attributes.py --dry-run
    DATABASE_URL=postgres://... python3 -u backfill_property_attributes.py
Options: [--dry-run] [--include-finished] [--limit N]
"""
import argparse
import logging
import os
import sys

try:
    import psycopg2
except ImportError:  # pragma: no cover
    psycopg2 = None

# Import the SHARED parser so the backfill and the live scraper never drift.
try:
    from .scrapers.property_attribute_parser import parse_property_attributes
except ImportError:
    sys.path.insert(0, "/")
    try:
        from app.scrapers.property_attribute_parser import (  # type: ignore
            parse_property_attributes,
        )
    except ImportError:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "scrapers"))
        from property_attribute_parser import parse_property_attributes  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_property_attributes")

ACTIVE_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "SUSPENDIDA")
DONE_MARKER = "/data/dnksubastas-deploy/scheduler-logs/backfill_property_attributes.done"

# (parser key, DB column). Order fixed for stable logging.
ATTR_COLS = [
    ("bedrooms",         "bedrooms"),
    ("bathrooms",        "bathrooms"),
    ("has_terrace",      "hasTerrace"),
    ("has_garden",       "hasGarden"),
    ("has_garage",       "hasGarage"),
    ("has_storage_room", "hasStorageRoom"),
    ("floor_level",      "floorLevel"),
]


def _prose(row):
    return " ".join(filter(None, [
        row.get("lotDescription"),
        row.get("propertyDescription"),
        row.get("cadastralData"),
        row.get("title"),
    ])) or None


def run_backfill(dry_run=False, include_finished=False, limit=None):
    if psycopg2 is None:
        logger.error("psycopg2 not installed.")
        sys.exit(2)
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url or database_url.startswith("file:"):
        logger.error("DATABASE_URL must be a Postgres URL. Set DATABASE_URL env var.")
        sys.exit(1)

    logger.info("Connecting to Postgres...")
    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    cur = conn.cursor()

    # Probe which attribute columns exist (pre-migration safety).
    cur.execute(
        """SELECT column_name FROM information_schema.columns
           WHERE table_name = 'Auction'
             AND column_name IN ('bedrooms','bathrooms','hasTerrace','hasGarden',
                                 'hasGarage','hasStorageRoom','floorLevel')"""
    )
    present = {r[0] for r in cur.fetchall()}
    active_cols = [(k, c) for (k, c) in ATTR_COLS if c in present]
    if not active_cols:
        logger.error("None of the property-attribute columns exist yet — apply "
                     "migration 20260711_add_property_attrs_catastro first.")
        sys.exit(1)
    if len(active_cols) < len(ATTR_COLS):
        logger.warning("Only %d/%d attribute columns present: %s",
                       len(active_cols), len(ATTR_COLS), sorted(present))

    if include_finished:
        status_pred = "TRUE"
        params_base = {}
        logger.info("Scope: ALL rows (active + finished).")
    else:
        status_pred = 'status = ANY(%(statuses)s::"AuctionStatus"[])'
        params_base = {"statuses": list(ACTIVE_STATUSES)}
        logger.info(f"Scope: ACTIVE rows only {ACTIVE_STATUSES}.")

    cur.execute(f'SELECT COUNT(*) FROM "Auction" WHERE {status_pred}',
                params_base or None)
    total = cur.fetchone()[0]
    logger.info(f"Total rows in scope: {total:,}")

    BATCH = 2000
    last_id = ""
    scanned = 0
    filled = {c: 0 for (_, c) in active_cols}  # newly-written per column
    rows_touched = 0

    sel_cols = ", ".join(f'"{c}"' for (_, c) in active_cols)
    while True:
        params = dict(params_base)
        params["last_id"] = last_id
        params["lim"] = BATCH
        cur.execute(
            f'''
            SELECT id, "boeId", title, "lotDescription", "propertyDescription",
                   "cadastralData", {sel_cols}
            FROM "Auction"
            WHERE {status_pred} AND id > %(last_id)s
            ORDER BY id
            LIMIT %(lim)s
            ''',
            params,
        )
        rows = cur.fetchall()
        if not rows:
            break
        cols = [c[0] for c in cur.description]

        for r in rows:
            row = dict(zip(cols, r))
            last_id = row["id"]
            scanned += 1

            prose = _prose(row)
            if not prose:
                continue
            attrs = parse_property_attributes(prose)

            updates, up_params = [], []
            for key, col in active_cols:
                val = attrs.get(key)
                # Fill-only: currently NULL AND parser found a value. Booleans:
                # an explicit False (negated mention) IS a value worth storing.
                if val is not None and row.get(col) is None:
                    updates.append(f'"{col}" = %s')
                    up_params.append(val)
                    filled[col] += 1

            if updates:
                rows_touched += 1
                if not dry_run:
                    up_params.append(row["id"])
                    cur.execute(
                        f'UPDATE "Auction" SET {", ".join(updates)} WHERE id = %s',
                        up_params,
                    )

        if not dry_run:
            conn.commit()
        logger.info("...scanned %s/%s | rows touched %d | %s",
                    f"{scanned:,}", f"{total:,}", rows_touched,
                    " ".join(f"{c}+{n}" for c, n in filled.items()))
        if limit and scanned >= limit:
            break

    if not dry_run:
        conn.commit()
    cur.close()
    conn.close()

    logger.info("=" * 64)
    logger.info("BACKFILL COMPLETE%s", " (DRY-RUN — no writes)" if dry_run else "")
    logger.info("  scanned rows in scope : %d", scanned)
    logger.info("  rows updated          : %d", rows_touched)
    for _, col in active_cols:
        logger.info("  %-16s +%d", col, filled[col])
    logger.info("=" * 64)

    if not dry_run and not limit and not include_finished:
        try:
            os.makedirs(os.path.dirname(DONE_MARKER), exist_ok=True)
            with open(DONE_MARKER, "w") as fh:
                fh.write(" ".join(f"{c}+{n}" for c, n in filled.items()) + "\n")
        except OSError:
            pass  # best-effort


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Parse but do not write")
    ap.add_argument("--include-finished", action="store_true",
                    help="Also scan terminal rows (cosmetic; default = active only)")
    ap.add_argument("--limit", type=int, default=0, help="Max rows scanned (0 = all)")
    args = ap.parse_args()
    run_backfill(dry_run=args.dry_run, include_finished=args.include_finished,
                 limit=args.limit or None)


if __name__ == "__main__":
    main()
