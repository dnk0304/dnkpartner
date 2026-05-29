from celeryconfig import app
from boe_scraper import scrape_boe_new_auctions, update_active_auction_bids
from teju_scraper import scrape_teju_pre_auctions
from db import get_active_auctions, get_urgent_auctions
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.task(name='tasks.discovery_sync')
def discovery_sync():
    """
    Discovery Mode: Scrape BOE for new auctions in Las Palmas
    Runs every 6 hours
    """
    logger.info("🔍 Starting Discovery Sync...")
    try:
        new_count = scrape_boe_new_auctions(province='Las Palmas')
        logger.info(f"✅ Discovery Sync complete. Found {new_count} new auctions.")
        return {'success': True, 'new_auctions': new_count}
    except Exception as e:
        logger.error(f"❌ Discovery Sync failed: {e}")
        return {'success': False, 'error': str(e)}

@app.task(name='tasks.pulse_check')
def pulse_check():
    """
    Pulse Mode: Update current_bid for all ACTIVE auctions
    Runs every 30 minutes
    """
    logger.info("💓 Starting Pulse Check...")
    try:
        active_auctions = get_active_auctions()
        updated_count = 0
        
        for auction in active_auctions:
            try:
                update_active_auction_bids(auction['boe_id'])
                updated_count += 1
            except Exception as e:
                logger.error(f"Failed to update {auction['boe_id']}: {e}")
        
        logger.info(f"✅ Pulse Check complete. Updated {updated_count}/{len(active_auctions)} auctions.")
        return {'success': True, 'updated': updated_count, 'total': len(active_auctions)}
    except Exception as e:
        logger.error(f"❌ Pulse Check failed: {e}")
        return {'success': False, 'error': str(e)}

@app.task(name='tasks.urgent_pulse')
def urgent_pulse():
    """
    Urgent Pulse: Monitor auctions ending in < 24 hours more frequently
    Runs every 15 minutes
    """
    logger.info("🚨 Starting Urgent Pulse...")
    try:
        urgent_auctions = get_urgent_auctions(hours=24)
        
        if not urgent_auctions:
            logger.info("No urgent auctions at this time.")
            return {'success': True, 'urgent_count': 0}
        
        updated_count = 0
        for auction in urgent_auctions:
            try:
                update_active_auction_bids(auction['boe_id'])
                updated_count += 1
            except Exception as e:
                logger.error(f"Failed to update urgent auction {auction['boe_id']}: {e}")
        
        logger.info(f"✅ Urgent Pulse complete. Updated {updated_count}/{len(urgent_auctions)} urgent auctions.")
        return {'success': True, 'urgent_count': len(urgent_auctions), 'updated': updated_count}
    except Exception as e:
        logger.error(f"❌ Urgent Pulse failed: {e}")
        return {'success': False, 'error': str(e)}

@app.task(name='tasks.teju_scan')
def teju_scan():
    """
    TEJU Scanner: Scrape TEJU for pre-auction PDFs and extract data using OCR
    Runs daily at 08:00
    """
    logger.info("📄 Starting TEJU Scan...")
    try:
        new_count = scrape_teju_pre_auctions(province='Las Palmas')
        logger.info(f"✅ TEJU Scan complete. Found {new_count} new pre-auctions.")
        return {'success': True, 'new_pre_auctions': new_count}
    except Exception as e:
        logger.error(f"❌ TEJU Scan failed: {e}")
        return {'success': False, 'error': str(e)}
