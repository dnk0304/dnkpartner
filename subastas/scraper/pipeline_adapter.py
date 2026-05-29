"""
Pipeline Adapter for Scrapers
Converts direct database writes to file-based pipeline output
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

SCRAPED_DIR = Path('data/auctions/1_scraped')

def save_auction_to_pipeline(auction_data: Dict[str, Any], source: str = 'BOE') -> str:
    """
    Save scraped auction data to pipeline (1_scraped/)
    
    Args:
        auction_data: Dictionary with auction fields
        source: Source identifier (BOE, TEJU, etc.)
    
    Returns:
        Filepath of saved file
    """
    # Ensure directory exists
    SCRAPED_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate unique ID
    auction_id = auction_data.get('boeId') or auction_data.get('id')
    if not auction_id:
        auction_id = f"{source}-{datetime.now().timestamp()}"
    
    # Create auction file structure
    auction_file = {
        "id": auction_id,
        "source": source,
        "stage": "scraped",
        "scraped_at": datetime.now().isoformat(),
        "version": 1,
        "data": auction_data,
        "metadata": {
            "scraper_version": "1.0",
            "needs_enrichment": True,
            "needs_geocoding": not bool(auction_data.get('latitude')),
            "needs_validation": True
        }
    }
    
    # Save to file
    filename = f"{source}-{auction_id}.json"
    filepath = SCRAPED_DIR / filename
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(auction_file, f, indent=2, ensure_ascii=False)
    
    return str(filepath)

def upsert_auction(auction_data: Dict[str, Any]) -> str:
    """
    Compatibility function - replaces direct database upsert
    Now saves to pipeline instead
    """
    source = auction_data.get('source', 'BOE')
    filepath = save_auction_to_pipeline(auction_data, source)
    print(f"  → Saved to pipeline: {filepath}")
    return filepath

def mark_auction_finished(boe_id: str, source: str = 'BOE'):
    """
    Mark auction as finished in pipeline
    Updates the file with finished status
    """
    from pathlib import Path
    
    # Find the file in processed directory
    processed_dir = Path('data/auctions/3_processed')
    filename = f"{source}-{boe_id}.json"
    filepath = processed_dir / filename
    
    if filepath.exists():
        with open(filepath, 'r', encoding='utf-8') as f:
            auction_file = json.load(f)
        
        # Update status
        auction_file['data']['status'] = 'FINISHED'
        auction_file['updated_at'] = datetime.now().isoformat()
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(auction_file, f, indent=2, ensure_ascii=False)
        
        print(f"  ✓ Marked as finished: {boe_id}")
    else:
        print(f"  ⚠ Not found in processed: {boe_id}")
