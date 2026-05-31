#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Continuous geocoding worker for active/pre auctions.

Honours DATABASE_URL env (Postgres in prod). Falls back to local SQLite
prod.db ONLY when DATABASE_URL is unset — previous version hardcoded the
SQLite path and silently no-op'd against the dev DB while production
(Postgres) saw zero writes.

Run on the server:
  docker compose exec dnksubastas-app python /app/scripts/run_geocode_active_pre.py
or pin DATABASE_URL inline:
  DATABASE_URL=postgresql://... python scripts/run_geocode_active_pre.py
"""

import os
import time
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scraper.database.adapter import DatabaseAdapter  # noqa: E402
from scraper.services.geocoding_service import GeocodingService  # noqa: E402


def main():
    env_url = os.getenv("DATABASE_URL", "").strip()
    if env_url and ("postgres" in env_url):
        print(f"Geocoding worker started (Postgres via DATABASE_URL)", flush=True)
        db = DatabaseAdapter(database_url=env_url)
        is_pg = True
    else:
        db_path = PROJECT_ROOT / "data" / "database" / "prod.db"
        print(
            f"WARNING: DATABASE_URL not set — falling back to SQLite at {db_path}. "
            f"Prod is Postgres; this WILL silently no-op against the production DB.",
            flush=True,
        )
        db = DatabaseAdapter(database_url=f"file:{db_path.as_posix()}")
        is_pg = False

    geocoder = GeocodingService()
    success = 0
    failed = 0
    precision: dict = {}

    pg_query = """
        SELECT "boeId", address, province, municipality
        FROM "Auction"
        WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA')
          AND latitude IS NULL
          AND longitude IS NULL
          AND address IS NOT NULL
        LIMIT 1
    """
    sqlite_query = """
        SELECT boeId, address, province, municipality
        FROM Auction
        WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA')
          AND latitude IS NULL
          AND longitude IS NULL
          AND address IS NOT NULL
        LIMIT 1
    """

    idle_loops = 0
    while True:
        auctions = db.query_auctions(pg_query if is_pg else sqlite_query)

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
        auction = auctions[0]
        boe_id = auction.get("boeId") or auction.get("boeid")
        result = geocoder.geocode_address_detailed(
            auction["address"],
            auction["province"],
            auction.get("municipality"),
        )
        if result:
            db.update_auction(boe_id, {
                "latitude": result.latitude,
                "longitude": result.longitude,
            })
            success += 1
            precision[result.location_type] = precision.get(result.location_type, 0) + 1
            print(
                f"Geocoded [{result.location_type}] {boe_id} -> "
                f"({result.latitude}, {result.longitude})",
                flush=True,
            )
        else:
            failed += 1
            print(f"Geocoding failed: {boe_id}", flush=True)

        time.sleep(0.5)


if __name__ == "__main__":
    main()
