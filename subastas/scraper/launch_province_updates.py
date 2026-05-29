#!/usr/bin/env python3
"""
Launch 6 parallel province update scrapers for different year ranges.
Each scraper processes 15-day batches to avoid BOE rate limits.
"""

import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Scraper configurations: (scraper_id, start_date, end_date, description)
SCRAPERS = [
    (1, '2015-01-01', '2017-12-31', '2015-2017'),
    (2, '2018-01-01', '2019-12-31', '2018-2019'),
    (3, '2020-01-01', '2021-12-31', '2020-2021'),
    (4, '2022-01-01', '2023-12-31', '2022-2023'),
    (5, '2024-01-01', '2025-12-31', '2024-2025'),
    (6, '2026-01-01', datetime.now().strftime('%Y-%m-%d'), '2026-Present'),
]

def launch_scraper(scraper_id: int, start_date: str, end_date: str, description: str):
    """Launch a single scraper in a new process"""
    scraper_script = Path(__file__).parent / 'scrapers' / 'province_update_scraper.py'
    
    cmd = [
        sys.executable,
        str(scraper_script),
        '--id', str(scraper_id),
        '--start', start_date,
        '--end', end_date
    ]
    
    print(f"🚀 Launching Scraper {scraper_id} ({description}): {start_date} to {end_date}")
    
    # Start process in background
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    return process

def main():
    """Launch all 6 scrapers in parallel"""
    print("="*70)
    print("  BOE Province/Municipality Update - Parallel Scrapers")
    print("="*70)
    print()
    print(f"Starting 6 scrapers to update auction location data...")
    print(f"Each scraper processes 15-day batches")
    print(f"Estimated time: 2-3 hours with all 6 running")
    print()
    
    processes = []
    
    for scraper_id, start_date, end_date, description in SCRAPERS:
        process = launch_scraper(scraper_id, start_date, end_date, description)
        processes.append((scraper_id, description, process))
    
    print()
    print("="*70)
    print("All scrapers launched!")
    print("="*70)
    print()
    print("Monitor progress:")
    for scraper_id, description, _ in processes:
        log_file = f"scraper/province_update_{scraper_id}_{datetime.now().strftime('%Y%m%d')}.log"
        progress_file = f"scraper/province_update_{scraper_id}_progress.json"
        print(f"  Scraper {scraper_id} ({description}):")
        print(f"    Log: {log_file}")
        print(f"    Progress: {progress_file}")
        print()
    
    print("Press Ctrl+C to stop all scrapers")
    print()
    
    try:
        # Wait for all processes
        for scraper_id, description, process in processes:
            process.wait()
            print(f"✓ Scraper {scraper_id} ({description}) completed")
    
    except KeyboardInterrupt:
        print("\n\nStopping all scrapers...")
        for scraper_id, description, process in processes:
            process.terminate()
            print(f"  Stopped Scraper {scraper_id} ({description})")
    
    print("\nAll scrapers finished!")

if __name__ == '__main__':
    main()
