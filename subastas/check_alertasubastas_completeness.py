#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Check AlertaSubastas scraping completeness
Analyzes what has been scraped and what remains
"""

import sys
import sqlite3
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Add config to path
sys.path.insert(0, str(Path(__file__).parent / 'scraper'))
from scraper.alertasubastas_config import PROPERTY_TYPES, PROVINCES

# Database path
DB_PATH = Path(__file__).parent / "data" / "database" / "prod.db"

def check_scraping_status():
    """Check what has been scraped from AlertaSubastas"""
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get total AlertaSubastas auctions
    cursor.execute("""
        SELECT COUNT(*) 
        FROM Auction 
        WHERE originalSource = 'AlertaSubastas'
    """)
    total_alertasubastas = cursor.fetchone()[0]
    
    # Get finished auctions from AlertaSubastas
    cursor.execute("""
        SELECT COUNT(*) 
        FROM Auction 
        WHERE originalSource = 'AlertaSubastas' AND status = 'FINISHED'
    """)
    finished_alertasubastas = cursor.fetchone()[0]
    
    # Get active auctions from AlertaSubastas
    cursor.execute("""
        SELECT COUNT(*) 
        FROM Auction 
        WHERE originalSource = 'AlertaSubastas' AND status = 'ACTIVE'
    """)
    active_alertasubastas = cursor.fetchone()[0]
    
    # Get unique auction IDs (to check for duplicates)
    cursor.execute("""
        SELECT COUNT(DISTINCT boeId) 
        FROM Auction 
        WHERE originalSource = 'AlertaSubastas'
    """)
    unique_auctions = cursor.fetchone()[0]
    
    # Get sample of boeIds to check pattern
    cursor.execute("""
        SELECT boeId, title, status 
        FROM Auction 
        WHERE originalSource = 'AlertaSubastas' AND status = 'FINISHED'
        LIMIT 5
    """)
    sample_finished = cursor.fetchall()
    
    conn.close()
    
    print("=" * 80)
    print("🔍 ALERTASUBASTAS SCRAPING ANALYSIS")
    print("=" * 80)
    print()
    print(f"📊 DATABASE STATISTICS:")
    print(f"   Total AlertaSubastas auctions: {total_alertasubastas:,}")
    print(f"   Unique auction IDs: {unique_auctions:,}")
    print(f"   Duplicates: {total_alertasubastas - unique_auctions:,}")
    print()
    print(f"🔹 BY STATUS:")
    print(f"   FINISHED: {finished_alertasubastas:,}")
    print(f"   ACTIVE: {active_alertasubastas:,}")
    print()
    print(f"📋 SCRAPING CONFIGURATION:")
    print(f"   Property types: {len(PROPERTY_TYPES)}")
    print(f"   Provinces: {len(PROVINCES)}")
    print(f"   Total combinations: {len(PROPERTY_TYPES) * len(PROVINCES):,}")
    print()
    print(f"📈 ESTIMATED COVERAGE:")
    print(f"   If avg 100 finished per combination: ~{len(PROPERTY_TYPES) * len(PROVINCES) * 100:,} auctions")
    print(f"   If avg 200 finished per combination: ~{len(PROPERTY_TYPES) * len(PROVINCES) * 200:,} auctions")
    print(f"   Current finished count: {finished_alertasubastas:,}")
    print()
    
    # Calculate approximate completion percentage
    # Assuming target is around 100k-200k finished auctions
    low_estimate = len(PROPERTY_TYPES) * len(PROVINCES) * 100
    high_estimate = len(PROPERTY_TYPES) * len(PROVINCES) * 200
    
    if finished_alertasubastas > 0:
        completion_low = (finished_alertasubastas / low_estimate) * 100
        completion_high = (finished_alertasubastas / high_estimate) * 100
        print(f"💯 COMPLETION ESTIMATE:")
        print(f"   vs Low estimate (100/combo): {completion_low:.1f}%")
        print(f"   vs High estimate (200/combo): {completion_high:.1f}%")
        print()
    
    print(f"📝 SAMPLE FINISHED AUCTIONS:")
    for boe_id, title, status in sample_finished:
        print(f"   - {boe_id[:30]}... | {title[:40]}... | {status}")
    print()
    
    # Recommendation
    print("=" * 80)
    if finished_alertasubastas < 50000:
        print("⚠️  RECOMMENDATION: Continue scraping - many auctions remain")
        print("   Run: .\\run_alertasubastas_finished_parallel.bat")
    elif finished_alertasubastas < 100000:
        print("🔄 RECOMMENDATION: Partial completion - recommend continuing")
        print("   Run: .\\run_alertasubastas_finished_parallel.bat")
    else:
        print("✅ RECOMMENDATION: Good coverage achieved")
        print("   You may want to verify completeness or stop scraping")
    print("=" * 80)

if __name__ == '__main__':
    check_scraping_status()
