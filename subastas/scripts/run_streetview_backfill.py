#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Continuous Street View backfill worker.
"""

import time
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scraper.database.adapter import DatabaseAdapter  # noqa: E402
from scraper.services.streetview_service import StreetViewService  # noqa: E402


def backfill_streetview_images(batch_size: int = 1):
    db_path = PROJECT_ROOT / "data" / "database" / "prod.db"
    print(f"Using database: {db_path} (exists={db_path.exists()})", flush=True)
    db = DatabaseAdapter(database_url=f"file:{db_path.as_posix()}")
    streetview = StreetViewService()

    total_query = "SELECT COUNT(1) as count FROM Auction"
    try:
        total_rows = db.query_auctions(total_query)[0]["count"]
        print(f"Auction rows: {total_rows}", flush=True)
    except Exception as exc:
        print(f"Failed to count auctions: {exc}", flush=True)
        return {"processed": 0, "enriched": 0, "reason": "count_failed"}

    query = """
        SELECT boeId, latitude, longitude, imageUrl, streetViewUrl, address
        FROM Auction
        WHERE status IN ('ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA')
          AND (address IS NOT NULL OR (latitude IS NOT NULL AND longitude IS NOT NULL))
          AND (streetViewUrl IS NULL OR streetViewUrl = '')
        LIMIT ?
    """
    auctions = db.query_auctions(query, (batch_size,))
    if not auctions:
        return {"processed": 0, "enriched": 0, "reason": "no_eligible"}

    enriched = 0
    for auction in auctions:
        boe_id = auction["boeId"]
        lat = auction["latitude"]
        lng = auction["longitude"]
        address = auction.get("address")
        if lat and lng:
            public_url = streetview.capture_streetview(boe_id, lat, lng)
        else:
            public_url = streetview.capture_streetview_by_address(boe_id, address or "")
        if not public_url:
            return {"processed": 1, "enriched": 0, "reason": "capture_failed"}
        update = {
            "image_url": public_url,
            "street_view_url": (
                streetview.build_streetview_url(lat, lng)
                if (lat and lng)
                else streetview.build_streetview_url_for_address(address or "")
            ),
            "map_url": (
                streetview.build_map_url(lat, lng)
                if (lat and lng)
                else streetview.build_map_url_for_address(address or "")
            ),
            "directions_url": (
                streetview.build_directions_url(lat, lng)
                if (lat and lng)
                else streetview.build_directions_url_for_address(address or "")
            ),
            "place_url": (
                streetview.build_map_url(lat, lng)
                if (lat and lng)
                else streetview.build_map_url_for_address(address or "")
            ),
        }
        db.update_auction(boe_id, update)
        enriched += 1
    return {"processed": len(auctions), "enriched": enriched}


def print_status_summary():
    db_path = PROJECT_ROOT / "data" / "database" / "prod.db"
    db = DatabaseAdapter(database_url=f"file:{db_path.as_posix()}")
    rows = db.query_auctions(
        "SELECT status, COUNT(1) as count FROM Auction GROUP BY status ORDER BY count DESC LIMIT 10"
    )
    print("Top statuses:", flush=True)
    for row in rows:
        print(f"  {row['status']}: {row['count']}", flush=True)
    eligible = db.query_auctions(
        "SELECT COUNT(1) as count FROM Auction "
        "WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA') "
        "AND (address IS NOT NULL OR (latitude IS NOT NULL AND longitude IS NOT NULL)) "
        "AND (streetViewUrl IS NULL OR streetViewUrl = '')"
    )[0]["count"]
    print(f"Eligible for streetview: {eligible}", flush=True)
    with_coords = db.query_auctions(
        "SELECT COUNT(1) as count FROM Auction "
        "WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA') "
        "AND latitude IS NOT NULL AND longitude IS NOT NULL"
    )[0]["count"]
    print(f"Active/pre with coordinates: {with_coords}", flush=True)


def main():
    print("Street View backfill worker started", flush=True)
    print_status_summary()
    while True:
        result = backfill_streetview_images(batch_size=1)
        if result and result.get("enriched", 0) > 0:
            print(f"Enriched 1 auction (processed {result.get('processed', 0)})", flush=True)
        elif result and result.get("reason") == "no_eligible":
            print("No eligible auctions for streetview", flush=True)
        elif result and result.get("reason") == "capture_failed":
            print("Streetview capture failed for 1 auction", flush=True)
        else:
            print("No auction enriched this cycle", flush=True)
        time.sleep(2)


if __name__ == "__main__":
    main()
