#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Continuous geocoding worker for active/pre auctions.
Processes 1 item at a time with a 2s delay.
"""

import time
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scraper.database.adapter import DatabaseAdapter  # noqa: E402
from scraper.services.geocoding_service import GeocodingService  # noqa: E402


def main():
    print("Geocoding worker started (active/pre only)", flush=True)
    db_path = PROJECT_ROOT / "data" / "database" / "prod.db"
    db = DatabaseAdapter(database_url=f"file:{db_path.as_posix()}")
    geocoder = GeocodingService()

    while True:
        auctions = db.query_auctions(
            """
            SELECT boeId, address, province, municipality
            FROM Auction
            WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA')
              AND latitude IS NULL
              AND longitude IS NULL
              AND address IS NOT NULL
            LIMIT 1
            """
        )

        if not auctions:
            print("No active/pre auctions need geocoding", flush=True)
            time.sleep(2)
            continue

        auction = auctions[0]
        coords = geocoder.geocode_address(
            auction["address"],
            auction["province"],
            auction.get("municipality"),
        )
        if coords:
            lat, lng = coords
            db.update_auction(auction["boeId"], {"latitude": lat, "longitude": lng})
            print(f"Geocoded 1 auction: {auction['boeId']}", flush=True)
        else:
            print(f"Geocoding failed: {auction['boeId']}", flush=True)

        time.sleep(2)


if __name__ == "__main__":
    main()
