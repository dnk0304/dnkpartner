"""
SubastaPro Scraper - Complete Implementation
Main entry point for all scraper operations
"""

import sys
import logging
import io
from pathlib import Path

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

# Add repo root to path so package imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from scraper.config.settings import print_config, LOG_LEVEL
    from scraper.scrapers.boe_scraper import BOEScraper
    from scraper.scrapers.teju_scraper import TEJUScraper
    from scraper.scrapers.sede_scraper import SedeJudicialScraper
    from scraper.scrapers.registro_scraper import RegistroScraper
    from scraper.scrapers.borme_scraper import BORMEScraper
    from scraper.database.adapter import get_database_adapter
except Exception:
    # Fallback for direct execution within scraper folder
    sys.path.insert(0, str(Path(__file__).parent))
    from config.settings import print_config, LOG_LEVEL
    from scrapers.boe_scraper import BOEScraper
    from scrapers.teju_scraper import TEJUScraper
    from scrapers.sede_scraper import SedeJudicialScraper
    from scrapers.registro_scraper import RegistroScraper
    from scrapers.borme_scraper import BORMEScraper
    from database.adapter import get_database_adapter

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def main():
    """Main CLI entry point"""
    print("=" * 70)
    print("🚀 SubastaPro Scraper v2.0 - Complete Implementation")
    print("=" * 70)
    print()
    
    if len(sys.argv) < 2:
        show_help()
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    # Print configuration
    if '--config' in sys.argv or command == 'config':
        print_config()
        return
    
    # Execute commands
    try:
        if command == 'discover':
            run_discovery()
        
        elif command == 'pulse':
            run_pulse()
        
        elif command == 'teju':
            run_teju()
        
        elif command == 'sede':
            run_sede()
        
        elif command == 'registro':
            run_registro()
        
        elif command == 'borme':
            run_borme()
        
        elif command == 'all':
            run_all_scrapers()
        
        elif command == 'test':
            run_tests()
        
        else:
            print(f"❌ Unknown command: {command}")
            show_help()
            sys.exit(1)
    
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted by user")
        sys.exit(0)
    
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


def show_help():
    """Display help message"""
    print("Usage: python main.py [command] [options]")
    print()
    print("Commands:")
    print("  discover    - Run BOE discovery for all provinces")
    print("  pulse       - Update bids for active auctions")
    print("  teju        - Scan TEJU for pre-auction edicts")
    print("  sede        - Scan Sede Judicial for court proceedings")
    print("  registro    - Scan Registro de la Propiedad")
    print("  borme       - Scan BORME for commercial auctions")
    print("  all         - Run all scrapers sequentially")
    print("  test        - Run scraper tests")
    print("  config      - Show current configuration")
    print()
    print("Options:")
    print("  --province <name>   - Limit to specific province")
    print("  --max-pages <n>     - Maximum pages to scrape")
    print("  --config            - Show configuration")
    print()
    print("Examples:")
    print("  python main.py discover --province 'Las Palmas'")
    print("  python main.py teju --province 'Madrid'")
    print("  python main.py all")


def get_province_arg() -> str:
    """Get province from command line args"""
    if '--province' in sys.argv:
        idx = sys.argv.index('--province')
        if idx + 1 < len(sys.argv):
            return sys.argv[idx + 1]
    return None


def get_max_pages_arg() -> int:
    """Get max pages from command line args"""
    if '--max-pages' in sys.argv:
        idx = sys.argv.index('--max-pages')
        if idx + 1 < len(sys.argv):
            try:
                return int(sys.argv[idx + 1])
            except:
                pass
    return 5  # Default


def run_discovery():
    """Run BOE discovery scraper"""
    print("\n🔍 Running BOE Discovery Scraper")
    print("-" * 70)
    
    province = get_province_arg()
    max_pages = get_max_pages_arg()
    
    scraper = BOEScraper(province=province)
    
    if province:
        logger.info(f"Scraping BOE for province: {province}")
        results = scraper.scrape(max_pages=max_pages)
        print(f"\n✅ Completed: {len(results)} auctions found")
        print(f"📊 Stats: {scraper.get_stats()}")
    else:
        logger.info("Scraping BOE for ALL provinces")
        results = scraper.scrape_all_provinces(max_pages=max_pages, delay_between=120)
        total = sum(results.values())
        print(f"\n✅ Completed: {total} total auctions across {len(results)} provinces")
        for prov, count in results.items():
            if count > 0:
                print(f"  {prov}: {count}")


