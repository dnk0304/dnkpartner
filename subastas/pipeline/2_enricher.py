#!/usr/bin/env python3
"""
Stage 2: Enricher - Watches 1_scraped/ and enriches auction data

Tasks:
- Validate scraped data
- Geocode addresses (if not already done)
- Generate Google Maps URLs (FREE!)
- Generate map images
- Extract additional metadata
- Move to 2_enriched/
"""

import os
import sys
import time
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import Google Maps URL generator
try:
    from lib.maps_url_generator import GoogleMapsUrlGenerator
    MAPS_AVAILABLE = True
except ImportError:
    MAPS_AVAILABLE = False

SCRAPED_DIR = Path('data/auctions/1_scraped')
ENRICHED_DIR = Path('data/auctions/2_enriched')

def log(message: str, level: str = 'INFO'):
    """Log with timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] [{level}] {message}")

def validate_auction(data: Dict[str, Any]) -> bool:
    """Validate auction has required fields"""
    required = ['boeId', 'title', 'province', 'source']
    return all(field in data.get('data', {}) for field in required)

def enrich_auction(auction_file: Dict[str, Any]) -> Dict[str, Any]:
    """Enrich auction with additional data"""
    
    # Update stage
    auction_file['stage'] = 'enriched'
    auction_file['enriched_at'] = datetime.now().isoformat()
    
    data = auction_file['data']
    metadata = auction_file.get('metadata', {})
    
    # Generate Google Maps URLs (FREE!)
    if MAPS_AVAILABLE:
        try:
            url_generator = GoogleMapsUrlGenerator()
            urls = url_generator.generate_all_urls(
                latitude=data.get('latitude'),
                longitude=data.get('longitude'),
                address=data.get('address'),
                municipality=data.get('municipality'),
                province=data.get('province')
            )
            
            # Add URLs to auction data
            data['mapUrl'] = urls.get('mapUrl', '')
            data['streetViewUrl'] = urls.get('streetViewUrl', '')
            data['placeUrl'] = urls.get('placeUrl', '')
            data['directionsUrl'] = urls.get('directionsUrl', '')
            
            metadata['maps_urls_generated'] = True
        except Exception as e:
            log(f"Error generating maps URLs: {e}", 'WARN')
            metadata['maps_urls_generated'] = False
    else:
        metadata['maps_urls_generated'] = False
    
    # Geocoding (placeholder - would use real geocoding service)
    if not data.get('latitude') and data.get('address'):
        # In production: call geocoding API
        metadata['geocoded'] = False
        metadata['geocoding_attempted'] = True
    else:
        metadata['geocoded'] = bool(data.get('latitude'))
    
    # Map generation (placeholder - would generate actual maps)
    if data.get('latitude') and data.get('longitude'):
        metadata['map_generated'] = True
    else:
        metadata['map_generated'] = False
    
    # Data validation
    metadata['validated'] = validate_auction(auction_file)
    metadata['enriched'] = True
    
    auction_file['metadata'] = metadata
    
    return auction_file

def process_file(filepath: Path):
    """Process a single auction file"""
    try:
        # Read file
        with open(filepath, 'r', encoding='utf-8') as f:
            auction_file = json.load(f)
        
        auction_id = auction_file.get('id', filepath.stem)
        log(f"Enriching: {auction_id}")
        
        # Validate
        if not validate_auction(auction_file):
            log(f"Invalid auction data: {auction_id}", 'ERROR')
            return
        
        # Enrich
        enriched = enrich_auction(auction_file)
        
        # Write to enriched directory
        output_path = ENRICHED_DIR / filepath.name
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(enriched, f, indent=2, ensure_ascii=False)
        
        # Remove from scraped directory
        filepath.unlink()
        
        log(f"✓ Enriched: {auction_id}")
        
    except Exception as e:
        log(f"Error processing {filepath.name}: {e}", 'ERROR')

def watch_directory():
    """Watch scraped directory for new files"""
    log("Enricher watching 1_scraped/")
    log(f"   Input:  {SCRAPED_DIR.absolute()}")
    log(f"   Output: {ENRICHED_DIR.absolute()}")
    
    processed_files = set()
    
    while True:
        try:
            # Get all JSON files in scraped directory
            files = list(SCRAPED_DIR.glob('*.json'))
            
            for filepath in files:
                # Skip if already processed this session
                if filepath.name in processed_files:
                    continue
                
                # Process file
                process_file(filepath)
                processed_files.add(filepath.name)
            
            # Sleep before next check
            time.sleep(2)
            
        except KeyboardInterrupt:
            log("Enricher stopped")
            break
        except Exception as e:
            log(f"Watcher error: {e}", 'ERROR')
            time.sleep(5)

if __name__ == '__main__':
    # Ensure directories exist
    SCRAPED_DIR.mkdir(parents=True, exist_ok=True)
    ENRICHED_DIR.mkdir(parents=True, exist_ok=True)
    
    # Start watching
    watch_directory()
