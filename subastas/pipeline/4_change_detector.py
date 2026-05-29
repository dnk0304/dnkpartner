#!/usr/bin/env python3
"""
Stage 4: Change Detector - Periodically checks processed auctions for changes

Tasks:
- Scan 3_processed/ directory
- Re-scrape auctions to check for changes
- If changed: move back to 1_scraped/ with updated data
- If finished/expired: move to 4_archived/
- Update version tracking
"""

import os
import sys
import time
import json
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

PROCESSED_DIR = Path('data/auctions/3_processed')
SCRAPED_DIR = Path('data/auctions/1_scraped')
ARCHIVED_DIR = Path('data/auctions/4_archived')

# Check frequency (in seconds)
CHECK_INTERVAL = 3600  # 1 hour
RECHECK_AFTER_DAYS = 1  # Re-check after 1 day

def log(message: str, level: str = 'INFO'):
    """Log with timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] [{level}] {message}")

def needs_recheck(auction_file: Dict[str, Any]) -> bool:
    """Determine if auction needs to be re-checked"""
    
    # Get last update time
    updated_at_str = auction_file.get('updated_at')
    if not updated_at_str:
        return True
    
    try:
        updated_at = datetime.fromisoformat(updated_at_str.replace('Z', '+00:00'))
        days_since_update = (datetime.now() - updated_at).days
        
        # Re-check after configured days
        return days_since_update >= RECHECK_AFTER_DAYS
    except:
        return True

def should_archive(auction_file: Dict[str, Any]) -> bool:
    """Determine if auction should be archived"""
    
    data = auction_file.get('data', {})
    status = data.get('status', '').upper()
    
    # Archive finished auctions
    if status in ['FINISHED', 'CANCELLED', 'SOLD']:
        return True
    
    # Archive if auction date has passed
    end_date_str = data.get('endDate') or data.get('auctionDate')
    if end_date_str:
        try:
            end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            if end_date < datetime.now() - timedelta(days=7):  # 7 days grace period
                return True
        except:
            pass
    
    return False

def mock_rescrape(auction_file: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Mock re-scraping function
    In production, this would actually fetch fresh data from the source
    
    Returns: Updated auction data if changes detected, None if no changes
    """
    # This is a placeholder - in production you would:
    # 1. Use the source URL to fetch fresh data
    # 2. Compare with existing data
    # 3. Return updated data only if changes detected
    
    # For now, randomly simulate some auctions having changes (10% chance)
    import random
    if random.random() < 0.1:
        log(f"  Change detected (mock)", 'DEBUG')
        auction_file['version'] = auction_file.get('version', 1) + 1
        auction_file['updated_at'] = datetime.now().isoformat()
        auction_file['data']['_change_detected'] = True
        return auction_file
    
    return None

def check_auction(filepath: Path):
    """Check a single auction for changes"""
    try:
        # Read file
        with open(filepath, 'r', encoding='utf-8') as f:
            auction_file = json.load(f)
        
        auction_id = auction_file.get('id', filepath.stem)
        
        # Check if should be archived
        if should_archive(auction_file):
            # Move to archived
            archive_path = ARCHIVED_DIR / filepath.name
            shutil.move(str(filepath), str(archive_path))
            log(f"Archived: {auction_id}")
            return
        
        # Check if needs re-checking
        if not needs_recheck(auction_file):
            return
        
        log(f"Checking for changes: {auction_id}")
        
        # Re-scrape for changes
        updated = mock_rescrape(auction_file)
        
        if updated:
            # Changes detected - move to scraped for reprocessing
            updated['stage'] = 'scraped'
            updated['rescraped_at'] = datetime.now().isoformat()
            
            scraped_path = SCRAPED_DIR / filepath.name
            with open(scraped_path, 'w', encoding='utf-8') as f:
                json.dump(updated, f, indent=2, ensure_ascii=False)
            
            # Remove from processed
            filepath.unlink()
            
            log(f"Changes detected, reprocessing: {auction_id}")
        else:
            # No changes - just update the check timestamp
            auction_file['last_checked_at'] = datetime.now().isoformat()
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(auction_file, f, indent=2, ensure_ascii=False)
        
    except Exception as e:
        log(f"Error checking {filepath.name}: {e}", 'ERROR')

def run_check_cycle():
    """Run one complete check cycle"""
    log("Starting change detection cycle")
    
    # Get all processed auctions
    files = list(PROCESSED_DIR.glob('*.json'))
    log(f"   Found {len(files)} processed auctions")
    
    checked = 0
    archived = 0
    reprocessing = 0
    
    for filepath in files:
        initial_exists = filepath.exists()
        check_auction(filepath)
        
        # Track what happened
        if not filepath.exists():
            if (ARCHIVED_DIR / filepath.name).exists():
                archived += 1
            elif (SCRAPED_DIR / filepath.name).exists():
                reprocessing += 1
        else:
            checked += 1
    
    log(f"Cycle complete:")
    log(f"   Checked: {checked}")
    log(f"   Archived: {archived}")
    log(f"   Reprocessing: {reprocessing}\n")

def watch_and_check():
    """Main loop - periodically check for changes"""
    log("Change Detector started")
    log(f"   Watching: {PROCESSED_DIR.absolute()}")
    log(f"   Check interval: {CHECK_INTERVAL}s ({CHECK_INTERVAL/3600:.1f} hours)")
    log(f"   Recheck after: {RECHECK_AFTER_DAYS} days\n")
    
    try:
        while True:
            run_check_cycle()
            
            log(f"Sleeping for {CHECK_INTERVAL}s...")
            time.sleep(CHECK_INTERVAL)
            
    except KeyboardInterrupt:
        log("Change Detector stopped")

if __name__ == '__main__':
    # Ensure directories exist
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    SCRAPED_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVED_DIR.mkdir(parents=True, exist_ok=True)
    
    # Start watching
    watch_and_check()
