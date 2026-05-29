#!/usr/bin/env python3
"""
Backfill map-pinpoint images for recent property auctions.

Updates imageUrl for property auctions from the last 30 days that have
coordinates, using the same static OpenStreetMap URL format as frontend.
"""

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "database" / "prod.db"

PROPERTY_CATEGORIES = [
    "Viviendas",
    "Locales",
    "Garajes",
    "Trasteros",
    "Terrenos",
    "Fincas rústicas",
    "Naves industriales",
    "Otros inmuebles",
]

ZOOM_LEVELS = {
    "Viviendas": 18,
    "Locales": 18,
    "Garajes": 19,
    "Terrenos": 16,
    "Fincas rústicas": 15,
    "Naves industriales": 17,
}


def get_zoom(category: str) -> int:
    return ZOOM_LEVELS.get(category, 17)


def generate_map_image_url(latitude: float, longitude: float, zoom: int) -> str:
    return (
        "https://staticmap.openstreetmap.de/staticmap.php"
        f"?center={latitude},{longitude}"
        f"&zoom={zoom}"
        "&size=800x600"
        "&maptype=mapnik"
        f"&markers={latitude},{longitude},red-pushpin"
    )


def run() -> int:
    cutoff = (datetime.now() - timedelta(days=30)).isoformat()
    conn = sqlite3.connect(DB_PATH)
    updated = 0

    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT id, category, latitude, longitude
            FROM Auction
            WHERE category IN ({",".join(["?"] * len(PROPERTY_CATEGORIES))})
              AND COALESCE(publishedAt, createdAt, updatedAt) >= ?
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            """,
            [*PROPERTY_CATEGORIES, cutoff],
        )
        rows = cursor.fetchall()

        for auction_id, category, latitude, longitude in rows:
            if latitude is None or longitude is None:
                continue
            zoom = get_zoom(category or "")
            image_url = generate_map_image_url(latitude, longitude, zoom)
            cursor.execute(
                """
                UPDATE Auction
                SET imageUrl = ?, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (image_url, auction_id),
            )
            updated += 1

        conn.commit()
        return updated
    finally:
        conn.close()


if __name__ == "__main__":
    count = run()
    print(f"Updated map-pinpoint images for {count} recent property auctions.")
