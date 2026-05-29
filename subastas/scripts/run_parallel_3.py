#!/usr/bin/env python3
"""
Parallel Scraper 3: 2024-2026
15-day batches, 500 results/page
"""

import sys
import logging
from pathlib import Path
from datetime import datetime

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from scraper.scrapers.boe_parallel_scraper import BOEParallelScraper

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                project_root / 'scraper' / 'parallel_3_2024_2026.log',
                encoding='utf-8',
            ),
        ],
    )

def main():
    setup_logging()
    
    today = datetime.now()
    
    print("=" * 70)
    print("PARALLEL SCRAPER 3: 2024-2026")
    print("=" * 70)
    print(f"Date Range: 2025-01-01 to {today.strftime('%Y-%m-%d')}")
    print("Strategy: 15-day batches, 500 results/page")
    print("=" * 70)
    print()
    
    scraper = BOEParallelScraper(scraper_id=3)
    
    try:
        progress = scraper.scrape_date_range(
            start_year=2025, start_month=1, start_day=1,
            end_year=today.year, end_month=today.month, end_day=today.day,
            resume=True
        )
        
        print()
        print("=" * 70)
        print("✓ SCRAPER 3 COMPLETE")
        print("=" * 70)
        print(f"Total batches: {progress['total_batches']}")
        print(f"Total auctions fetched: {progress['total_auctions']:,}")
        print(f"Errors: {len(progress['errors'])}")
        print("=" * 70)
        
    except KeyboardInterrupt:
        print("\n\nInterrupted. Progress saved.")
        sys.exit(0)
    except Exception as e:
        logging.error(f"Scraper failed: {e}", exc_info=True)
        print(f"\nError: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
