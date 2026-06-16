#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Continuous geocoding worker for active/pre auctions.

Honours DATABASE_URL env (Postgres in prod). Falls back to local SQLite
prod.db ONLY when DATABASE_URL is unset — previous version hardcoded the
SQLite path and silently no-op'd against the dev DB while production
(Postgres) saw zero writes.

Run on the server (continuous worker):
  docker compose exec dnksubastas-app python /app/scripts/run_geocode_active_pre.py
or pin DATABASE_URL inline:
  DATABASE_URL=postgresql://... python scripts/run_geocode_active_pre.py

ONE-SHOT BACKFILL (poison-pill unjam, 2026-06-16):
  docker compose exec dnksubastas-scheduler python /app/scripts/run_geocode_active_pre.py --once
  * Walks EVERY active/pre NULL-coord address row once (not just a LIMIT batch),
    bounded — drains to empty then exits, instead of looping forever.
  * Honours the same selection the drain now uses: cooldown (skip rows attempted
    < 7 days ago) + ORDER BY geocodeAttemptedAt NULLS FIRST, and stamps
    geocodeAttemptedAt = now() on EVERY attempt (hit OR miss) via _stamp().
  * Idempotent + safe to re-run: a second run only re-touches rows that are
    still NULL-coord AND past their 7-day cooldown.
  * Prints a scanned / geocoded / failed / precision summary at the end.
  * ~483 backlog rows × ~1.1s Nominatim rate limit ≈ 9 min.
  Requires DATABASE_URL set in the container env (Postgres).
"""

import os
import time
import sys
import argparse
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scraper.database.adapter import DatabaseAdapter  # noqa: E402
from scraper.services.geocoding_service import GeocodingService  # noqa: E402
from scraper.tasks.backfill_tasks import _stamp  # noqa: E402

# Selection: NULL-coord active/pre rows WITH an address, past their 7-day
# attempt cooldown, never-tried first. Mirrors geocode_missing_coordinates so
# the worker and the drain agree (no poison re-selection).
PG_QUERY = """
    SELECT "boeId", address, province, municipality
    FROM "Auction"
    WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA')
      AND latitude IS NULL
      AND longitude IS NULL
      AND address IS NOT NULL
      AND ("geocodeAttemptedAt" IS NULL
           OR "geocodeAttemptedAt" < now() - interval '7 days')
    ORDER BY "geocodeAttemptedAt" ASC NULLS FIRST
    LIMIT %s
"""
SQLITE_QUERY = """
    SELECT boeId, address, province, municipality
    FROM Auction
    WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA')
      AND latitude IS NULL
      AND longitude IS NULL
      AND address IS NOT NULL
      AND (geocodeAttemptedAt IS NULL
           OR geocodeAttemptedAt < datetime('now', '-7 days'))
    ORDER BY geocodeAttemptedAt ASC
    LIMIT ?
"""


def _connect():
    env_url = os.getenv("DATABASE_URL", "").strip()
    if env_url and ("postgres" in env_url):
        print("Geocoding worker started (Postgres via DATABASE_URL)", flush=True)
        return DatabaseAdapter(database_url=env_url), True
    db_path = PROJECT_ROOT / "data" / "database" / "prod.db"
    print(
        f"WARNING: DATABASE_URL not set — falling back to SQLite at {db_path}. "
        f"Prod is Postgres; this WILL silently no-op against the production DB.",
        flush=True,
    )
    return DatabaseAdapter(database_url=f"file:{db_path.as_posix()}"), False


def _geocode_one(db, geocoder, auction):
    """Geocode + stamp one row. Returns the precision label on hit, else None."""
    boe_id = auction.get("boeId") or auction.get("boeid")
    try:
        result = geocoder.geocode_address_detailed(
            auction["address"], auction["province"], auction.get("municipality"),
        )
    except Exception as e:
        # Stamp so a row that throws can't jam the head of the queue.
        try:
            db.update_auction(boe_id, _stamp(db, boe_id, {}))
        except Exception:
            pass
        print(f"Geocoding error {boe_id}: {e}", flush=True)
        return None

    if result:
        db.update_auction(boe_id, _stamp(db, boe_id, {
            "latitude": result.latitude,
            "longitude": result.longitude,
        }))
        print(
            f"Geocoded [{result.location_type}] {boe_id} -> "
            f"({result.latitude}, {result.longitude})",
            flush=True,
        )
        return result.location_type

    # Miss: stamp so the cooldown advances the queue past this poison row.
    db.update_auction(boe_id, _stamp(db, boe_id, {}))
    print(f"Geocoding failed: {boe_id}", flush=True)
    return None


def run_once(db, is_pg, geocoder, max_rows=None):
    """
    Bounded one-shot backfill: drain the active/pre NULL-coord address backlog to
    empty (respecting cooldown), stamping every attempt, then exit. Idempotent.
    """
    query = PG_QUERY if is_pg else SQLITE_QUERY
    scanned = success = failed = 0
    precision: dict = {}
    print("One-shot geocode backfill: draining active/pre backlog...", flush=True)

    while True:
        if max_rows is not None and scanned >= max_rows:
            print(f"Reached max_rows={max_rows}; stopping.", flush=True)
            break
        rows = db.query_auctions(query, (1,))
        if not rows:
            break  # backlog drained (within cooldown)
        scanned += 1
        label = _geocode_one(db, geocoder, rows[0])
        if label is not None:
            success += 1
            precision[label] = precision.get(label, 0) + 1
        else:
            failed += 1
        time.sleep(1.1)  # Nominatim rate limit (load-bearing, single-threaded)

    print(
        f"\nOne-shot backfill complete: scanned={scanned} geocoded={success} "
        f"failed={failed} precision={precision}",
        flush=True,
    )
    return {"scanned": scanned, "geocoded": success, "failed": failed, "precision": precision}


def run_forever(db, is_pg, geocoder):
    """Original continuous worker — one row at a time, sleeps when drained."""
    query = PG_QUERY if is_pg else SQLITE_QUERY
    success = failed = 0
    precision: dict = {}
    idle_loops = 0
    while True:
        auctions = db.query_auctions(query, (1,))
        if not auctions:
            idle_loops += 1
            if idle_loops % 30 == 1:
                print(
                    f"No active/pre auctions need geocoding "
                    f"(success={success} failed={failed} precision={precision})",
                    flush=True,
                )
            time.sleep(2)
            continue
        idle_loops = 0
        label = _geocode_one(db, geocoder, auctions[0])
        if label is not None:
            success += 1
            precision[label] = precision.get(label, 0) + 1
        else:
            failed += 1
        time.sleep(1.1)  # match the drain's Nominatim rate limit


def main():
    parser = argparse.ArgumentParser(description="Geocode active/pre auctions.")
    parser.add_argument(
        "--once", action="store_true",
        help="Bounded one-shot: drain the backlog to empty (or --max rows), then exit.",
    )
    parser.add_argument(
        "--max", type=int, default=None,
        help="Cap rows processed in --once mode (default: drain to empty).",
    )
    args = parser.parse_args()

    db, is_pg = _connect()
    geocoder = GeocodingService()

    if args.once:
        run_once(db, is_pg, geocoder, max_rows=args.max)
    else:
        run_forever(db, is_pg, geocoder)


if __name__ == "__main__":
    main()
