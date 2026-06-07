#!/usr/bin/env python3
"""
Vehicle make / model / year backfill (wave E2, 2026-06-07).

Parses vehicleMake / vehicleModel / vehicleYear from the stored title +
lotDescription / propertyDescription of existing VEHICLE-category rows and
UPDATEs the three new columns (Forge E2 added them; NO migration here).

Scope (VEHICLE categories only — superset matching the live extractor):
  Turismos, Motocicletas, Camiones, Vehículos Industriales, Barcos,
  Embarcaciones, Aeronaves, Otros vehículos.
Non-vehicle rows are NEVER touched.

Honest-NULL + idempotent:
  * We only ever WRITE a non-NULL parsed value (COALESCE keeps the existing
    column when this run parsed nothing for that field) — a transient/empty
    parse never blanks a value the live scraper already set.
  * Re-running is a no-op once a row is parsed (it writes the same value).
  * 4-digit year guard lives in vehicle_parser (<1900 / >currentYear+1 -> NULL).
  * Partial OK: a row that yields make+model but no year writes make+model,
    leaves year NULL.

Resumable: id-cursor pagination (stable under in-place UPDATEs) + a done-marker.

Reuses the SAME parser the live scrapers use (scrapers.vehicle_parser) so the
backfill and future pulls never drift.

Reads DATABASE_URL (must be Postgres). Run detached on the scheduler container
(workdir /app):
  python3 -u backfill_vehicle_fields.py --dry-run         # preview, write nothing
  python3 -u backfill_vehicle_fields.py                   # active vehicle rows
  python3 -u backfill_vehicle_fields.py --include-finished  # + finished (big)

Flags:
  --dry-run            compute + report only, write nothing
  --include-finished   also process finished/CONCLUIDA vehicle rows
  --limit N            cap rows scanned (testing)
"""

import os
import sys
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

# Allow running from scraper/ root (and the /app container layout).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    logger.error("psycopg2 not installed. pip install psycopg2-binary")
    sys.exit(1)

# Reuse the SAME parser the scrapers use so the two never drift.
try:
    from scrapers.vehicle_parser import parse_vehicle_fields, VEHICLE_CATEGORIES
except ImportError:
    # Container layout: package rooted at /app as `app`.
    sys.path.insert(0, "/")
    from app.scrapers.vehicle_parser import (  # noqa: F401
        parse_vehicle_fields, VEHICLE_CATEGORIES,
    )

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL. Set DATABASE_URL env var.")
    sys.exit(1)

ACTIVE_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "SUSPENDIDA")
DONE_MARKER = "/data/dnksubastas-deploy/scheduler-logs/backfill_vehicle_fields.done"

# Vehicle categories as stored in the DB (display spelling, accent-bearing).
# Membership test is accent/case-insensitive via the parser's VEHICLE_CATEGORIES
# set, so we pass the raw category column straight through parse-time. For the
# SQL pre-filter we use a broad ILIKE-friendly list to keep the scan small.
DB_VEHICLE_CATEGORIES = (
    "Turismos", "Motocicletas", "Camiones", "Vehículos Industriales",
    "Barcos", "Embarcaciones", "Aeronaves", "Otros vehículos",
)


