#!/usr/bin/env python3
"""
Geocode backfill for the address-but-no-coords backlog (ALL statuses).

Closes the gap left by the active-only geocode cron: ~11,839 rows (≈11,730
finished/CONCLUIDA + 109 CANCELADA + tail) carry a real `address` but NULL
latitude/longitude, so they render with NO map pin. This one-shot runner
geocodes every such row via the EXISTING GeocodingService (Google backend,
Spain-locked, in-memory dedupe cache, location_type precision) and writes the
real lat/lng back. Active rows are already ~100% pinned by the cron; this
sweeps the finished tail the cron never touched.

Reuses services.geocoding_service.GeocodingService verbatim — NO geocoding
logic is reimplemented here, so the cron and the backfill can never drift.

Confidence handling (per Dennis ruling, mirrors the cron): KEEP APPROXIMATE
(town-centroid) results — a nearby pin beats no pin. We store coords for ANY
GeocodeResult (ROOFTOP / RANGE_INTERPOLATED / GEOMETRIC_CENTER / APPROXIMATE);
we only skip on a hard miss (ZERO_RESULTS / network / REQUEST_DENIED), which
the service surfaces as None. We NEVER fabricate an `address` — coords only.

Idempotent + resumable:
  - selects only rows with address present AND coords NULL, so a re-run skips
    everything already pinned.
  - id-cursor pagination (stable under in-place UPDATEs, no OFFSET skipping).
  - writes lat/lng per row immediately and commits per page, so an interrupted
    run resumes from where it stopped (just re-run it).

NO migration (latitude/longitude columns already exist). Reads DATABASE_URL —
must be Postgres (prod). SCHEDULER-IMAGE script; Ken runs it after rebuild.

Run detached on the scheduler container (workdir /app):
  python3 -u backfill_geocode_finished.py --dry-run     # count + preview, no writes
  python3 -u backfill_geocode_finished.py               # geocode the whole backlog
  python3 -u backfill_geocode_finished.py --limit 200   # cap rows (testing)

Flags:
  --dry-run     count the backlog and preview the geocode string, write nothing
  --limit N     cap rows scanned (testing)
  --batch N     id-cursor page size (default 500)
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

# Reuse the SAME geocoder the cron uses so the two never drift.
try:
    from services.geocoding_service import GeocodingService
except ImportError:
    sys.path.insert(0, "/")
    from app.services.geocoding_service import GeocodingService  # type: ignore

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL. Set DATABASE_URL env var.")
    sys.exit(1)

DONE_MARKER = "/data/dnksubastas-deploy/scheduler-logs/backfill_geocode_finished.done"

# Backlog predicate — address present AND coords NULL, ALL statuses.
# Mirrors the cron's geocode_missing_coordinates filter (latitude IS NULL AND
# longitude IS NULL AND address IS NOT NULL) plus a non-empty-address guard so
# we never feed a blank string to Google.
BACKLOG_WHERE = (
    'latitude IS NULL '
    'AND longitude IS NULL '
    'AND address IS NOT NULL '
    "AND length(trim(address)) > 0"
)


def run_backfill(dry_run=False, limit=None, batch=500):
    logger.info("Connecting to Postgres...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Report which host we hit (the brief asks for it).
    try:
        cur.execute("SELECT inet_server_addr(), current_database()")
        host, dbname = cur.fetchone()
        logger.info(f"Connected to DB '{dbname}' on host {host}")
    except Exception:
        logger.info("Connected (host introspection unavailable)")

    cur.execute(f'SELECT COUNT(*) FROM "Auction" WHERE {BACKLOG_WHERE}')
    total = cur.fetchone()[0]
    logger.info(f"Geocodable backlog (address present, coords NULL, ALL statuses): {total:,}")
    if limit:
        logger.info(f"--limit {limit}: will scan at most {limit:,} rows")

    geocoder = GeocodingService()

    last_id = ""
    scanned = 0
    geocoded = 0
    failed = 0
    precision = {}  # location_type -> count
    failed_ids = []

    while True:
        page = batch
        if limit is not None:
            remaining = limit - scanned
            if remaining <= 0:
                break
            page = min(batch, remaining)

        cur.execute(
            f'''
            SELECT id, "boeId", address, province, municipality
            FROM "Auction"
            WHERE {BACKLOG_WHERE} AND id > %(last_id)s
            ORDER BY id
            LIMIT %(lim)s
            ''',
            {"last_id": last_id, "lim": page},
        )
        rows = cur.fetchall()
        if not rows:
            break

        for (rid, boe_id, address, province, municipality) in rows:
            scanned += 1
            last_id = rid

            if dry_run:
                # Preview the geocode string the service would build; no call.
                preview = geocoder._build_full_address(
                    address, province or "", municipality or None
                )
                if scanned <= 10:
                    logger.info(f"  [dry] {boe_id}: '{preview}'")
                continue

            try:
                result = geocoder.geocode_address_detailed(
                    address, province or "", municipality or None
                )
            except Exception as e:
                logger.error(f"Error geocoding {boe_id}: {e}")
                failed += 1
                if len(failed_ids) < 500:
                    failed_ids.append(boe_id)
                continue

            if result is None:
                failed += 1
                if len(failed_ids) < 500:
                    failed_ids.append(boe_id)
                continue

            # KEEP APPROXIMATE — store coords for any precision. Coords only,
            # never an address (hard rule). Keyed by id (stable).
            cur.execute(
                'UPDATE "Auction" SET latitude = %s, longitude = %s WHERE id = %s',
                (result.latitude, result.longitude, rid),
            )
            geocoded += 1
            precision[result.location_type] = precision.get(result.location_type, 0) + 1

        # Commit per page so an interrupt is resumable from the next id.
        if not dry_run:
            conn.commit()
            logger.info(
                f"  ...page committed: scanned={scanned:,} geocoded={geocoded:,} "
                f"failed={failed:,} (last_id={last_id})"
            )

    logger.info("=" * 64)
    logger.info("Geocode finished-backlog backfill complete")
    logger.info(f"  Rows scanned:   {scanned:,}")
    logger.info(f"  Geocoded:       {geocoded:,}")
    logger.info(f"  Failed (miss):  {failed:,}")
    logger.info(f"  Precision breakdown (location_type):")
    for lt in ("ROOFTOP", "RANGE_INTERPOLATED", "GEOMETRIC_CENTER", "APPROXIMATE"):
        logger.info(f"    {lt:<20} {precision.get(lt, 0):,}")
    other = {k: v for k, v in precision.items()
             if k not in ("ROOFTOP", "RANGE_INTERPOLATED", "GEOMETRIC_CENTER", "APPROXIMATE")}
    if other:
        logger.info(f"    other:               {other}")
    if dry_run:
        logger.info("  (DRY RUN — nothing written)")

    if failed_ids:
        logger.info(f"Failed to geocode (first {len(failed_ids)} boeIds — bad address / "
                    f"ZERO_RESULTS / network):")
        logger.info("  " + ", ".join(failed_ids[:50]))

    # Remaining backlog after the run (should approach 0 minus genuine misses).
    if not dry_run:
        cur.execute(f'SELECT COUNT(*) FROM "Auction" WHERE {BACKLOG_WHERE}')
        remaining = cur.fetchone()[0]
        logger.info(f"  Remaining backlog (address, coords NULL): {remaining:,}")

    cur.close()
    conn.close()

    # Done-marker (Ken/Niki watch pattern).
    if not dry_run:
        try:
            os.makedirs(os.path.dirname(DONE_MARKER), exist_ok=True)
            with open(DONE_MARKER, "w") as f:
                f.write(
                    f"scanned={scanned} geocoded={geocoded} failed={failed} "
                    f"precision={precision}\n"
                )
            logger.info(f"Done-marker written: {DONE_MARKER}")
        except OSError as e:
            logger.warning(f"Could not write done-marker ({e}) — non-fatal.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="count the backlog + preview geocode strings, write nothing")
    ap.add_argument("--limit", type=int, default=None,
                    help="cap rows scanned (testing)")
    ap.add_argument("--batch", type=int, default=500,
                    help="id-cursor page size (default 500)")
    args = ap.parse_args()
    if args.dry_run:
        logger.info("DRY RUN mode — no changes will be written")
    run_backfill(dry_run=args.dry_run, limit=args.limit, batch=args.batch)
