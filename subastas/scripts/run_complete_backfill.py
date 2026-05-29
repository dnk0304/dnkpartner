#!/usr/bin/env python3
"""
BOE Complete Backfill Runner
Fetches ALL auctions from Feb 2020 - Jan 2026 with full detail extraction.
"""

import sys
import logging
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from scraper.scrapers.boe_complete_scraper import BOECompleteBackfillScraper

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                project_root / 'scraper' / 'complete_backfill.log',
                encoding='utf-8',
            ),
        ],
    )

def main():
    setup_logging()
    
    print("=" * 70)
    print("BOE COMPLETE 6-YEAR BACKFILL")
    print("=" * 70)
    print("Period: February 2020 - January 2026 (72 months)")
    print("Statuses: ALL (PA, EJ, CE, SU, AN, FI)")
    print("Details: Full extraction from detail pages")
    print("Validation: Saves auctions even without appraisal value")
    print("=" * 70)
    print()
    
    scraper = BOECompleteBackfillScraper()
    
    try:
        progress = scraper.scrape_complete_range(
            start_year=2020,
            start_month=2,
            end_year=2026,
            end_month=1,
            resume=True,
        )
        
        print()
        print("=" * 70)
        print("✓ BACKFILL COMPLETE")
        print("=" * 70)
        print(f"Total auctions: {progress['total_auctions']:,}")
        print(f"Months completed: {len(progress['completed_months'])}")
        print()
        print("By status:")
        for status, count in progress['by_status'].items():
            print(f"  {status}: {count:,}")
        
        if progress['errors']:
            print(f"\nErrors encountered: {len(progress['errors'])}")
        
        print("=" * 70)
        
    except KeyboardInterrupt:
        print("\n\nInterrupted. Progress saved. Run again to resume.")
        sys.exit(0)
    except Exception as e:
        logging.error(f"Backfill failed: {e}", exc_info=True)
        print(f"\nError: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