def run_backfill(dry_run=False, include_finished=False, limit=None):
    logger.info("Connecting to Postgres...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Status predicate. enum-cast lesson (a01890a): status is the Postgres enum
    # "AuctionStatus"; bind the active list as "AuctionStatus"[] so the = ANY
    # operator resolves (no text-vs-enum operator exists).
    if include_finished:
        status_pred = "TRUE"
        logger.info("Scope: ALL vehicle rows (active + finished).")
    else:
        status_pred = 'status = ANY(%(statuses)s::"AuctionStatus"[])'
        logger.info(f"Scope: ACTIVE vehicle rows only {ACTIVE_STATUSES}.")

    # category filter — only vehicle rows ever enter the scan.
    cat_pred = "category = ANY(%(cats)s)"

    base_params = {
        "statuses": list(ACTIVE_STATUSES),
        "cats": list(DB_VEHICLE_CATEGORIES),
    }

    cur.execute(
        f'SELECT COUNT(*) FROM "Auction" WHERE {cat_pred} AND {status_pred}',
        base_params,
    )
    total = cur.fetchone()[0]
    logger.info(f"Total vehicle rows in scope: {total:,}")

    BATCH = 2000
    last_id = ""
    scanned = 0
    make_set = 0
    model_set = 0
    year_set = 0
    any_set = 0          # rows getting at least one of the three
    full_set = 0         # rows getting all three (make+model+year)
    nothing = 0          # vehicle rows we couldn't parse anything from
    by_source = {}       # auctionType -> [scanned, make, model, year, any]
    samples = []

    while True:
        params = dict(base_params)
        params["last_id"] = last_id
        params["lim"] = BATCH
        cur.execute(
            f'''
            SELECT id, "boeId", "auctionType", category, title,
                   "lotDescription", "propertyDescription",
                   "vehicleMake", "vehicleModel", "vehicleYear"
            FROM "Auction"
            WHERE {cat_pred} AND {status_pred} AND id > %(last_id)s
            ORDER BY id
            LIMIT %(lim)s
            ''',
            params,
        )
        rows = cur.fetchall()
        if not rows:
            break

        updates = []  # (make_or_None, model_or_None, year_or_None, id)

        for (rid, boe_id, atype, category, title,
             lot_desc, prop_desc, cur_make, cur_model, cur_year) in rows:
            scanned += 1
            src = atype or "UNKNOWN"
            agg = by_source.setdefault(src, [0, 0, 0, 0, 0])
            agg[0] += 1

            desc = lot_desc or prop_desc
            vf = parse_vehicle_fields(title, desc)

            make = vf["make"]
            model = vf["model"]
            year = vf["year"]

            # honest-NULL: only WRITE a freshly-parsed value; COALESCE in the
            # UPDATE keeps the existing column when the parse yielded None.
            wrote_any = False
            if make is not None:
                make_set += 1
                agg[1] += 1
                wrote_any = True
            if model is not None:
                model_set += 1
                agg[2] += 1
                wrote_any = True
            if year is not None:
                year_set += 1
                agg[3] += 1
                wrote_any = True

            if wrote_any:
                any_set += 1
                agg[4] += 1
                if make is not None and model is not None and year is not None:
                    full_set += 1
                if len(samples) < 25:
                    samples.append(
                        f"{boe_id} [{category}] -> make={make!r} "
                        f"model={model!r} year={year!r}"
                    )
                updates.append((make, model, year, rid))
            else:
                nothing += 1

        last_id = rows[-1][0]

        if updates and not dry_run:
            psycopg2.extras.execute_batch(
                cur,
                '''
                UPDATE "Auction"
                SET "vehicleMake"  = COALESCE(%s, "vehicleMake"),
                    "vehicleModel" = COALESCE(%s, "vehicleModel"),
                    "vehicleYear"  = COALESCE(%s, "vehicleYear"),
                    "updatedAt"    = NOW()
                WHERE id = %s
                ''',
                updates,
                page_size=500,
            )
            conn.commit()

        if limit and scanned >= limit:
            logger.info(f"--limit {limit} reached, stopping.")
            break

    logger.info("=" * 64)
    logger.info("Vehicle make/model/year backfill complete")
    logger.info(f"  Vehicle rows scanned:          {scanned:,}")
    logger.info(f"  Rows with make parsed:         {make_set:,}")
    logger.info(f"  Rows with model parsed:        {model_set:,}")
    logger.info(f"  Rows with year parsed:         {year_set:,}")
    logger.info(f"  Rows with >=1 field (any):     {any_set:,}")
    logger.info(f"  Rows with all three:           {full_set:,}")
    logger.info(f"  Rows parsed nothing (honest):  {nothing:,}")
    logger.info("  Per source [scanned | make | model | year | any]:")
    for src in sorted(by_source):
        a = by_source[src]
        logger.info(f"    {src:<12} {a[0]:>7,} | {a[1]:>6,} | {a[2]:>6,} "
                    f"| {a[3]:>6,} | {a[4]:>6,}")
    if samples:
        logger.info("  Sample parses:")
        for s in samples:
            logger.info(f"    {s}")
    if dry_run:
        logger.info("  (DRY RUN — nothing written)")

    cur.close()
    conn.close()

    if not dry_run:
        try:
            os.makedirs(os.path.dirname(DONE_MARKER), exist_ok=True)
            with open(DONE_MARKER, "w") as f:
                f.write(
                    f"scanned={scanned} make={make_set} model={model_set} "
                    f"year={year_set} any={any_set} full={full_set} "
                    f"nothing={nothing}\n"
                )
            logger.info(f"Done-marker written: {DONE_MARKER}")
        except OSError as e:
            logger.warning(f"Could not write done-marker ({e}) — non-fatal.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--include-finished", action="store_true",
                    help="also process finished/CONCLUIDA vehicle rows (big)")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    if args.dry_run:
        logger.info("DRY RUN mode — no changes will be written")
    run_backfill(
        dry_run=args.dry_run,
        include_finished=args.include_finished,
        limit=args.limit,
    )
