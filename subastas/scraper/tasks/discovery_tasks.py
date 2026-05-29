"""
Discovery Mode Tasks: Find new auctions from all sources
"""
from celery import group
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from tasks.celeryconfig import app
from config.provinces import PROVINCES
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.task(name='tasks.discover_boe_province')
def discover_boe_province(province: str):
    """
    Scrape BOE for a single province
    """
    logger.info(f"🔍 Discovering BOE auctions for {province}...")
    try:
        # Import here to avoid circular imports
        from scrapers.boe_scraper import BOEScraper
        
        scraper = BOEScraper(province=province)
        results = scraper.scrape_active(max_pages=10)
        
        logger.info(f"✅ Found {len(results)} auctions in {province}")
        return {'success': True, 'province': province, 'count': len(results)}
    except Exception as e:
        logger.error(f"❌ Failed to scrape {province}: {e}")
        return {'success': False, 'province': province, 'error': str(e)}


@app.task(name='tasks.discover_boe_all_provinces')
def discover_boe_all_provinces():
    """
    Scrape BOE for all 50 provinces with staggered delays
    Respects the 1-hour rate limit by processing provinces sequentially
    """
    logger.info("🔍 Starting BOE discovery for all provinces...")
    total_found = 0
    successful = 0
    failed = 0
    
    try:
        for province_name, province_data in PROVINCES.items():
            try:
                result = discover_boe_province(province_name)
                if result.get('success'):
                    successful += 1
                    total_found += result.get('count', 0)
                else:
                    failed += 1
                
                # 120 second delay between provinces (2 minutes)
                # 50 provinces * 2 min = 100 minutes total
                time.sleep(120)
            except Exception as e:
                logger.error(f"❌ Error processing {province_name}: {e}")
                failed += 1
        
        logger.info(f"✅ BOE discovery complete. {successful} successful, {failed} failed, {total_found} total auctions")
        return {
            'success': True,
            'total_found': total_found,
            'successful_provinces': successful,
            'failed_provinces': failed
        }
    except Exception as e:
        logger.error(f"❌ BOE discovery failed: {e}")
        return {'success': False, 'error': str(e)}


@app.task(name='tasks.discover_teju')
def discover_teju():
    """
    Scan TEJU for new pre-auction edicts
    Runs every 4 hours
    """
    logger.info("📄 Starting TEJU discovery...")
    try:
        from scrapers.teju_scraper import TEJUScraper
        
        total_found = 0
        # Scan all provinces
        for province_name in PROVINCES.keys():
            try:
                scraper = TEJUScraper(province=province_name)
                results = scraper.scrape_edicts(keywords=['subasta', 'ejecucion hipotecaria', 'embargo'])
                total_found += len(results)
                logger.info(f"Found {len(results)} edicts in {province_name}")
            except Exception as e:
                logger.error(f"Error scanning TEJU for {province_name}: {e}")
        
        logger.info(f"✅ TEJU discovery complete. Found {total_found} pre-auctions.")
        return {'success': True, 'new_pre_auctions': total_found}
    except Exception as e:
        logger.error(f"❌ TEJU discovery failed: {e}")
        return {'success': False, 'error': str(e)}


@app.task(name='tasks.discover_sede')
def discover_sede():
    """
    Scan Sede Judicial for new proceedings
    Runs daily at 06:00
    """
    logger.info("🏛️ Starting Sede Judicial discovery...")
    try:
        from scrapers.sede_scraper import SedeJudicialScraper
        
        total_found = 0
        # Scan all provinces
        for province_name in PROVINCES.keys():
            try:
                scraper = SedeJudicialScraper(province=province_name)
                results = scraper.scrape_ejecuciones()
                total_found += len(results)
                logger.info(f"Found {len(results)} proceedings in {province_name}")
            except Exception as e:
                logger.error(f"Error scanning Sede for {province_name}: {e}")
        
        logger.info(f"✅ Sede Judicial discovery complete. Found {total_found} proceedings.")
        return {'success': True, 'new_proceedings': total_found}
    except Exception as e:
        logger.error(f"❌ Sede discovery failed: {e}")
        return {'success': False, 'error': str(e)}


@app.task(name='tasks.discover_registro')
def discover_registro():
    """
    Scan Registro de la Propiedad for properties with liens
    Runs daily at 07:00
    """
    logger.info("📋 Starting Registro discovery...")
    try:
        from scrapers.registro_scraper import RegistroScraper
        
        total_found = 0
        # Scan all provinces
        for province_name in PROVINCES.keys():
            try:
                scraper = RegistroScraper(province=province_name)
                results = scraper.search_cargas()
                total_found += len(results)
                logger.info(f"Found {len(results)} properties with liens in {province_name}")
            except Exception as e:
                logger.error(f"Error scanning Registro for {province_name}: {e}")
        
        logger.info(f"✅ Registro discovery complete. Found {total_found} properties.")
        return {'success': True, 'properties_found': total_found}
    except Exception as e:
        logger.error(f"❌ Registro discovery failed: {e}")
        return {'success': False, 'error': str(e)}


@app.task(name='tasks.discover_borme')
def discover_borme():
    """
    Scan BORME for business/commercial auctions
    Runs daily at 09:00
    """
    logger.info("💼 Starting BORME discovery...")
    try:
        from scrapers.borme_scraper import BORMEScraper
        
        total_found = 0
        # Scan all provinces
        for province_name in PROVINCES.keys():
            try:
                scraper = BORMEScraper(province=province_name)
                liquidaciones = scraper.scrape_liquidaciones()
                concursos = scraper.scrape_concursos()
                results = liquidaciones + concursos
                total_found += len(results)
                logger.info(f"Found {len(results)} business auctions in {province_name}")
            except Exception as e:
                logger.error(f"Error scanning BORME for {province_name}: {e}")
        
        logger.info(f"✅ BORME discovery complete. Found {total_found} business auctions.")
        return {'success': True, 'business_auctions': total_found}
    except Exception as e:
        logger.error(f"❌ BORME discovery failed: {e}")
        return {'success': False, 'error': str(e)}
