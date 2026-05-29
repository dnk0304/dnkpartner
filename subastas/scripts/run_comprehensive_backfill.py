#!/usr/bin/env python3
"""
BOE Comprehensive Backfill Runner
Fetches ALL auctions from last 6 years with FULL detail extraction.

Features:
- Uses working URL parameters (no form interaction)
- Scrapes ALL statuses: PA, EJ, SU, CE, AN, FI
- Clicks into detail pages for comprehensive data
- Saves auctions even without appraisal value
"""

import sys
import logging
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from scraper.scrapers.boe_comprehensive_scraper import run_comprehensive_backfill

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                project_root / 'scraper' / 'comprehensive_backfill.log',
                encoding='utf-8',
            ),
        ],
    )

def main():
    setup_logging()
    
    print("=" * 70)
    print("BOE COMPREHENSIVE 6-YEAR BACKFILL")
    print("=" * 70)
    print("Fetching: Feb 2020 - Jan 2026 (72 months)")
    print("Statuses: ALL (PA, EJ, SU, CE, AN, FI)")
    print("Details:  Full extraction from detail pages")
    print("=" * 70)
    print()
    
    try:
        progress = run_comprehensive_backfill(
            start_year=2020,
            start_month=2,
            end_year=2026,
            end_month=1,
            resume=True
        )
        
        print()
        print("=" * 70)
        print("✓ BACKFILL COMPLETE")
        print("=" * 70)
        print(f"Total auctions: {progress['total_auctions']:,}")
        print(f"By status:")
        for status, count in progress['by_status'].items():
            print(f"  {status}: {count:,}")
        if progress['errors']:
            print(f"\nErrors: {len(progress['errors'])}")
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
