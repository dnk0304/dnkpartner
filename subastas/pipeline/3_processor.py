#!/usr/bin/env python3
"""
Stage 3: Processor - Watches 2_enriched/ and updates database

Tasks:
- Insert/update auction in SQLite database
- Generate search indexes
- Move to 3_processed/
"""

import os
import sys
import time
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

ENRICHED_DIR = Path('data/auctions/2_enriched')
PROCESSED_DIR = Path('data/auctions/3_processed')
DB_PATH = Path('data/database/prod.db')

def log(message: str, level: str = 'INFO'):
    """Log with timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] [{level}] {message}")

def upsert_to_database(auction_data: Dict[str, Any], conn: sqlite3.Connection) -> bool:
    """Insert or update auction in database"""
    try:
        data = auction_data['data']
        
        # Check if auction exists
        cursor = conn.execute(
            "SELECT id FROM Auction WHERE boeId = ? AND source = ?",
            (data['boeId'], data['source'])
        )
        exists = cursor.fetchone() is not None
        
        if exists:
            # Update existing
            conn.execute("""
                UPDATE Auction SET
                    title = ?, description = ?, province = ?, municipality = ?,
                    address = ?, postalCode = ?, latitude = ?, longitude = ?,
                    category = ?, propertyType = ?, status = ?,
                    auctionValue = ?, appraisalValue = ?, minimumBid = ?, deposit = ?,
                    publishedAt = ?, auctionDate = ?, endDate = ?,
                    court = ?, caseNumber = ?, lotNumber = ?,
                    detailsUrl = ?, imageUrl = ?, mapImageUrl = ?,
                    sourceUrl = ?, updatedAt = ?
                WHERE boeId = ? AND source = ?
            """, (
                data.get('title'), data.get('description'),
                data.get('province'), data.get('municipality'),
                data.get('address'), data.get('postalCode'),
                data.get('latitude'), data.get('longitude'),
                data.get('category'), data.get('propertyType'), data.get('status'),
                data.get('auctionValue'), data.get('appraisalValue'),
                data.get('minimumBid'), data.get('deposit'),
                data.get('publishedAt'), data.get('auctionDate'), data.get('endDate'),
                data.get('court'), data.get('caseNumber'), data.get('lotNumber'),
                data.get('detailsUrl'), data.get('imageUrl'), data.get('mapImageUrl'),
                data.get('sourceUrl'), datetime.now().isoformat(),
                data['boeId'], data['source']
            ))
            log(f"  Updated in database: {data['boeId']}")
        else:
            # Insert new
            conn.execute("""
                INSERT INTO Auction (
                    boeId, source, title, description, province, municipality,
                    address, postalCode, latitude, longitude,
                    category, propertyType, status,
                    auctionValue, appraisalValue, minimumBid, deposit,
                    publishedAt, auctionDate, endDate,
                    court, caseNumber, lotNumber,
                    detailsUrl, imageUrl, mapImageUrl, sourceUrl,
                    createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data['boeId'], data['source'],
                data.get('title'), data.get('description'),
                data.get('province'), data.get('municipality'),
                data.get('address'), data.get('postalCode'),
                data.get('latitude'), data.get('longitude'),
                data.get('category'), data.get('propertyType'), data.get('status'),
                data.get('auctionValue'), data.get('appraisalValue'),
                data.get('minimumBid'), data.get('deposit'),
                data.get('publishedAt'), data.get('auctionDate'), data.get('endDate'),
                data.get('court'), data.get('caseNumber'), data.get('lotNumber'),
                data.get('detailsUrl'), data.get('imageUrl'), data.get('mapImageUrl'),
                data.get('sourceUrl'),
                datetime.now().isoformat(), datetime.now().isoformat()
            ))
            log(f"  Inserted to database: {data['boeId']}")
        
        conn.commit()
        return True
        
    except Exception as e:
        log(f"Database error: {e}", 'ERROR')
        conn.rollback()
        return False

def process_file(filepath: Path, conn: sqlite3.Connection):
    """Process a single auction file"""
    try:
        # Read file
        with open(filepath, 'r', encoding='utf-8') as f:
            auction_file = json.load(f)
        
        auction_id = auction_file.get('id', filepath.stem)
        log(f"Processing: {auction_id}")
        
        # Update database
        if not upsert_to_database(auction_file, conn):
            log(f"Failed to update database for: {auction_id}", 'ERROR')
            return
        
        # Update file metadata
        auction_file['stage'] = 'processed'
        auction_file['processed_at'] = datetime.now().isoformat()
        auction_file['metadata']['in_database'] = True
        
        # Write to processed directory
        output_path = PROCESSED_DIR / filepath.name
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(auction_file, f, indent=2, ensure_ascii=False)
        
        # Remove from enriched directory
        filepath.unlink()
        
        log(f"✓ Processed: {auction_id}")
        
    except Exception as e:
        log(f"Error processing {filepath.name}: {e}", 'ERROR')

def watch_directory():
    """Watch enriched directory for new files"""
    log("Processor watching 2_enriched/")
    log(f"   Input:  {ENRICHED_DIR.absolute()}")
    log(f"   Output: {PROCESSED_DIR.absolute()}")
    log(f"   Database: {DB_PATH.absolute()}")
    
    processed_files = set()
    
    # Connect to database
    conn = sqlite3.connect(str(DB_PATH))
    
    try:
        while True:
            try:
                # Get all JSON files in enriched directory
                files = list(ENRICHED_DIR.glob('*.json'))
                
                for filepath in files:
                    # Skip if already processed this session
                    if filepath.name in processed_files:
                        continue
                    
                    # Process file
                    process_file(filepath, conn)
                    processed_files.add(filepath.name)
                
                # Sleep before next check
                time.sleep(2)
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                log(f"Watcher error: {e}", 'ERROR')
                time.sleep(5)
    finally:
        conn.close()
        log("Processor stopped")

if __name__ == '__main__':
    # Ensure directories exist
    ENRICHED_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    
    # Start watching
    watch_directory()
