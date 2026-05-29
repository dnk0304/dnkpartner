#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PROPERTY SCRAPER SCHEDULER
Runs periodic scraping and monitors auction status changes
"""

import sys
import os
import time
import subprocess
import schedule
import sqlite3
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
import json

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DB_PATH = SCRIPT_DIR.parent / "data" / "database" / "prod.db"
LOG_DIR = SCRIPT_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
APP_BASE_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3005").rstrip("/")

class ScraperScheduler:
    def __init__(self):
        self.log_file = LOG_DIR / f"scheduler_{datetime.now().strftime('%Y%m%d')}.log"
    
    def log(self, message):
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_line = f"[{timestamp}] {message}"
        print(log_line)
        
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(log_line + '\n')
    
    def run_scraper(self, mode: str, pages: int = 50):
        """Run property scraper"""
        self.log(f"🚀 Starting {mode.upper()} scraper (pages={pages})...")
        
        try:
            if mode not in ['active', 'finished', 'pre']:
                self.log(f"  ⚠️  Unsupported mode: {mode}")
                return
            result = subprocess.run(
                ['python', 'property_scraper.py', '--mode', mode, '--pages', str(pages), '--headless'],
                cwd=str(SCRIPT_DIR),
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=600  # 10 minute timeout
            )
            
            if result.returncode == 0:
                # Parse output for stats
                output = result.stdout
                if output and 'Total properties:' in output:
                    for line in output.split('\n'):
                        if 'Total properties:' in line or 'New:' in line or 'Updated:' in line:
                            self.log(f"  {line.strip()}")
                else:
                    self.log(f"  ✅ Completed successfully")
            else:
                stderr = result.stderr if result.stderr else "No error output"
                self.log(f"  ❌ Error: {stderr[:200]}")
            
        except subprocess.TimeoutExpired:
            self.log(f"  ⏰ Timeout after 10 minutes")
        except Exception as e:
            self.log(f"  ❌ Exception: {e}")

    def run_daily_update_scraper(self):
        """Run rolling 5-day BOE daily update scraper."""
        self.log("🗓️ Running BOE daily update scraper (last 5 days)...")

        try:
            script_path = PROJECT_ROOT / "scripts" / "run_daily_update.py"
            result = subprocess.run(
                ['python', str(script_path)],
                cwd=str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=1800,  # 30 minutes
            )

            if result.returncode == 0:
                self.log("  ✅ Daily update scraper completed successfully")
                tail_lines = [line.strip() for line in result.stdout.splitlines() if line.strip()][-6:]
                for line in tail_lines:
                    self.log(f"  {line}")
            else:
                stderr = result.stderr if result.stderr else "No error output"
                self.log(f"  ❌ Daily update failed: {stderr[:400]}")
        except subprocess.TimeoutExpired:
            self.log("  ⏰ Daily update timeout after 30 minutes")
        except Exception as e:
            self.log(f"  ❌ Daily update exception: {e}")

    def trigger_alert_check(self):
        """Trigger /api/alerts/check after daily refresh jobs."""
        self.log("🔔 Triggering alert check endpoint...")

        try:
            endpoint = f"{APP_BASE_URL}/api/alerts/check"
            request = urllib.request.Request(
                endpoint,
                data=b'{}',
                headers={'Content-Type': 'application/json'},
                method='POST',
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read().decode('utf-8', errors='replace')
                self.log(f"  ✅ Alert check triggered ({response.status})")
                self.log(f"  Response: {body[:300]}")
        except Exception as e:
            self.log(f"  ❌ Alert check trigger failed: {e}")

    def run_daily_update_and_alerts(self):
        """Execute daily BOE update and alert notifications as one job."""
        self.run_daily_update_scraper()
        self.trigger_alert_check()
    
    def monitor_status_changes(self):
        """Monitor and update auction statuses (handles both old and new status values)"""
        self.log("👀 Monitoring auction status changes...")
        
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Check for auctions that should have ended (both old and new status values)
            cursor.execute("""
                SELECT id, boeId, title, endsAt, status
                FROM Auction
                WHERE (status IN ('ACTIVE', 'CELEBRANDOSE')) 
                  AND endsAt < datetime('now')
            """)
            
            expired = cursor.fetchall()
            
            if expired:
                self.log(f"  📌 Found {len(expired)} expired active auctions")
                
                # Mark them as finished with new status value
                for auction in expired:
                    auction_id = auction[0]
                    cursor.execute("""
                        UPDATE Auction 
                        SET status = 'CONCLUIDA_PORTAL', 
                            transitionedAt = CURRENT_TIMESTAMP,
                            updatedAt = CURRENT_TIMESTAMP
                        WHERE id = ?
                    """, (auction_id,))
                
                conn.commit()
                self.log(f"  ✅ Marked {len(expired)} auctions as CONCLUIDA_PORTAL")
            
            # Get stats
            cursor.execute("SELECT status, COUNT(*) FROM Auction GROUP BY status ORDER BY COUNT(*) DESC")
            stats = cursor.fetchall()
            
            self.log("  📊 Current database stats:")
            for status, count in stats:
                self.log(f"     {status}: {count}")
            
            # Also show auction type distribution
            cursor.execute("SELECT auctionType, COUNT(*) FROM Auction WHERE auctionType IS NOT NULL GROUP BY auctionType ORDER BY COUNT(*) DESC")
            type_stats = cursor.fetchall()
            
            if type_stats:
                self.log("  🏷️ Auction types:")
                for atype, count in type_stats:
                    self.log(f"     {atype}: {count}")
            
            conn.close()
            
        except Exception as e:
            self.log(f"  ❌ Error: {e}")
    
    def daily_full_scan(self):
        """Run a comprehensive scrape (larger page count)"""
        self.log("🌟 Starting daily full scan...")
        self.log("   Phase 1: Active properties")
        self.run_scraper('active', pages=100)
        time.sleep(60)
        self.log("   Phase 2: Pre-auction properties")
        self.run_scraper('pre', pages=100)
        time.sleep(60)
        self.log("   Phase 3: Finished properties (sample)")
        self.run_scraper('finished', pages=50)
    
    def scrape_pre_auctions(self):
        """Scrape pre-auction properties"""
        self.log("🔮 Scraping PRE-AUCTION properties...")
        self.run_scraper('pre', pages=50)
    
    def scrape_bank_portals(self):
        """Scrape bank portals (Servihabitat, Haya, Altamira)"""
        self.log("🏦 Scraping bank portals...")
        
        try:
            # Import and run bank tasks
            sys.path.insert(0, str(SCRIPT_DIR))
            from tasks.bank_tasks import discover_all_banks
            
            result = discover_all_banks()
            
            for bank, stats in result.items():
                self.log(f"  {bank.upper()}: {stats['found']} found, {stats['saved']} saved")
        
        except Exception as e:
            self.log(f"  ❌ Error: {e}")
    
    def run_geocoding_backfill(self):
        """Run geocoding backfill for auctions missing coordinates"""
        self.log("🗺️ Running geocoding backfill...")
        
        try:
            sys.path.insert(0, str(SCRIPT_DIR))
            from tasks.backfill_tasks import geocode_missing_coordinates
            
            result = geocode_missing_coordinates(batch_size=100)
            
            if result:
                self.log(f"  Geocoded: {result['geocoded']}, Failed: {result['failed']}")
        
        except Exception as e:
            self.log(f"  ❌ Error: {e}")

    def run_map_image_backfill(self):
        """Update map-pinpoint images for recent property auctions."""
        self.log("🖼️ Running map image backfill (last 30 days)...")

        try:
            script_path = PROJECT_ROOT / "scripts" / "backfill_map_images.py"
            result = subprocess.run(
                ['python', str(script_path)],
                cwd=str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=900,
            )

            if result.returncode == 0:
                output = (result.stdout or "").strip()
                self.log(f"  ✅ Map image backfill complete: {output}")
            else:
                stderr = result.stderr if result.stderr else "No error output"
                self.log(f"  ❌ Map image backfill failed: {stderr[:300]}")
        except subprocess.TimeoutExpired:
            self.log("  ⏰ Map image backfill timeout after 15 minutes")
        except Exception as e:
            self.log(f"  ❌ Map image backfill exception: {e}")
    
    def scrape_vehicles(self):
        """Scrape vehicle auctions from BOE"""
        self.log("🚗 Scraping vehicle auctions...")
        
        try:
            sys.path.insert(0, str(SCRIPT_DIR))
            from scrapers.boe_vehicle_scraper import scrape_all_vehicles
            
            result = scrape_all_vehicles(max_pages=10)
            
            total = sum(result.values())
            self.log(f"  Total vehicles: {total}")
            for vtype, count in result.items():
                self.log(f"    {vtype}: {count}")
        
        except Exception as e:
            self.log(f"  ❌ Error: {e}")
    
    def scrape_pulse(self):
        """Quick bid updates for active auctions (pulse mode)"""
        self.log("💓 Running pulse mode (bid updates)...")
        
        try:
            sys.path.insert(0, str(SCRIPT_DIR))
            from tasks.pulse_tasks import pulse_check_active
            result = pulse_check_active()
            if result and result.get('success'):
                self.log(f"  ✅ Pulse updated {result.get('updated', 0)} auctions")
            else:
                self.log("  ⚠️  Pulse completed with no updates")
        except Exception as e:
            self.log(f"  ❌ Pulse error: {e}")
    
    def scrape_teju(self):
        """Scrape TEJU pre-auction edicts"""
        self.log("📜 Scraping TEJU pre-auction edicts...")
        
        try:
            sys.path.insert(0, str(SCRIPT_DIR))
            from scrapers.teju_scraper import TEJUScraper
            
            scraper = TEJUScraper()
            results = scraper.scrape(max_results=50)
            self.log(f"  Found {len(results)} TEJU pre-auctions")
        
        except Exception as e:
            self.log(f"  ❌ Error: {e}")
    
    def run_historical_batch(self):
        """Run historical data batch job (daily at 3 AM)"""
        self.log("📊 Running historical data batch...")
        
        try:
            sys.path.insert(0, str(SCRIPT_DIR))
            from scrapers.boe_historical_scraper import run_historical_batch
            
            # Scrape last 1 month (incremental)
            result = run_historical_batch(months=1)
            total = sum(result.values())
            self.log(f"  Historical auctions scraped: {total}")
        
        except Exception as e:
            self.log(f"  ❌ Error: {e}")
    
    def setup_schedule(self):
        """Setup comprehensive scraping schedule"""
        self.log("=" * 70)
        self.log("🤖 SUBASTAPRO SCHEDULER STARTED")
        self.log("=" * 70)
        self.log("🏠 Sources: BOE (Active, Pre-auction, Vehicles, Historical)")
        self.log("           TEJU, Banks (Haya, Servihabitat, Altamira, Solvia, Anticipa, Aliseda)")
        self.log("=" * 70)
        
        # === REAL-TIME UPDATES (High Priority) ===
        
        # Pulse mode - quick bid updates every 35 minutes
        schedule.every(35).minutes.do(self.scrape_pulse)
        
        # Active auctions (EJ) - every 35 minutes
        schedule.every(35).minutes.do(lambda: self.run_scraper('active', pages=30))
        
        # === REGULAR SCRAPING ===
        
        # Pre-auctions (PA) - every hour
        schedule.every(1).hours.do(self.scrape_pre_auctions)
        
        # Vehicle auctions - every hour
        schedule.every(1).hours.do(self.scrape_vehicles)
        
        # TEJU edicts - every 2 hours
        schedule.every(2).hours.do(self.scrape_teju)
        
        # Bank portals - every 6 hours
        schedule.every(6).hours.do(self.scrape_bank_portals)
        
        # === MAINTENANCE TASKS ===
        
        # Status monitoring - every 30 minutes
        schedule.every(30).minutes.do(self.monitor_status_changes)
        
        # Geocoding backfill - every 2 hours
        schedule.every(2).hours.do(self.run_geocoding_backfill)
        
        # === OFF-PEAK BATCH JOBS ===

        # Daily BOE updates (same query strategy as 2026-today backfill)
        schedule.every().day.at("08:00").do(self.run_daily_update_and_alerts)
        schedule.every().day.at("14:00").do(self.run_daily_update_and_alerts)
        schedule.every().day.at("20:00").do(self.run_daily_update_and_alerts)
        
        # Daily full scan at 3 AM
        schedule.every().day.at("03:00").do(self.daily_full_scan)
        
        # Historical data batch at 3:30 AM
        schedule.every().day.at("03:30").do(self.run_historical_batch)
        
        # Bank portals at 4 AM
        schedule.every().day.at("04:00").do(self.scrape_bank_portals)

        # Daily property map image refresh at 5 AM
        schedule.every().day.at("05:00").do(self.run_map_image_backfill)
        
        self.log("📅 Schedule configured:")
        self.log("")
        self.log("   REAL-TIME (Priority):")
        self.log("   - Pulse (bid updates): Every 35 min ⭐")
        self.log("   - Active auctions: Every 35 min")
        self.log("")
        self.log("   REGULAR:")
        self.log("   - Pre-auctions: Every 1 hour")
        self.log("   - Vehicle auctions: Every 1 hour")
        self.log("   - TEJU edicts: Every 2 hours")
        self.log("   - Bank portals: Every 6 hours")
        self.log("")
        self.log("   MAINTENANCE:")
        self.log("   - Status monitor: Every 30 min")
        self.log("   - Geocoding: Every 2 hours")
        self.log("")
        self.log("   OFF-PEAK (Daily):")
        self.log("   - BOE daily update + alerts: 08:00, 14:00, 20:00")
        self.log("   - Full scan: 03:00 AM")
        self.log("   - Historical batch: 03:30 AM")
        self.log("   - Bank portals: 04:00 AM")
        self.log("   - Map image backfill: 05:00 AM")
        self.log("")
        
        # Run initial scrape
        self.log("🎬 Running initial scrape...")
        self.log("🏠 Scraping ACTIVE auctions...")
        self.run_scraper('active', pages=30)
        self.log("🔮 Scraping PRE-AUCTION properties...")
        self.run_scraper('pre', pages=30)
        self.log("🚗 Scraping vehicle auctions...")
        self.scrape_vehicles()
        self.monitor_status_changes()
        self.run_geocoding_backfill()
    
    def run(self):
        """Main loop"""
        self.setup_schedule()
        
        try:
            while True:
                schedule.run_pending()
                time.sleep(60)  # Check every minute
                
        except KeyboardInterrupt:
            self.log("\n⏹️  Scheduler stopped by user")
        except Exception as e:
            self.log(f"\n❌ Fatal error: {e}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Property Scraper Scheduler')
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    parser.add_argument('--mode', type=str, choices=['active', 'finished', 'pre'], 
                       default='active', help='Mode for single run')
    
    args = parser.parse_args()
    
    scheduler = ScraperScheduler()
    
    if args.once:
        scheduler.log(f"Running {args.mode.upper()} scraper once...")
        scheduler.run_scraper(args.mode, pages=50)
        scheduler.monitor_status_changes()
    else:
        scheduler.run()

if __name__ == '__main__':
    main()
