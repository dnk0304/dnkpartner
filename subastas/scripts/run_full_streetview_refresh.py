#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Geocode missing coordinates and refresh Street View screenshots
for active and pre-auction items.
"""

import sys
import sqlite3
import time
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from scraper.database.adapter import DatabaseAdapter
from scraper.services.geocoding_service import GeocodingService
from scripts.run_streetview_backfill import run as run_streetview_backfill


DB_PATH = project_root / "data" / "database" / "prod.db"


def count_missing():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COUNT(1)
        FROM Auction
        WHERE status IN ('ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA')
          AND (latitude IS NULL OR longitude IS NULL)
        """
    )
    missing_coords = cur.fetchone()[0]
    cur.execute(
        """
        SELECT COUNT(1)
        FROM Auction
        WHERE status IN ('ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA')
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND (streetViewUrl IS NULL OR streetViewUrl = '')
        """
    )
    missing_street = cur.fetchone()[0]
    conn.close()
    return missing_coords, missing_street


def geocode_batch(batch_size: int = 100):
    db = DatabaseAdapter()
    geocoder = GeocodingService()
    query = """
        SELECT boeId, address, province, municipality
        FROM Auction
        WHERE status IN ('ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA')
          AND (latitude IS NULL OR longitude IS NULL)
          AND address IS NOT NULL
        LIMIT ?
    """
    auctions = db.query_auctions(query, (batch_size,))
    if not auctions:
        return 0

    geocoded = 0
    for auction in auctions:
        coords = geocoder.geocode_address(
            auction['address'],
            auction['province'],
            auction.get('municipality')
        )
        if coords:
            lat, lng = coords
            db.update_auction_coordinates(auction['boeId'], lat, lng)
            geocoded += 1
    return geocoded


def main(max_geocode_batches: int = 30, max_street_batches: int = 30, batch_size: int = 100):
    print("=== Street View Refresh ===")
    missing_coords, missing_street = count_missing()
    print(f"missing_coords: {missing_coords} | missing_streetview: {missing_street}")

    geocode_batches = 0
    while missing_coords > 0 and geocode_batches < max_geocode_batches:
        print(f"Geocode batch {geocode_batches + 1}/{max_geocode_batches}...")
        geocode_batch(batch_size=batch_size)
        geocode_batches += 1
        missing_coords, missing_street = count_missing()
        print(f"missing_coords: {missing_coords} | missing_streetview: {missing_street}")
        if missing_coords == 0:
            break
        time.sleep(2)

    street_batches = 0
    while missing_street > 0 and street_batches < max_street_batches:
        print(f"Street View batch {street_batches + 1}/{max_street_batches}...")
        run_streetview_backfill(batch_size=batch_size)
        street_batches += 1
        missing_coords, missing_street = count_missing()
        print(f"missing_coords: {missing_coords} | missing_streetview: {missing_street}")
        if missing_street == 0:
            break
        time.sleep(2)

    print("Done.")


if __name__ == "__main__":
    main()
