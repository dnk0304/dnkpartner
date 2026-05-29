"""
Initial Data Collection Script
Runs all scrapers to populate the database with complete auction data

Execution order:
1. Run database migration (add new columns)
2. Run category enrichment on existing auctions
3. Run auction type detection on existing auctions
4. Start BOE pre-auction scraper
5. Start BOE vehicle scraper (all categories)
6. Start TEJU scraper
7. Enable bank scrapers
8. Run historical data batch job (2 years)
9. Display final statistics
"""

import sys
import os
from pathlib import Path
import time
from datetime import datetime

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / 'scraper'))

import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(project_root / 'logs' / f'initial_collection_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
    ]
)
logger = logging.getLogger(__name__)

# Ensure logs directory exists
(project_root / 'logs').mkdir(parents=True, exist_ok=True)


def log_header(title: str):
    """Log a section header"""
    logger.info("=" * 70)
    logger.info(f"  {title}")
    logger.info("=" * 70)


def log_step(step_num: int, total: int, description: str):
    """Log a step in the process"""
    logger.info(f"\n[{step_num}/{total}] {description}")
    logger.info("-" * 50)


def run_migration():
    """Run database migration to add new columns"""
    log_step(1, 10, "Running database migration")
    
    try:
        import subprocess
        migration_script = project_root / 'migrations' / 'add_auction_type_status.js'
        
        if migration_script.exists():
            result = subprocess.run(
                ['node', str(migration_script)],
                capture_output=True,
                text=True,
                cwd=str(project_root)
            )
            
            if result.returncode == 0:
                logger.info("✅ Migration completed successfully")
                logger.info(result.stdout)
            else:
                logger.warning(f"⚠️ Migration returned non-zero: {result.stderr}")
        else:
            logger.warning(f"Migration script not found: {migration_script}")
            logger.info("Skipping migration (may already be applied)")
        
        return True
    
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        return False


def run_category_enrichment():
    """Run category enrichment on existing auctions"""
    log_step(2, 10, "Running category enrichment")
    
    try:
        from scripts.enrich_categories import enrich_categories
        
        stats = enrich_categories(dry_run=False)
        
        logger.info(f"✅ Category enrichment completed")
        logger.info(f"   Total processed: {stats['total_generic']}")
        logger.info(f"   Updated: {stats['updated']}")
        logger.info(f"   Errors: {stats['errors']}")
        
        return True
    
    except Exception as e:
        logger.error(f"❌ Category enrichment failed: {e}")
        return False


def run_auction_type_enrichment():
    """Run auction type detection on existing auctions"""
    log_step(3, 10, "Running auction type enrichment")
    
    try:
        from scripts.enrich_auction_types import enrich_auction_types
        
        stats = enrich_auction_types(dry_run=False)
        
        logger.info(f"✅ Auction type enrichment completed")
        logger.info(f"   Total processed: {stats['total_without_type']}")
        logger.info(f"   Updated: {stats['updated']}")
        logger.info(f"   Errors: {stats['errors']}")
        
        return True
    
    except Exception as e:
        logger.error(f"❌ Auction type enrichment failed: {e}")
        return False


def run_boe_pre_auctions():
    """Scrape pre-auctions from BOE"""
    log_step(4, 10, "Scraping BOE pre-auctions (Próxima apertura)")
    
    try:
        from scrapers.boe_scraper import BOEScraper
        
        scraper = BOEScraper()
        results = scraper.scrape_pre_auctions(max_pages=20)
        
        logger.info(f"✅ BOE pre-auctions scraped: {len(results)} auctions")
        return True
    
    except Exception as e:
        logger.error(f"❌ BOE pre-auction scraping failed: {e}")
        return False


def run_boe_active():
    """Scrape active auctions from BOE"""
    log_step(5, 10, "Scraping BOE active auctions (Celebrándose)")
    
    try:
        from scrapers.boe_scraper import BOEScraper
        
        scraper = BOEScraper()
        results = scraper.scrape_active_auctions(max_pages=50)
        
        logger.info(f"✅ BOE active auctions scraped: {len(results)} auctions")
        return True
    
    except Exception as e:
        logger.error(f"❌ BOE active scraping failed: {e}")
        return False


def run_boe_vehicles():
    """Scrape vehicle auctions from BOE"""
    log_step(6, 10, "Scraping BOE vehicle auctions")
    
    try:
        from scrapers.boe_vehicle_scraper import scrape_all_vehicles
        
        results = scrape_all_vehicles(max_pages=10)
        
        total = sum(results.values())
        logger.info(f"✅ BOE vehicle auctions scraped: {total} total")
        for vtype, count in results.items():
            logger.info(f"   {vtype}: {count}")
        
        return True
    
    except Exception as e:
        logger.error(f"❌ BOE vehicle scraping failed: {e}")
        return False


def run_teju_scraper():
    """Scrape TEJU pre-auction edicts"""
    log_step(7, 10, "Scraping TEJU pre-auction edicts")
    
    try:
        from scrapers.teju_scraper import TEJUScraper
        
        scraper = TEJUScraper()
        results = scraper.scrape(max_results=50)
        
        logger.info(f"✅ TEJU pre-auctions scraped: {len(results)} edicts")
        return True
    
    except Exception as e:
        logger.error(f"❌ TEJU scraping failed: {e}")
        return False


