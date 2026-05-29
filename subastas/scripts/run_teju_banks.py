#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simple script to run TEJU and bank scrapers
Note: Bank scrapers may need API credentials or further development
"""

import sys
import io
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
import sqlite3

# Database path
DB_PATH = Path(__file__).parent.parent / 'data' / 'database' / 'prod.db'

def print_separator():
    print("=" * 70)

def get_stats():
    """Get current database statistics"""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    cur.execute('SELECT auctionType, COUNT(*) FROM Auction WHERE auctionType IS NOT NULL GROUP BY auctionType')
    stats = {row[0]: row[1] for row in cur.fetchall()}
    
    cur.execute('SELECT COUNT(*) FROM Auction')
    total = cur.fetchone()[0]
    
    conn.close()
    return stats, total

def run_teju():
    """Run TEJU scraper"""
    print_separator()
    print("🏛️  TEJU SCRAPER (Judicial Pre-Auctions)")
    print_separator()
    print(f"⏰ Started at: {datetime.now().strftime('%H:%M:%S')}\n")
    
    try:
        from scraper.scrapers.teju_scraper import TEJUScraper
        
        print("🔍 Searching TEJU for pre-auction judicial edicts...")
        scraper = TEJUScraper()
        results = scraper.scrape(max_results=50)
        count = len(results)
        
        if count > 0:
            print(f"\n✅ TEJU: Found {count} new pre-auctions")
        else:
            print(f"\n⚠️  TEJU: No new pre-auctions found")
            print("   This is normal - TEJU may have no new edicts at this time")
        
        return count
    except Exception as e:
        print(f"\n❌ TEJU scraper failed: {e}")
        import traceback
        traceback.print_exc()
        return 0

def run_bank_scrapers_simple():
    """
    Attempt to run bank scrapers
    Note: Most bank scrapers require API analysis or credentials
    """
    print_separator()
    print("🏦 BANK SCRAPERS")
    print_separator()
    print(f"⏰ Started at: {datetime.now().strftime('%H:%M:%S')}\n")
    
    print("📋 Available bank sources:")
    print("   • Altamira (Santander)")
    print("   • Haya Real Estate")
    print("   • Servihabitat (CaixaBank)")
    print("   • Solvia (Sabadell)")
    print("   • Anticipa")
    print("   • Aliseda")
    
    print("\n⚠️  Note: Bank scrapers require:")
    print("   - API reverse engineering")
    print("   - Authentication tokens")
    print("   - Complex integration")
    print("\n💡 Currently using BOE as primary source for all judicial auctions")
    print("   Bank portals can be added as Phase 2 enhancement\n")
    
    return 0

def main():
    print_separator()
    print("🚀 TEJU & BANK SCRAPER RUNNER")
    print_separator()
    
    # Get initial stats
    initial_stats, initial_total = get_stats()
    print(f"\n📊 Initial database stats:")
    print(f"   Total auctions: {initial_total}")
    for auction_type, count in initial_stats.items():
        print(f"   {auction_type}: {count}")
    
    # Run TEJU
    teju_found = run_teju()
    
    # Bank scrapers info
    bank_found = run_bank_scrapers_simple()
    
    # Get final stats
    final_stats, final_total = get_stats()
    
    # Print summary
    print_separator()
    print("📊 FINAL SUMMARY")
    print_separator()
    print(f"\n📈 Final database stats:")
    print(f"   Total auctions: {final_total} (+{final_total - initial_total})")
    for auction_type, count in final_stats.items():
        initial = initial_stats.get(auction_type, 0)
        change = count - initial
        if change > 0:
            print(f"   {auction_type}: {count} (+{change})")
        else:
            print(f"   {auction_type}: {count}")
    
    print(f"\n✅ New auctions added: {final_total - initial_total}")
    print(f"⏰ Completed at: {datetime.now().strftime('%H:%M:%S')}")
    print_separator()

if __name__ == "__main__":
    main()
