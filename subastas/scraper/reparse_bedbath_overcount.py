"""
Corrective re-parse — bedroom/bathroom OVER-COUNT fix (2026-07-16, Ghost).

WHY: WAVE128 ingest concatenated OVERLAPPING prose fields before counting rooms.
The BOE path fed ``bienes + cadastral_data + body_text`` where ``cadastral_data``
is extracted FROM ``bienes`` and ``body_text`` is the whole page (which CONTAINS
``bienes``); ``property_attribute_parser._count_rooms`` sums every mention, so a
"cuatro dormitorios … baño" listing was stored as bedrooms=8 / bathrooms=2 (2×).
The source fix (dedupe_prose) is deployed with the scheduler; this one-shot script
CORRECTS the already-persisted bad values.

The live ``set_property_attribute_fields`` guard is FILL-ONLY
(``if val is not None and record.get(key) is None``), so the corrected logic will
NEVER overwrite the frozen wrong counts on its own. This script re-derives
bedrooms/bathrooms with the SAME shared parser + the SAME dedupe_prose the live
scraper now uses (imported — no logic drift) and OVERWRITES them in place.

SCOPE: only bedrooms / bathrooms, only rows where at least one of the two is
currently non-NULL (the rows that could carry a doubled value). floorLevel,
hasTerrace/Garden/Garage/StorageRoom and every catastro column are LEFT UNTOUCHED
(spot-checked accurate; a boolean/floor cannot be "doubled").

SAFETY:
  - OVERWRITE only when the re-parsed value is not None AND differs from stored.
    A re-parse that yields None (no countable prose) is reported but NOT written —
    we never blank an existing count from this corrective pass.
  - Honest-NULL preserved: we never write 0.
  - Idempotent: dedupe_prose is deterministic, so a second run finds new==stored
    and writes nothing.
  - id-cursor paginated (in-place UPDATEs never cause offset skipping).
  - Pre-migration safe: column presence probed via information_schema.
  - ON-conflict-free: single-row UPDATE by primary key.

Usage (Ken, on the box, AFTER the scheduler is rebuilt off the fix commit):
    DATABASE_URL=postgres://... python3 -u reparse_bedbath_overcount.py --dry-run
    DATABASE_URL=postgres://... python3 -u reparse_bedbath_overcount.py
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

# Import the SHARED parser + dedupe so this corrective pass and the live scraper
# never drift.
try:
    from .scrapers.property_attribute_parser import (
        parse_property_attributes,
        dedupe_prose,
    )
except ImportError:
    sys.path.insert(0, "/")
    try:
        from app.scrapers.property_attribute_parser import (  # type: ignore
            parse_property_attributes,
            dedupe_prose,
        )
    except ImportError:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "scrapers"))
        from property_attribute_parser import (  # type: ignore
            parse_property_attributes,
            dedupe_prose,
        )

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("reparse_bedbath_overcount")

ACTIVE_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "SUSPENDIDA")

# (parser key, DB column) — bed/bath ONLY. Everything else is left as-is.
FIX_COLS = [
    ("bedrooms",  "bedrooms"),
    ("bathrooms", "bathrooms"),
]


def _prose(row):
    """Deduped prose — the SAME overlap-safe join the fixed live scraper uses."""
    return dedupe_prose(
        row.get("lotDescription"),
        row.get("propertyDescription"),
        row.get("cadastralData"),
        row.get("title"),
    )


def run(dry_run=False, include_finished=False, limit=None):
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

    cur.execute(
        """SELECT column_name FROM information_schema.columns
           WHERE table_name = 'Auction'
             AND column_name IN ('bedrooms','bathrooms')"""
    )
    present = {r[0] for r in cur.fetchall()}
    active_cols = [(k, c) for (k, c) in FIX_COLS if c in present]
    if not active_cols:
        logger.error("Neither bedrooms nor bathrooms column exists — nothing to do.")
        sys.exit(1)

    if include_finished:
        status_pred = "TRUE"
        params_base = {}
        logger.info("Scope: ALL rows (active + finished) with non-NULL bed/bath.")
    else:
        status_pred = 'status = ANY(%(statuses)s::"AuctionStatus"[])'
        params_base = {"statuses": list(ACTIVE_STATUSES)}
        logger.info("Scope: ACTIVE rows %s with non-NULL bed/bath.", ACTIVE_STATUSES)

    # Only rows that already carry a bed OR bath value can be over-counted.
    nonnull_pred = "(" + " OR ".join(f'"{c}" IS NOT NULL' for (_, c) in active_cols) + ")"

    cur.execute(
        f'SELECT COUNT(*) FROM "Auction" WHERE {status_pred} AND {nonnull_pred}',
        params_base or None,
    )
    total = cur.fetchone()[0]
    logger.info("Rows in scope (non-NULL bed/bath): %s", f"{total:,}")

    BATCH = 2000
    last_id = ""
    scanned = 0
    corrected = {c: 0 for (_, c) in active_cols}   # values changed
    would_null = {c: 0 for (_, c) in active_cols}  # re-parse None, left as-is
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
            WHERE {status_pred} AND {nonnull_pred} AND id > %(last_id)s
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
            attrs = parse_property_attributes(prose) if prose else {}

            updates, up_params = [], []
            for key, col in active_cols:
                new = attrs.get(key)
                old = row.get(col)
                if old is None:
                    continue  # this column not set on this row
                if new is None:
                    would_null[col] += 1  # reported only; never blank here
                    continue
                if new != old:
                    updates.append(f'"{col}" = %s')
                    up_params.append(new)
                    corrected[col] += 1

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
        logger.info("...scanned %s/%s | rows corrected %d | %s",
                    f"{scanned:,}", f"{total:,}", rows_touched,
                    " ".join(f"{c}~{n}" for c, n in corrected.items()))
        if limit and scanned >= limit:
            break

    if not dry_run:
        conn.commit()
    cur.close()
    conn.close()

    logger.info("=" * 64)
    logger.info("RE-PARSE COMPLETE%s", " (DRY-RUN — no writes)" if dry_run else "")
    logger.info("  scanned rows in scope : %d", scanned)
    logger.info("  rows corrected        : %d", rows_touched)
    for _, col in active_cols:
        logger.info("  %-10s corrected %d | re-parse-None(left as-is) %d",
                    col, corrected[col], would_null[col])
    logger.info("=" * 64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Parse but do not write")
    ap.add_argument("--include-finished", action="store_true",
                    help="Also scan terminal rows (default = active only)")
    ap.add_argument("--limit", type=int, default=0, help="Max rows scanned (0 = all)")
    args = ap.parse_args()
    run(dry_run=args.dry_run, include_finished=args.include_finished,
        limit=args.limit or None)


if __name__ == "__main__":
    main()
