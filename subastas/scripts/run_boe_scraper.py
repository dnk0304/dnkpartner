#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simple BOE Scraper Runner
Scrapes active auctions from BOE portal for all provinces
"""

import sys
import os
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Add scraper directory to path
scraper_dir = Path(__file__).parent.parent / 'scraper'
sys.path.insert(0, str(scraper_dir))

# Now import scraper components
from config.provinces import ALL_PROVINCES
from scrapers.boe_scraper import BOEScraper
from database.adapter import get_database_adapter

def run_scraper(provinces_to_scrape=None, max_pages=2):
    """
    Run BOE scraper for specified provinces
    
    Args:
        provinces_to_scrape: List of province names, or None for all
        max_pages: Maximum pages to scrape per province
    """
    
    if provinces_to_scrape is None:
        provinces_to_scrape = ALL_PROVINCES[:5]  # Start with 5 provinces for testing
    
    print("=" * 70)
    print("🚀 BOE SCRAPER - ACTIVE AUCTIONS")
    print("=" * 70)
    print(f"\n📍 Provinces to scrape: {len(provinces_to_scrape)}")
    print(f"📄 Max pages per province: {max_pages}")
    print()
    
    db_adapter = get_database_adapter()
    total_new = 0
    total_updated = 0
    total_errors = 0
    
    for i, province in enumerate(provinces_to_scrape, 1):
        print(f"\n[{i}/{len(provinces_to_scrape)}] 🔍 Scraping: {province}")
        print("-" * 70)
        
        try:
            scraper = BOEScraper(province=province)
            auctions = scraper.scrape(max_pages=max_pages, status='active')
            
            print(f"  Found {len(auctions)} auctions")
            
            # Save to database
            new_count = 0
            updated_count = 0
            
            for auction in auctions:
                try:
                    # Check if auction exists
                    existing = db_adapter.get_auction_by_boe_id(auction['boe_id'])
                    
                    if existing:
                        # Update existing auction
                        db_adapter.update_auction(auction)
                        updated_count += 1
                    else:
                        # Create new auction
                        db_adapter.create_auction(auction)
                        new_count += 1
                        
                except Exception as e:
                    print(f"    ❌ Error saving auction {auction.get('boe_id', 'unknown')}: {e}")
                    total_errors += 1
            
            total_new += new_count
            total_updated += updated_count
            
            print(f"  ✅ Saved: {new_count} new, {updated_count} updated")
            
        except Exception as e:
            print(f"  ❌ Error scraping {province}: {e}")
            total_errors += 1
            continue
    
    print("\n" + "=" * 70)
    print("📊 SCRAPING SUMMARY")
    print("=" * 70)
    print(f"  New auctions: {total_new}")
    print(f"  Updated auctions: {total_updated}")
    print(f"  Errors: {total_errors}")
    print(f"  Total processed: {total_new + total_updated}")
    print("=" * 70)
    
    return {
        'new': total_new,
        'updated': total_updated,
        'errors': total_errors
    }

if __name__ == '__main__':
    # Parse command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == 'all':
            provinces = ALL_PROVINCES
        elif sys.argv[1] == 'test':
            provinces = ['Madrid', 'Barcelona', 'Valencia']
        else:
            provinces = sys.argv[1].split(',')
    else:
        # Default: test with 3 major provinces
        provinces = ['Madrid', 'Barcelona', 'Valencia']
    
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    
    print(f"\n🎯 Starting scraper...")
    print(f"  Mode: {'ALL PROVINCES' if provinces == ALL_PROVINCES else f'{len(provinces)} provinces'}")
    print(f"  Max pages: {max_pages}\n")
    
    result = run_scraper(provinces, max_pages)
    
    print(f"\n✅ Scraper completed successfully!")
    sys.exit(0)
