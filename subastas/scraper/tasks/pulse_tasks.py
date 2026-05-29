"""
Pulse Mode Tasks: Update bids for active auctions
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from tasks.celeryconfig import app
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.task(name='tasks.pulse_check_active')
def pulse_check_active():
    """
    Update current_bid for all ACTIVE auctions
    Runs every 1 hour (respects BOE 30-min limit with safety margin)
    """
    logger.info("💓 Starting Pulse Check for active auctions...")
    try:
        from database.adapter import DatabaseAdapter
        from scrapers.boe_scraper import BOEScraper
        
        db = DatabaseAdapter()
        # Get all ACTIVE auctions
        active_auctions = db.get_auctions_by_status('ACTIVE')
        
        if not active_auctions:
            logger.info("No active auctions to update.")
            return {'success': True, 'updated': 0, 'total': 0}
        
        scraper = BOEScraper()
        updated_count = 0
        
        for auction in active_auctions:
            try:
                current_bid = scraper.update_bid(auction['boeId'])
                if current_bid is not None:
                    db.update_auction_bid(auction['boeId'], current_bid)
                    updated_count += 1
            except Exception as e:
                logger.error(f"Failed to update bid for {auction['boeId']}: {e}")
        
        logger.info(f"✅ Pulse Check complete. Updated {updated_count}/{len(active_auctions)} auctions.")
        return {
            'success': True,
            'updated': updated_count,
            'total': len(active_auctions)
        }
    except Exception as e:
        logger.error(f"❌ Pulse Check failed: {e}")
        return {'success': False, 'error': str(e)}


@app.task(name='tasks.urgent_pulse')
def urgent_pulse():
    """
    Monitor auctions ending in < 24 hours more frequently
    Runs every 30 minutes
    """
    logger.info("🚨 Starting Urgent Pulse for ending-soon auctions...")
    try:
        from database.adapter import DatabaseAdapter
        from scrapers.boe_scraper import BOEScraper
        from datetime import datetime, timedelta
        
        db = DatabaseAdapter()
        # Get auctions ending in the next 24 hours
        cutoff_time = datetime.now() + timedelta(hours=24)
        urgent_auctions = db.get_urgent_auctions(cutoff_time)
        
        if not urgent_auctions:
            logger.info("No urgent auctions at this time.")
            return {'success': True, 'urgent_count': 0, 'updated': 0}
        
        scraper = BOEScraper()
        updated_count = 0
        
        for auction in urgent_auctions:
            try:
                current_bid = scraper.update_bid(auction['boeId'])
                if current_bid is not None:
                    db.update_auction_bid(auction['boeId'], current_bid)
                    updated_count += 1
            except Exception as e:
                logger.error(f"Failed to update urgent auction {auction['boeId']}: {e}")
        
        logger.info(f"✅ Urgent Pulse complete. Updated {updated_count}/{len(urgent_auctions)} urgent auctions.")
        return {
            'success': True,
            'urgent_count': len(urgent_auctions),
            'updated': updated_count
        }
    except Exception as e:
        logger.error(f"❌ Urgent Pulse failed: {e}")
        return {'success': False, 'error': str(e)}