def run_pulse():
    """Run BOE pulse mode (update active auctions)"""
    print("\n💓 Running BOE Pulse Mode")
    print("-" * 70)
    
    db_adapter = get_database_adapter()
    active_auctions = db_adapter.get_active_auctions()
    
    print(f"Found {len(active_auctions)} active auctions to update")
    
    scraper = BOEScraper()
    updated = 0
    
    for auction in active_auctions[:20]:  # Limit for demo
        boe_id = auction.get('boeId') or auction.get('boe_id')
        if boe_id:
            logger.info(f"Updating {boe_id}")
            current_bid = scraper.update_bid(boe_id)
            if current_bid:
                updated += 1
    
    print(f"\n✅ Updated {updated} auctions")


def run_teju():
    """Run TEJU pre-auction scraper"""
    print("\n📄 Running TEJU Pre-Auction Scraper")
    print("-" * 70)
    
    province = get_province_arg()
    
    scraper = TEJUScraper(province=province)
    results = scraper.scrape(max_results=10)
    
    print(f"\n✅ Completed: {len(results)} pre-auctions found")
    print(f"📊 Stats: {scraper.get_stats()}")


def run_sede():
    """Run Sede Judicial scraper"""
    print("\n⚖️  Running Sede Judicial Scraper")
    print("-" * 70)
    
    province = get_province_arg()
    
    scraper = SedeJudicialScraper(province=province)
    results = scraper.scrape(max_results=20)
    
    print(f"\n✅ Completed: {len(results)} court proceedings found")
    print(f"📊 Stats: {scraper.get_stats()}")


def run_registro():
    """Run Registro de la Propiedad scraper"""
    print("\n📋 Running Registro de la Propiedad Scraper")
    print("-" * 70)
    
    province = get_province_arg()
    
    scraper = RegistroScraper(province=province)
    results = scraper.scrape(max_results=10)
    
    print(f"\n✅ Completed: {len(results)} properties found")
    print(f"📊 Stats: {scraper.get_stats()}")


def run_borme():
    """Run BORME commercial auction scraper"""
    print("\n💼 Running BORME Commercial Scraper")
    print("-" * 70)
    
    province = get_province_arg()
    
    scraper = BORMEScraper(province=province)
    results = scraper.scrape(max_results=20)
    
    print(f"\n✅ Completed: {len(results)} commercial auctions found")
    print(f"📊 Stats: {scraper.get_stats()}")


def run_all_scrapers():
    """Run all scrapers sequentially"""
    print("\n🔄 Running ALL Scrapers")
    print("=" * 70)
    
    province = get_province_arg()
    
    print("\n[1/5] BOE Discovery...")
    run_discovery()
    
    print("\n[2/5] TEJU Pre-Auctions...")
    run_teju()
    
    print("\n[3/5] Sede Judicial...")
    run_sede()
    
    print("\n[4/5] Registro de la Propiedad...")
    run_registro()
    
    print("\n[5/5] BORME Commercial...")
    run_borme()
    
    print("\n" + "=" * 70)
    print("✅ All scrapers completed!")


def run_tests():
    """Run basic scraper tests"""
    print("\n🧪 Running Scraper Tests")
    print("-" * 70)
    
    # Test 1: Database connection
    print("\n[Test 1] Database Connection...")
    try:
        db = get_database_adapter()
        db.connect()
        print("  ✅ Database connection successful")
    except Exception as e:
        print(f"  ❌ Database connection failed: {e}")
    
    # Test 2: BOE Scraper initialization
    print("\n[Test 2] BOE Scraper Initialization...")
    try:
        scraper = BOEScraper(province='Las Palmas')
        assert scraper.get_source_name() == 'BOE'
        print("  ✅ BOE scraper initialized")
    except Exception as e:
        print(f"  ❌ BOE scraper failed: {e}")
    
    # Test 3: TEJU Scraper initialization
    print("\n[Test 3] TEJU Scraper Initialization...")
    try:
        scraper = TEJUScraper(province='Madrid')
        assert scraper.get_source_name() == 'TEJU'
        print("  ✅ TEJU scraper initialized")
    except Exception as e:
        print(f"  ❌ TEJU scraper failed: {e}")
    
    # Test 4: Province codes
    print("\n[Test 4] Province Code Resolution...")
    try:
        from config.provinces import get_province_code
        code = get_province_code('Las Palmas')
        assert code == '35'
        print("  ✅ Province codes working")
    except Exception as e:
        print(f"  ❌ Province codes failed: {e}")
    
    # Test 5: Category classification
    print("\n[Test 5] Category Classification...")
    try:
        from config.categories import get_category_type
        category = get_category_type('Vivienda en Madrid', '')
        assert 'Vivienda' in category
        print("  ✅ Category classification working")
    except Exception as e:
        print(f"  ❌ Category classification failed: {e}")
    
    print("\n" + "-" * 70)
    print("✅ Tests completed!")


if __name__ == '__main__':
    main()
