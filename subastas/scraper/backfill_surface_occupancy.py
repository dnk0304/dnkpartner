"""
G3 — surfaceM2 + occupancy backfill over the ACTIVE pool ONLY (2026-06-19, Ghost).

PARSE-ONLY, NO RE-FETCH. The bien / registry prose is ALREADY stored on each row
(lotDescription / propertyDescription / chargesDetail / title / address), so this
backfill never touches BOE — it reads the stored text, runs the SAME parsers the
live scraper now uses (parse_surface_m2 + parse_occupancy_prose, imported from
boe_scraper so there is no logic drift), and UPDATEs surfaceM2 + occupancy in place.

SCOPE = the ~1,727 ACTIVE rows (CELEBRANDOSE + PROXIMA_APERTURA + SUSPENDIDA), NOT
the ~214k terminal CONCLUIDA rows. The active pool is the buyer-facing card set;
finished rows are frozen and not worth the write. Use --include-finished to widen
(cosmetic / optional).

HONEST-NULL: surfaceM2 is written ONLY when the parser found a number; occupancy
is written ONLY when (a) it is currently NULL and (b) the conservative prose
scanner returned a value. A row with no parseable surface stays NULL — never 0,
never fabricated. occupancy that is already set is left untouched (the structured
"Situación posesoria" value, if present, is more authoritative than prose).

IDEMPOTENT + RESUMABLE: re-running is a no-op on rows already filled (surfaceM2
skip is implicit — we recompute and COALESCE; occupancy only fills NULLs). The
scan is id-cursor paginated so in-place UPDATEs never cause offset skipping.
A done-marker is written on a full clean pass.

Pre/post-migration safe: the surfaceM2 column write is guarded by an
information_schema existence check, so running before the migration is applied
just skips the surface write (occupancy still backfills).

Usage (Ken, on the box, AFTER `prisma migrate deploy` of 20260619_add_surface_m2
and the scheduler rebuild):
    DATABASE_URL=postgres://... python3 -u backfill_surface_occupancy.py --dry-run
    DATABASE_URL=postgres://... python3 -u backfill_surface_occupancy.py
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

# Import the SHARED parsers so the backfill and the live scraper never drift.
try:
    from .scrapers.boe_scraper import parse_surface_m2, parse_occupancy_prose
except ImportError:  # running as a top-level module inside the container
    sys.path.insert(0, "/")
    try:
        from app.scrapers.boe_scraper import (  # type: ignore
            parse_surface_m2, parse_occupancy_prose,
        )
    except ImportError:
        # Local run from the scraper dir (no package parent).
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from scrapers.boe_scraper import (  # type: ignore
            parse_surface_m2, parse_occupancy_prose,
        )

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_surface_occupancy")

ACTIVE_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "SUSPENDIDA")
DONE_MARKER = "/data/dnksubastas-deploy/scheduler-logs/backfill_surface_occupancy.done"


def _prose(row):
    """Concatenate the stored bien/registry text fields for a row (dict)."""
    return " ".join(filter(None, [
        row.get("lotDescription"),
        row.get("propertyDescription"),
        row.get("chargesDetail"),
        row.get("address"),
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

    # surfaceM2 column may not exist yet (pre-migration). Probe so the write is a
    # safe no-op before `prisma migrate deploy` runs.
    cur.execute(
        """SELECT 1 FROM information_schema.columns
           WHERE table_name = 'Auction' AND column_name = 'surfaceM2'"""
    )
    has_surface_col = cur.fetchone() is not None
    if not has_surface_col:
        logger.warning(
            "surfaceM2 column ABSENT — migration not yet applied. Surface writes "
            "will be SKIPPED this run; occupancy still backfills. Re-run after "
            "`prisma migrate deploy` to fill surfaceM2."
        )

    if include_finished:
        status_pred = "TRUE"
        params_base = {}
        logger.info("Scope: ALL rows (active + finished).")
    else:
        status_pred = 'status = ANY(%(statuses)s::"AuctionStatus"[])'
        params_base = {"statuses": list(ACTIVE_STATUSES)}
        logger.info(f"Scope: ACTIVE rows only {ACTIVE_STATUSES}.")

    # Denominator + the occupancy "before" baseline so the report mirrors the
    # brief (occupancy 504 -> Y/1727).
    cur.execute(f'SELECT COUNT(*) FROM "Auction" WHERE {status_pred}',
                params_base or None)
    total = cur.fetchone()[0]
    surf_sel = '"surfaceM2"' if has_surface_col else 'NULL'
    cur.execute(
        f'SELECT COUNT(*) FILTER (WHERE occupancy IS NOT NULL), '
        f'COUNT(*) FILTER (WHERE {surf_sel} IS NOT NULL) '
        f'FROM "Auction" WHERE {status_pred}',
        params_base or None,
    )
    occ_before, surf_before = cur.fetchone()
    logger.info(f"Total rows in scope: {total:,} | occupancy filled BEFORE: "
                f"{occ_before:,} | surfaceM2 filled BEFORE: {surf_before:,}")

    BATCH = 2000
    last_id = ""
    scanned = 0
    surf_set = 0     # surfaceM2 newly written (was NULL -> now a number)
    occ_set = 0      # occupancy newly written (was NULL -> now a value)
    cabida_skip = 0  # had prose but only land cabida / no parseable surface

    select_surf = '"surfaceM2"' if has_surface_col else "NULL AS \"surfaceM2\""
    while True:
        params = dict(params_base)
        params["last_id"] = last_id
        params["lim"] = BATCH
        cur.execute(
            f'''
            SELECT id, "boeId", occupancy, {select_surf},
                   title, address, "lotDescription", "propertyDescription",
                   "chargesDetail"
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

            updates = []
            up_params = []

            # surfaceM2 — only when the column exists AND currently NULL AND the
            # parser found a number (honest-NULL; never blanks a good value).
            if has_surface_col and row.get("surfaceM2") is None:
                sm = parse_surface_m2(prose)
                if sm is not None:
                    updates.append('"surfaceM2" = %s')
                    up_params.append(sm)
                    surf_set += 1
                else:
                    cabida_skip += 1

            # occupancy — only when currently NULL AND prose is unambiguous.
            if not row.get("occupancy"):
                occ = parse_occupancy_prose(prose)
                if occ is not None:
                    updates.append("occupancy = %s")
                    up_params.append(occ)
                    occ_set += 1

            if updates and not dry_run:
                up_params.append(row["id"])
                cur.execute(
                    f'UPDATE "Auction" SET {", ".join(updates)} WHERE id = %s',
                    up_params,
                )

        if not dry_run:
            conn.commit()
        logger.info(f"...scanned {scanned:,}/{total:,} | surfaceM2 +{surf_set} | "
                    f"occupancy +{occ_set}")
        if limit and scanned >= limit:
            break

    if not dry_run:
        conn.commit()

    cur.close()
    conn.close()

    logger.info("=" * 64)
    logger.info("BACKFILL COMPLETE%s", " (DRY-RUN — no writes)" if dry_run else "")
    logger.info("  scanned rows in scope     : %d", scanned)
    logger.info("  surfaceM2 newly filled    : %d", surf_set)
    logger.info("  surfaceM2 coverage        : %d / %d  (was %d)",
                surf_before + surf_set, total, surf_before)
    logger.info("  occupancy newly filled    : %d", occ_set)
    logger.info("  occupancy coverage        : %d / %d  (was %d)",
                occ_before + occ_set, total, occ_before)
    logger.info("  prose-but-no-surface skip : %d", cabida_skip)
    logger.info("=" * 64)

    if not dry_run and not limit and not include_finished:
        try:
            os.makedirs(os.path.dirname(DONE_MARKER), exist_ok=True)
            with open(DONE_MARKER, "w") as fh:
                fh.write(f"surfaceM2 +{surf_set}, occupancy +{occ_set}\n")
        except OSError:
            pass  # done-marker is best-effort


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
