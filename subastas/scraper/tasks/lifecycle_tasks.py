"""
Lifecycle Tasks: Manage auction status transitions
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from tasks.celeryconfig import app
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.task(name='tasks.check_status_transitions')
def check_status_transitions():
    """
    Check and update auction lifecycle status transitions:
    - PRE_AUCTION -> ACTIVE (when appears on BOE)
    - ACTIVE -> FINISHED (when auction ends)
    - ACTIVE -> SUSPENDED (on court order)
    
    Runs every 1 hour
    """
    logger.info("🔄 Starting status transition check...")
    try:
        from database.adapter import DatabaseAdapter
        from scrapers.boe_scraper import BOEScraper
        
        db = DatabaseAdapter()
        transitions = {
            'pre_to_active': 0,
            'active_to_finished': 0,
            'suspended_to_active': 0
        }
        
        # 1. Check PRE_AUCTION -> ACTIVE
        pre_auctions = db.get_auctions_by_status('PRE_AUCTION')
        logger.info(f"Checking {len(pre_auctions)} PRE_AUCTION items...")
        
        scraper = BOEScraper()
        for auction in pre_auctions:
            try:
                # Check if auction now appears on BOE
                boe_id = auction.get('boeId') or auction.get('courtReference')
                if not boe_id:
                    continue
                
                # Try to find it on BOE
                boe_data = scraper.get_auction_details(boe_id)
                if boe_data:
                    # Found on BOE, transition to ACTIVE
                    db.transition_status(
                        boe_id=boe_id,
                        from_status='PRE_AUCTION',
                        to_status='ACTIVE',
                        metadata={'boe_data': boe_data}
                    )
                    transitions['pre_to_active'] += 1
                    logger.info(f"✅ Transitioned {boe_id} from PRE_AUCTION to ACTIVE")
            except Exception as e:
                logger.error(f"Error checking PRE_AUCTION {auction.get('id')}: {e}")
        
        # 2. Check ACTIVE -> FINISHED
        active_auctions = db.get_auctions_by_status('ACTIVE')
        logger.info(f"Checking {len(active_auctions)} ACTIVE items...")
        
        now = datetime.now()
        for auction in active_auctions:
            try:
                ends_at = auction.get('endsAt')
                if ends_at and isinstance(ends_at, datetime):
                    if ends_at < now:
                        # Auction has ended, transition to FINISHED
                        db.transition_status(
                            boe_id=auction['boeId'],
                            from_status='ACTIVE',
                            to_status='FINISHED'
                        )
                        transitions['active_to_finished'] += 1
                        logger.info(f"✅ Transitioned {auction['boeId']} from ACTIVE to FINISHED")
            except Exception as e:
                logger.error(f"Error checking ACTIVE {auction.get('boeId')}: {e}")
        
        # 3. Check SUSPENDED -> ACTIVE (if resumed)
        suspended_auctions = db.get_auctions_by_status('SUSPENDED')
        logger.info(f"Checking {len(suspended_auctions)} SUSPENDED items...")
        
        for auction in suspended_auctions:
            try:
                # Check if auction is back on BOE
                boe_data = scraper.get_auction_details(auction['boeId'])
                if boe_data and boe_data.get('status') == 'ACTIVE':
                    db.transition_status(
                        boe_id=auction['boeId'],
                        from_status='SUSPENDED',
                        to_status='ACTIVE'
                    )
                    transitions['suspended_to_active'] += 1
                    logger.info(f"✅ Transitioned {auction['boeId']} from SUSPENDED to ACTIVE")
            except Exception as e:
                logger.error(f"Error checking SUSPENDED {auction.get('boeId')}: {e}")
        
        total_transitions = sum(transitions.values())
        logger.info(f"✅ Status transitions complete. Total: {total_transitions} ({transitions})")
        return {
            'success': True,
            'transitions': transitions,
            'total': total_transitions
        }
    except Exception as e:
        logger.error(f"❌ Status transition check failed: {e}")
        return {'success': False, 'error': str(e)}


@app.task(name='tasks.check_cancelled_auctions')
def check_cancelled_auctions():
    """
    Check for auctions that have been cancelled by court order
    Runs daily at 10:00
    """
    logger.info("🚫 Checking for cancelled auctions...")
    try:
        from database.adapter import DatabaseAdapter
        from scrapers.boe_scraper import BOEScraper
        
        db = DatabaseAdapter()
        scraper = BOEScraper()
        cancelled_count = 0
        
        # Check ACTIVE and PRE_AUCTION items
        statuses = ['ACTIVE', 'PRE_AUCTION']
        for status in statuses:
            auctions = db.get_auctions_by_status(status)
            
            for auction in auctions:
                try:
                    boe_id = auction['boeId']
                    # Check if auction has been cancelled
                    boe_data = scraper.get_auction_details(boe_id)
                    
                    if boe_data and boe_data.get('status') == 'CANCELLED':
                        db.transition_status(
                            boe_id=boe_id,
                            from_status=status,
                            to_status='CANCELLED'
                        )
                        cancelled_count += 1
                        logger.info(f"✅ Marked {boe_id} as CANCELLED")
                except Exception as e:
                    logger.error(f"Error checking {auction.get('boeId')}: {e}")
        
        logger.info(f"✅ Cancellation check complete. Found {cancelled_count} cancelled auctions.")
        return {'success': True, 'cancelled_count': cancelled_count}
    except Exception as e:
        logger.error(f"❌ Cancellation check failed: {e}")
        return {'success': False, 'error': str(e)}