def run_bank_scrapers():
    """Run all bank portal scrapers"""
    log_step(8, 10, "Running bank portal scrapers")
    
    results = {}
    
    # List of bank scrapers to run
    bank_scrapers = [
        ('Haya', 'scrapers.haya_scraper', 'HayaScraper'),
        ('Servihabitat', 'scrapers.servihabitat_scraper', 'ServihabitatScraper'),
        ('Altamira', 'scrapers.altamira_scraper', 'AltamiraScraper'),
        ('Solvia', 'scrapers.solvia_scraper', 'SolviaScraper'),
        ('Anticipa', 'scrapers.anticipa_scraper', 'AnticipaScraper'),
        ('Aliseda', 'scrapers.aliseda_scraper', 'AlisedaScraper'),
    ]
    
    for bank_name, module_name, class_name in bank_scrapers:
        try:
            logger.info(f"   Scraping {bank_name}...")
            
            module = __import__(module_name, fromlist=[class_name])
            scraper_class = getattr(module, class_name)
            
            scraper = scraper_class()
            auctions = scraper.scrape(max_pages=10)
            
            results[bank_name] = len(auctions)
            logger.info(f"   ✅ {bank_name}: {len(auctions)} properties")
        
        except Exception as e:
            logger.warning(f"   ⚠️ {bank_name} failed: {e}")
            results[bank_name] = 0
    
    total = sum(results.values())
    logger.info(f"✅ Bank scrapers completed: {total} total properties")
    return True


def run_historical_batch():
    """Run historical data batch job"""
    log_step(9, 10, "Running historical data batch (2 years)")
    
    try:
        from scrapers.boe_historical_scraper import run_historical_batch, get_historical_stats
        
        logger.info("   This may take several hours...")
        logger.info("   Scraping 24 months of finished auctions...")
        
        results = run_historical_batch(months=24)
        stats = get_historical_stats(results)
        
        logger.info(f"✅ Historical batch completed")
        logger.info(f"   Total auctions: {stats.get('total_auctions', 0)}")
        logger.info(f"   Months scraped: {stats.get('months_scraped', 0)}")
        logger.info(f"   Average per month: {stats.get('average_per_month', 0)}")
        
        return True
    
    except Exception as e:
        logger.error(f"❌ Historical batch failed: {e}")
        return False


def display_final_statistics():
    """Display final database statistics"""
    log_step(10, 10, "Final Statistics")
    
    try:
        import sqlite3
        
        db_path = project_root / 'data' / 'database' / 'prod.db'
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # Total count
        cursor.execute("SELECT COUNT(*) FROM Auction")
        total = cursor.fetchone()[0]
        
        # Status distribution
        cursor.execute("SELECT status, COUNT(*) FROM Auction GROUP BY status ORDER BY COUNT(*) DESC")
        status_stats = cursor.fetchall()
        
        # Auction type distribution
        cursor.execute("SELECT auctionType, COUNT(*) FROM Auction WHERE auctionType IS NOT NULL GROUP BY auctionType ORDER BY COUNT(*) DESC")
        type_stats = cursor.fetchall()
        
        # Category distribution
        cursor.execute("SELECT category, COUNT(*) FROM Auction GROUP BY category ORDER BY COUNT(*) DESC LIMIT 10")
        category_stats = cursor.fetchall()
        
        # Source distribution
        cursor.execute("SELECT source, COUNT(*) FROM Auction GROUP BY source ORDER BY COUNT(*) DESC")
        source_stats = cursor.fetchall()
        
        conn.close()
        
        logger.info(f"\n📊 DATABASE STATISTICS")
        logger.info(f"   Total auctions: {total:,}")
        
        logger.info(f"\n   By Status:")
        for status, count in status_stats:
            logger.info(f"      {status}: {count:,}")
        
        logger.info(f"\n   By Auction Type:")
        for atype, count in type_stats:
            logger.info(f"      {atype}: {count:,}")
        
        logger.info(f"\n   By Category (Top 10):")
        for category, count in category_stats:
            logger.info(f"      {category}: {count:,}")
        
        logger.info(f"\n   By Source:")
        for source, count in source_stats:
            logger.info(f"      {source}: {count:,}")
        
        return True
    
    except Exception as e:
        logger.error(f"❌ Failed to get statistics: {e}")
        return False


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Initial Data Collection')
    parser.add_argument('--skip-migration', action='store_true', help='Skip database migration')
    parser.add_argument('--skip-enrichment', action='store_true', help='Skip enrichment steps')
    parser.add_argument('--skip-historical', action='store_true', help='Skip historical batch (takes hours)')
    parser.add_argument('--banks-only', action='store_true', help='Only run bank scrapers')
    args = parser.parse_args()
    
    log_header("INITIAL DATA COLLECTION")
    logger.info(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    start_time = time.time()
    
    if args.banks_only:
        run_bank_scrapers()
        display_final_statistics()
        return
    
    # Step 1: Migration
    if not args.skip_migration:
        run_migration()
        time.sleep(2)
    
    # Step 2-3: Enrichment
    if not args.skip_enrichment:
        run_category_enrichment()
        time.sleep(2)
        run_auction_type_enrichment()
        time.sleep(2)
    
    # Step 4-5: BOE Scrapers
    run_boe_pre_auctions()
    time.sleep(30)  # Rate limiting
    run_boe_active()
    time.sleep(30)
    
    # Step 6: Vehicle Auctions
    run_boe_vehicles()
    time.sleep(30)
    
    # Step 7: TEJU
    run_teju_scraper()
    time.sleep(30)
    
    # Step 8: Bank Scrapers
    run_bank_scrapers()
    time.sleep(30)
    
    # Step 9: Historical (optional)
    if not args.skip_historical:
        run_historical_batch()
    else:
        logger.info("Skipping historical batch (--skip-historical)")
    
    # Step 10: Statistics
    display_final_statistics()
    
    elapsed = time.time() - start_time
    log_header("COLLECTION COMPLETE")
    logger.info(f"Total time: {elapsed/60:.1f} minutes")
    logger.info(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == '__main__':
    main()
