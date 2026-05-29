"""
Enrich Auctions with Google Maps URLs and Street View Screenshots
Completely free - no API keys required
"""

import sqlite3
import sys
import time
import asyncio
from pathlib import Path
from typing import Optional
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.maps_url_generator import GoogleMapsUrlGenerator
from lib.street_view_screenshotter import StreetViewScreenshotter


class MapsEnricher:
    """
    Enrich auctions with:
    1. Google Maps URLs (free, no API)
    2. Street View screenshots (free, using Playwright)
    """
    
    def __init__(self, db_path: str = 'data/database/prod.db'):
        """
        Initialize enricher.
        
        Args:
            db_path: Path to SQLite database
        """
        self.db_path = db_path
        self.url_generator = GoogleMapsUrlGenerator()
        self.screenshotter = StreetViewScreenshotter()
    
    def enrich_auction_urls(
        self,
        auction_id: str,
        latitude: Optional[float],
        longitude: Optional[float],
        address: Optional[str],
        municipality: Optional[str],
        province: Optional[str]
    ) -> dict:
        """
        Generate all Google Maps URLs for an auction.
        
        Args:
            auction_id: Auction ID
            latitude: Location latitude
            longitude: Location longitude
            address: Street address
            municipality: Municipality name
            province: Province name
            
        Returns:
            Dictionary with URL fields
        """
        urls = self.url_generator.generate_all_urls(
            latitude=latitude,
            longitude=longitude,
            address=address,
            municipality=municipality,
            province=province
        )
        
        return {
            'id': auction_id,
            'mapUrl': urls.get('mapUrl', ''),
            'streetViewUrl': urls.get('streetViewUrl', ''),
            'placeUrl': urls.get('placeUrl', ''),
            'directionsUrl': urls.get('directionsUrl', '')
        }
    
    async def enrich_auction_image(
        self,
        auction_id: str,
        latitude: float,
        longitude: float,
        current_image_url: Optional[str],
        category: str
    ) -> Optional[str]:
        """
        Generate Street View screenshot for property auctions.
        Only for real estate categories.
        
        Args:
            auction_id: Auction ID
            latitude: Location latitude
            longitude: Location longitude
            current_image_url: Current image URL (if any)
            category: Auction category
            
        Returns:
            Path to screenshot or None
        """
        # Only generate for real estate without existing image
        real_estate_categories = [
            'Viviendas', 'Locales', 'Garajes', 'Terrenos', 'Solares',
            'Fincas rústicas', 'Naves industriales', 'Trasteros'
        ]
        
        if category not in real_estate_categories:
            return None
        
        # Skip if already has a Street View image
        if current_image_url and 'street_view' in str(current_image_url):
            print(f"  Already has Street View image")
            return current_image_url
        
        # Generate screenshot
        try:
            screenshot_path = await self.screenshotter.capture_best_angle(
                latitude, longitude, title=auction_id
            )
            return screenshot_path
        except Exception as e:
            print(f"  ❌ Error generating screenshot: {str(e)}")
            return None
    
    def update_auction_urls(self, conn: sqlite3.Connection, auction_data: dict):
        """
        Update auction with generated URLs.
        
        Args:
            conn: Database connection
            auction_data: Dictionary with auction data including URLs
        """
        conn.execute("""
            UPDATE Auction
            SET mapUrl = ?,
                streetViewUrl = ?,
                placeUrl = ?,
                directionsUrl = ?
            WHERE id = ?
        """, (
            auction_data['mapUrl'],
            auction_data['streetViewUrl'],
            auction_data['placeUrl'],
            auction_data['directionsUrl'],
            auction_data['id']
        ))
    
    def update_auction_image(self, conn: sqlite3.Connection, auction_id: str, image_path: str):
        """
        Update auction with Street View screenshot.
        
        Args:
            conn: Database connection
            auction_id: Auction ID
            image_path: Path to screenshot
        """
        # Store relative path
        relative_path = str(Path(image_path).relative_to(Path.cwd()))
        conn.execute("""
            UPDATE Auction
            SET imageUrl = ?
            WHERE id = ?
        """, (relative_path, auction_id))
    
    async def enrich_all_auctions(
        self,
        limit: Optional[int] = None,
        only_missing: bool = True,
        generate_images: bool = False
    ):
        """
        Enrich all auctions with maps URLs and optionally Street View images.
        
        Args:
            limit: Optional limit on number of auctions to process
            only_missing: Only process auctions without mapUrl
            generate_images: Whether to generate Street View screenshots
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        
        # Query for auctions that need enrichment
        if only_missing:
            query = """
                SELECT id, latitude, longitude, address, municipality, province, 
                       category, imageUrl, status
                FROM Auction
                WHERE mapUrl IS NULL 
                  AND (latitude IS NOT NULL OR address IS NOT NULL OR province IS NOT NULL)
                ORDER BY createdAt DESC
            """
        else:
            query = """
                SELECT id, latitude, longitude, address, municipality, province,
                       category, imageUrl, status
                FROM Auction
                WHERE (latitude IS NOT NULL OR address IS NOT NULL OR province IS NOT NULL)
                ORDER BY createdAt DESC
            """
        
        if limit:
            query += f" LIMIT {limit}"
        
        cursor = conn.cursor()
        auctions = cursor.execute(query).fetchall()
        
        total = len(auctions)
        print(f"\nStarting enrichment for {total} auctions...")
        print(f"   URLs: YES")
        print(f"   Images: {'YES' if generate_images else 'NO'}\n")
        
        updated_count = 0
        images_generated = 0
        start_time = time.time()
        
        for i, auction in enumerate(auctions, 1):
            print(f"[{i}/{total}] Processing: {auction['id']}")
            if auction['latitude'] and auction['longitude']:
                print(f"  Location: {auction['latitude']:.6f}, {auction['longitude']:.6f}")
            else:
                print(f"  Location: {auction['address'] or auction['municipality'] or auction['province'] or 'Unknown'}")
            print(f"  Category: {auction['category']}")
            
            # Generate URLs
            auction_data = self.enrich_auction_urls(
                auction['id'],
                auction['latitude'],
                auction['longitude'],
                auction['address'],
                auction['municipality'],
                auction['province']
            )
            
            print(f"  Generated URLs:")
            print(f"     Map: {auction_data['mapUrl'][:60]}...")
            print(f"     Street View: {auction_data['streetViewUrl'][:60]}...")
            
            # Update URLs in database
            self.update_auction_urls(conn, auction_data)
            updated_count += 1
            
            # Generate Street View image if requested
            if generate_images and auction['status'] in ['active', 'pre-auction']:
                image_path = await self.enrich_auction_image(
                    auction['id'],
                    auction['latitude'],
                    auction['longitude'],
                    auction['imageUrl'],
                    auction['category']
                )
                
                if image_path:
                    self.update_auction_image(conn, auction['id'], image_path)
                    images_generated += 1
                    print(f"  Image: {image_path}")
                
                # Rate limiting for screenshots
                await asyncio.sleep(2)
            
            # Commit every 10 auctions
            if i % 10 == 0:
                conn.commit()
                elapsed = time.time() - start_time
                if elapsed > 0:
                    rate = i / elapsed
                    remaining = (total - i) / rate if rate > 0 else 0
                    print(f"  Progress: {i}/{total} ({i/total*100:.1f}%) - ETA: {remaining/60:.1f}min\n")
                else:
                    print(f"  Progress: {i}/{total} ({i/total*100:.1f}%)\n")
        
        # Final commit
        conn.commit()
        conn.close()
        
        elapsed = time.time() - start_time
        print(f"\nEnrichment complete!")
        print(f"   URLs updated: {updated_count}")
        print(f"   Images generated: {images_generated}")
        print(f"   Time taken: {elapsed/60:.1f} minutes")
        if elapsed > 0:
            print(f"   Rate: {updated_count/elapsed:.1f} auctions/second")


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Enrich auctions with Google Maps data')
    parser.add_argument('--limit', type=int, help='Limit number of auctions to process')
    parser.add_argument('--all', action='store_true', help='Process all auctions (not just missing)')
    parser.add_argument('--images', action='store_true', help='Generate Street View screenshots')
    parser.add_argument('--db', type=str, default='data/database/prod.db', help='Database path')
    
    args = parser.parse_args()
    
    enricher = MapsEnricher(db_path=args.db)
    
    await enricher.enrich_all_auctions(
        limit=args.limit,
        only_missing=not args.all,
        generate_images=args.images
    )


if __name__ == '__main__':
    asyncio.run(main())
