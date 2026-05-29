#!/usr/bin/env python3
"""
Alternative BOE Historical Backfill
Uses the working URL-based historical scraper to fetch 6 years of data
No form interaction - uses proven URL parameter approach
"""

import sys
import logging
from pathlib import Path
from datetime import datetime
from dateutil.relativedelta import relativedelta

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from scraper.scrapers.boe_historical_scraper import BOEHistoricalScraper

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(project_root / 'scraper' / 'historical_backfill.log', encoding='utf-8'),
        ],
    )

def main():
    setup_logging()
    logger = logging.getLogger(__name__)
    
    print("=" * 60)
    print("BOE Historical Backfill (URL-based)")
    print("=" * 60)
    print("Fetching 6 years of finished auctions")
    print("Using proven URL parameter method")
    print("=" * 60)
    print()
    
    # Use the historical scraper with 72 months (6 years)
    scraper = BOEHistoricalScraper()
    scraper.months_to_scrape = 72  # 6 years instead of default 2
    
    try:
        logger.info("Starting 6-year historical backfill...")
        results = scraper.scrape_full_history(max_pages=100)
        
        total = sum(results.values())
        print()
        print("=" * 60)
        print("BACKFILL COMPLETE")
        print("=" * 60)
        print(f"Months scraped: {len(results)}")
        print(f"Total auctions: {total:,}")
        print()
        
        if results:
            print("Per-month breakdown:")
            for month_key in sorted(results.keys(), reverse=True):
                count = results[month_key]
                bar = '#' * min(count // 50, 50)
                print(f"  {month_key}: {count:>6,} {bar}")
        
        print("=" * 60)
        
    except KeyboardInterrupt:
        print("\n\nBackfill interrupted by user.")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        print(f"\nError: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
