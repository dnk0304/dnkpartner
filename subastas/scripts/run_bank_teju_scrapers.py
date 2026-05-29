#!/usr/bin/env python3
"""
Run all bank and TEJU scrapers to populate database with bank auctions
"""

import sys
import os
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
import sqlite3
from scraper.scrapers.altamira_scraper import AltamiraScraper
from scraper.scrapers.haya_scraper import HayaScraper
from scraper.scrapers.servihabitat_scraper import ServihabitatScraper
from scraper.scrapers.solvia_scraper import SolviaScraper
from scraper.scrapers.anticipa_scraper import AnticipaScraper
from scraper.scrapers.aliseda_scraper import AlisedaScraper
from scraper.scrapers.teju_scraper import TEJUScraper

DB_PATH = Path(__file__).parent.parent / 'data' / 'database' / 'prod.db'

def print_separator():
    print("=" * 70)

def print_header(text):
    print_separator()
    print(f"🏦 {text}")
    print_separator()

def get_current_stats():
    """Get current database statistics"""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Count by auction type
    cur.execute('SELECT auctionType, COUNT(*) FROM Auction WHERE auctionType IS NOT NULL GROUP BY auctionType')
    stats = {row[0]: row[1] for row in cur.fetchall()}
    
    # Total count
    cur.execute('SELECT COUNT(*) FROM Auction')
    total = cur.fetchone()[0]
    
    conn.close()
    return stats, total

def run_bank_scraper(scraper_class, name: str):
    """Run a single bank scraper"""
    print(f"\n🔍 Starting {name} scraper...")
    try:
        scraper = scraper_class()
        results = scraper.scrape(max_pages=5)  # Limit to 5 pages per bank for now
        
        if results:
            print(f"✅ {name}: Found {len(results)} auctions")
        else:
            print(f"⚠️  {name}: No auctions found (may need API credentials or reverse engineering)")
        
        return len(results)
    except Exception as e:
        print(f"❌ {name} failed: {e}")
        import traceback
        traceback.print_exc()
        return 0

def run_all_scrapers():
    """Run all bank and TEJU scrapers"""
    print_header("BANK & TEJU SCRAPER - START")
    print(f"⏰ Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Get initial stats
    initial_stats, initial_total = get_current_stats()
    print(f"\n📊 Initial database stats:")
    print(f"   Total auctions: {initial_total}")
    for auction_type, count in initial_stats.items():
        print(f"   {auction_type}: {count}")
    
    # Define bank scrapers to run
    bank_scrapers = [
        (AltamiraScraper, "Altamira (Santander)"),
        (HayaScraper, "Haya Real Estate"),
        (ServihabitatScraper, "Servihabitat"),
        (SolviaScraper, "Solvia (Sabadell)"),
        (AnticipaScraper, "Anticipa"),
        (AlisedaScraper, "Aliseda"),
    ]
    
    total_found = 0
    
    # Run each bank scraper
    print_header("BANK SCRAPERS")
    for scraper_class, name in bank_scrapers:
        found = run_bank_scraper(scraper_class, name)
        total_found += found
    
    # Run TEJU scraper
    print_header("TEJU SCRAPER (PRE-AUCTIONS)")
    print("\n🔍 Starting TEJU scraper...")
    try:
        scraper = TEJUScraper()
        results = scraper.scrape(max_results=50)
        teju_count = len(results)
        print(f"✅ TEJU: Found {teju_count} pre-auctions")
        total_found += teju_count
    except Exception as e:
        print(f"❌ TEJU failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Get final stats
    final_stats, final_total = get_current_stats()
    
    # Print summary
    print_header("SUMMARY")
    print(f"\n📊 Final database stats:")
    print(f"   Total auctions: {final_total} (+{final_total - initial_total})")
    for auction_type, count in final_stats.items():
        initial = initial_stats.get(auction_type, 0)
        change = count - initial
        if change > 0:
            print(f"   {auction_type}: {count} (+{change})")
        else:
            print(f"   {auction_type}: {count}")
    
    print(f"\n✅ Total new auctions found: {total_found}")
    print(f"⏰ Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print_separator()

if __name__ == "__main__":
    run_all_scrapers()
