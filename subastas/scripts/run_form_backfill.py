#!/usr/bin/env python3
"""
BOE Form-Based Backfill Runner
Uses proper form POST submission to fetch 6 years of auction data.
"""

import sys
import logging
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from scraper.scrapers.boe_form_scraper import BOEFormBackfillScraper

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                project_root / 'scraper' / 'form_backfill.log',
                encoding='utf-8',
            ),
        ],
    )

def main():
    setup_logging()
    
    print("=" * 70)
    print("BOE FORM-BASED 6-YEAR BACKFILL")
    print("=" * 70)
    print("Method: POST form submission (correct approach)")
    print("Period: February 2020 - January 2026 (72 months)")
    print("Criteria: Tipo=Todos, Estado=Cualquiera, Bien=Todos")
    print("Results: 500 per page")
    print("Details: Full extraction from detail pages")
    print("=" * 70)
    print()
    
    scraper = BOEFormBackfillScraper()
    
    try:
        progress = scraper.scrape_form_range(
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
