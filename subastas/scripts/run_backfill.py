#!/usr/bin/env python3
"""
BOE Backfill Runner
Fetches all auctions from the last 6 years, month by month.

Usage:
    python scripts/run_backfill.py
    python scripts/run_backfill.py --start-year 2022 --start-month 6
    python scripts/run_backfill.py --start-year 2020 --start-month 2 --end-year 2026 --end-month 1
    python scripts/run_backfill.py --no-resume   # Start fresh, ignore previous progress
    python scripts/run_backfill.py --status       # Show progress without scraping

Defaults:
    Start: February 2020
    End:   January 2026
    Resume: enabled (skips already-completed months)
"""

import sys
import os
import argparse
import logging
from pathlib import Path
from datetime import datetime

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from scraper.scrapers.boe_backfill_scraper import BOEBackfillScraper, PROGRESS_FILE


def setup_logging(verbose: bool = False):
    """Configure logging"""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                project_root / 'scraper' / 'backfill.log',
                encoding='utf-8',
            ),
        ],
    )


def show_status():
    """Show current backfill progress"""
    import json

    if not PROGRESS_FILE.exists():
        print("No backfill progress found. Run the backfill to start.")
        return

    with open(PROGRESS_FILE, 'r') as f:
        progress = json.load(f)

    completed = progress.get('completed_months', [])
    total = progress.get('total_auctions', 0)
    errors = progress.get('errors', [])

    print("=" * 60)
    print("BOE Backfill Progress")
    print("=" * 60)
    print(f"Completed months: {len(completed)}")
    print(f"Total auctions:   {total:,}")
    print(f"Errors:           {len(errors)}")

    if completed:
        print(f"\nFirst completed:  {min(completed)}")
        print(f"Last completed:   {max(completed)}")

        # Show which months are done
        print(f"\nCompleted months ({len(completed)}):")
        for month_key in sorted(completed):
            print(f"  - {month_key}")

    if errors:
        print(f"\nRecent errors:")
        for err in errors[-5:]:
            print(f"  - {err['month']}: {err['error'][:80]}")

    # Calculate remaining
    all_months = []
    current = datetime(2020, 2, 1)
    end = datetime(2026, 1, 1)
    from dateutil.relativedelta import relativedelta
    while current <= end:
        all_months.append(f"{current.year}-{current.month:02d}")
        current += relativedelta(months=1)

    remaining = [m for m in all_months if m not in completed]
    print(f"\nRemaining months: {len(remaining)}")
    if remaining:
        print(f"  Next: {remaining[0]}")

    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description='BOE 6-Year Backfill Scraper - fetches all auctions month by month',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/run_backfill.py                              # Run with defaults (Feb 2020 - Jan 2026)
  python scripts/run_backfill.py --start-year 2023            # Start from Jan 2023
  python scripts/run_backfill.py --start-year 2024 --start-month 6  # Start from Jun 2024
  python scripts/run_backfill.py --no-resume                  # Start fresh, ignore progress
  python scripts/run_backfill.py --status                     # Show progress only
        """,
    )

    parser.add_argument('--start-year', type=int, default=2020, help='Start year (default: 2020)')
    parser.add_argument('--start-month', type=int, default=2, help='Start month (default: 2 = February)')
    parser.add_argument('--end-year', type=int, default=2026, help='End year (default: 2026)')
    parser.add_argument('--end-month', type=int, default=1, help='End month (default: 1 = January)')
    parser.add_argument('--no-resume', action='store_true', help='Start fresh, ignore previous progress')
    parser.add_argument('--status', action='store_true', help='Show progress and exit')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose/debug logging')

    args = parser.parse_args()

    # Validate args
    if not (1 <= args.start_month <= 12):
        print(f"Error: start-month must be 1-12, got {args.start_month}")
        sys.exit(1)
    if not (1 <= args.end_month <= 12):
        print(f"Error: end-month must be 1-12, got {args.end_month}")
        sys.exit(1)
    if args.start_year > args.end_year:
        print(f"Error: start-year ({args.start_year}) cannot be after end-year ({args.end_year})")
        sys.exit(1)

    # Status only
    if args.status:
        show_status()
        return

    # Setup logging
    setup_logging(verbose=args.verbose)
    logger = logging.getLogger(__name__)

    # Print banner
    print("=" * 60)
    print("BOE 6-Year Backfill Scraper")
    print("=" * 60)
    print(f"Range:  {args.start_year}-{args.start_month:02d} to {args.end_year}-{args.end_month:02d}")
    print(f"Resume: {'disabled' if args.no_resume else 'enabled'}")
    print(f"Search: Tipo=Todos, Estado=Cualquiera, Bien=Todos, 500/page")
    print("=" * 60)
    print()

    try:
        scraper = BOEBackfillScraper()
        results = scraper.scrape_range(
            start_year=args.start_year,
            start_month=args.start_month,
            end_year=args.end_year,
            end_month=args.end_month,
            resume=not args.no_resume,
        )

        # Print final summary
        print()
        print("=" * 60)
        print("BACKFILL COMPLETE")
        print("=" * 60)
        total = sum(results.values())
        print(f"Months scraped this run: {len(results)}")
        print(f"Auctions this run:      {total:,}")
        print()

        if results:
            print("Per-month breakdown:")
            for month_key in sorted(results.keys()):
                count = results[month_key]
                bar = '#' * min(count // 100, 50)
                print(f"  {month_key}: {count:>6,} {bar}")

        print("=" * 60)

    except KeyboardInterrupt:
        print("\n\nBackfill interrupted by user. Progress has been saved.")
        print("Run again to resume from where you left off.")
        sys.exit(0)

    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        print(f"\nError: {e}")
        print("Progress has been saved. Run again to resume.")
        sys.exit(1)


if __name__ == '__main__':
    main()
