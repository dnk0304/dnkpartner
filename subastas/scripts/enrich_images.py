"""
Image Enrichment Service for Auction Items

This service fetches real imagery for auctions based on their type and details:
- Property auctions: Google Maps Static API street view or satellite view
- Vehicle auctions: Make/model specific images from automotive APIs
- Boat auctions: Specific boat images based on type/model

Usage:
    python scripts/enrich_images.py --batch-size 100 --source BOE
"""

import os
import sys
import json
import time
import requests
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import sqlite3
from urllib.parse import quote

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

@dataclass
class ImageConfig:
    """Configuration for image APIs"""
    google_maps_api_key: str = os.getenv('GOOGLE_MAPS_API_KEY', '')
    mapbox_api_key: str = os.getenv('MAPBOX_API_KEY', '')
    unsplash_api_key: str = os.getenv('UNSPLASH_ACCESS_KEY', '')
    save_directory: Path = Path('data/images')


class ImageEnricher:
    """Enriches auctions with real imagery"""
    
    def __init__(self, config: ImageConfig, db_path: str = 'data/database/prod.db'):
        self.config = config
        self.db_path = db_path
        self.config.save_directory.mkdir(parents=True, exist_ok=True)
        
    def get_db_connection(self):
        """Get database connection"""
        return sqlite3.connect(self.db_path)
    
    def get_property_image_url(self, latitude: float, longitude: float, address: str) -> Optional[str]:
        """
        Get street view or satellite image for a property
        
        Priority:
        1. Google Maps Street View (if available)
        2. Google Maps Static (satellite)
        3. Mapbox Static (fallback)
        """
        if not latitude or not longitude:
            return None
            
        # Try Google Maps Street View first
        if self.config.google_maps_api_key:
            street_view_url = self._get_google_street_view(latitude, longitude)
            if street_view_url:
                return street_view_url
        
        # Fallback to satellite view
        if self.config.google_maps_api_key:
            return self._get_google_static_map(latitude, longitude)
        
        # Fallback to Mapbox
        if self.config.mapbox_api_key:
            return self._get_mapbox_static(latitude, longitude)
        
        return None
    
    def _get_google_street_view(self, lat: float, lng: float) -> Optional[str]:
        """Get Google Street View image"""
        # First check if street view is available at this location
        metadata_url = f"https://maps.googleapis.com/maps/api/streetview/metadata"
        params = {
            'location': f'{lat},{lng}',
            'key': self.config.google_maps_api_key
        }
        
        try:
            response = requests.get(metadata_url, params=params, timeout=5)
            data = response.json()
            
            if data.get('status') == 'OK':
                # Street view available - return image URL
                image_url = f"https://maps.googleapis.com/maps/api/streetview"
                image_params = {
                    'location': f'{lat},{lng}',
                    'size': '800x600',
                    'fov': 90,
                    'pitch': 0,
                    'key': self.config.google_maps_api_key
                }
                return f"{image_url}?{'&'.join([f'{k}={v}' for k, v in image_params.items()])}"
        except Exception as e:
            print(f"Error checking street view: {e}")
        
        return None
    
    def _get_google_static_map(self, lat: float, lng: float) -> str:
        """Get Google Maps Static API satellite image"""
        base_url = "https://maps.googleapis.com/maps/api/staticmap"
        params = {
            'center': f'{lat},{lng}',
            'zoom': 18,
            'size': '800x600',
            'maptype': 'satellite',
            'key': self.config.google_maps_api_key,
            'markers': f'color:red|{lat},{lng}'
        }
        return f"{base_url}?{'&'.join([f'{k}={quote(str(v))}' for k, v in params.items()])}"
    
    def _get_mapbox_static(self, lat: float, lng: float) -> str:
        """Get Mapbox Static API image"""
        # Mapbox static images: https://docs.mapbox.com/api/maps/static-images/
        return (
            f"https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/"
            f"pin-l-marker+f74e4e({lng},{lat})/{lng},{lat},16,0/800x600@2x"
            f"?access_token={self.config.mapbox_api_key}"
        )
    
    def get_vehicle_image_url(self, title: str, category: str, description: str = '') -> Optional[str]:
        """
        Get vehicle-specific image from Unsplash or automotive APIs
        
        Extract make/model from title and search for relevant images
        """
        # Extract vehicle details from title
        make_model = self._extract_vehicle_info(title, category)
        
        if not make_model:
            return None
        
        # Try Unsplash first
        if self.config.unsplash_api_key:
            return self._search_unsplash(f'{make_model} car automobile', 'landscape')
        
        return None
    
    def get_boat_image_url(self, title: str, description: str = '') -> Optional[str]:
        """Get boat-specific image"""
        boat_type = self._extract_boat_info(title)
        
        if self.config.unsplash_api_key:
            search_term = f'{boat_type} boat yacht vessel' if boat_type else 'boat yacht'
            return self._search_unsplash(search_term, 'landscape')
        
        return None
    
    def _search_unsplash(self, query: str, orientation: str = 'landscape') -> Optional[str]:
        """Search Unsplash for relevant images"""
        url = "https://api.unsplash.com/search/photos"
        headers = {'Authorization': f'Client-ID {self.config.unsplash_api_key}'}
        params = {
            'query': query,
            'per_page': 1,
            'orientation': orientation
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data['results']:
                    return data['results'][0]['urls']['regular']
        except Exception as e:
            print(f"Error searching Unsplash: {e}")
        
        return None
    
    def _extract_vehicle_info(self, title: str, category: str) -> Optional[str]:
        """Extract vehicle make/model from title"""
        # Common car brands
        brands = [
            'Audi', 'BMW', 'Mercedes', 'Volkswagen', 'Seat', 'Renault', 
            'Peugeot', 'Citroën', 'Ford', 'Opel', 'Toyota', 'Nissan', 
            'Hyundai', 'Kia', 'Fiat', 'Volvo', 'Mazda', 'Honda'
        ]
        
        title_upper = title.upper()
        for brand in brands:
            if brand.upper() in title_upper:
                return brand
        
        return None
    
    def _extract_boat_info(self, title: str) -> Optional[str]:
        """Extract boat type from title"""
        boat_types = ['velero', 'yate', 'lancha', 'catamarán', 'embarcación', 'barco']
        title_lower = title.lower()
        
        for boat_type in boat_types:
            if boat_type in title_lower:
                return boat_type
        
        return 'boat'
    
    def enrich_auction_images(self, limit: int = 100, source: Optional[str] = None):
        """
        Enrich auctions with real images
        
        Args:
            limit: Number of auctions to process
            source: Filter by official source (e.g., 'BOE', 'TEJU', 'Procuradores')
        """
        conn = self.get_db_connection()
        cursor = conn.cursor()
        
        # Query auctions without proper images
        query = """
            SELECT id, title, category, province, municipality, latitude, longitude, 
                   address, source, imageUrl
            FROM Auction
            WHERE imageUrl LIKE '%unsplash.com%' OR imageUrl IS NULL
        """
        
        if source:
            query += f" AND source = '{source}'"
        
        query += f" LIMIT {limit}"
        
        cursor.execute(query)
        auctions = cursor.fetchall()
        
        print(f"\n🎨 Enriching images for {len(auctions)} auctions...")
        
        updated_count = 0
        for auction in auctions:
            (id, title, category, province, municipality, 
             latitude, longitude, address, src, current_image) = auction
            
            new_image_url = None
            
            # Determine auction type and get appropriate image
            if category in ['Viviendas', 'Locales', 'Terrenos', 'Garajes', 'Fincas rústicas', 'Naves industriales']:
                # Property - use location-based imagery
                if latitude and longitude:
                    new_image_url = self.get_property_image_url(latitude, longitude, address or '')
            
            elif category in ['Turismos', 'Vehículos Industriales', 'Motocicletas']:
                # Vehicle - use vehicle-specific imagery
                new_image_url = self.get_vehicle_image_url(title, category)
            
            elif 'embarcación' in title.lower() or 'barco' in title.lower():
                # Boat - use boat-specific imagery
                new_image_url = self.get_boat_image_url(title)
            
            # Update database if we found a new image
            if new_image_url and new_image_url != current_image:
                try:
                    cursor.execute(
                        'UPDATE Auction SET imageUrl = ? WHERE id = ?',
                        (new_image_url, id)
                    )
                    updated_count += 1
                    print(f"  ✓ Updated {id[:12]}... - {title[:50]}")
                except Exception as e:
                    print(f"  ✗ Error updating {id}: {e}")
                
                # Rate limiting
                time.sleep(0.1)
        
        conn.commit()
        conn.close()
        
        print(f"\n✅ Successfully updated {updated_count}/{len(auctions)} auction images")


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Enrich auction images with real imagery')
    parser.add_argument('--batch-size', type=int, default=100, help='Number of auctions to process')
    parser.add_argument('--source', type=str, help='Filter by official source (e.g., BOE, TEJU, Procuradores)')
    parser.add_argument('--db', type=str, default='data/database/prod.db', help='Database path')
    
    args = parser.parse_args()
    
    # Check for API keys
    config = ImageConfig()
    
    if not any([config.google_maps_api_key, config.mapbox_api_key]):
        print("⚠️  WARNING: No map API keys found. Set GOOGLE_MAPS_API_KEY or MAPBOX_API_KEY")
        print("   Property images will not be enriched.")
    
    if not config.unsplash_api_key:
        print("⚠️  WARNING: No Unsplash API key found. Set UNSPLASH_ACCESS_KEY")
        print("   Vehicle/boat images will not be enriched.")
    
    if not any([config.google_maps_api_key, config.mapbox_api_key, config.unsplash_api_key]):
        print("\n❌ No API keys configured. Exiting.")
        print("\nTo configure API keys:")
        print("  1. Get Google Maps API key: https://console.cloud.google.com/")
        print("  2. Get Unsplash API key: https://unsplash.com/developers")
        print("  3. Set environment variables:")
        print("     export GOOGLE_MAPS_API_KEY='your-key'")
        print("     export UNSPLASH_ACCESS_KEY='your-key'")
        return
    
    enricher = ImageEnricher(config, db_path=args.db)
    enricher.enrich_auction_images(limit=args.batch_size, source=args.source)


if __name__ == '__main__':
    main()
