#!/usr/bin/env python3
"""
Parallel Scraper 1: 2020-2022
15-day batches, 500 results/page
"""

import sys
import logging
from pathlib import Path

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
                project_root / 'scraper' / 'parallel_1_2020_2022.log',
                encoding='utf-8',
            ),
        ],
    )

def main():
    setup_logging()
    
    print("=" * 70)
    print("PARALLEL SCRAPER 1: 2020-2022")
    print("=" * 70)
    print("Date Range: 2020-01-01 to 2022-12-31")
    print("Strategy: 15-day batches, 500 results/page")
    print("=" * 70)
    print()
    
    scraper = BOEParallelScraper(scraper_id=1)
    
    try:
        progress = scraper.scrape_date_range(
            start_year=2020, start_month=1, start_day=1,
            end_year=2022, end_month=12, end_day=31,
            resume=True
        )
        
        print()
        print("=" * 70)
        print("✓ SCRAPER 1 COMPLETE")
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
