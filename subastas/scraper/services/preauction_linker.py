"""
Pre-Auction Linker Service
Links pre-auction listings (TEJU) to active BOE listings when they appear
"""

from typing import Optional, List
from datetime import datetime, timedelta
from database.adapter import DatabaseAdapter
from database.models import AuctionModel
import logging

logger = logging.getLogger(__name__)


class PreAuctionLinker:
    """
    Service for linking pre-auction listings to active BOE listings
    Helps track auction lifecycle from first detection to completion
    """
    
    def __init__(self):
        self.db = DatabaseAdapter()
    
    def find_matching_preauction(self, boe_auction: AuctionModel) -> Optional[str]:
        """
        Find a pre-auction listing that matches a new BOE auction
        
        Args:
            boe_auction: Newly discovered BOE auction
        
        Returns:
            Pre-auction ID if match found, None otherwise
        """
        # Strategy 1: Match by procedure number (most reliable)
        if boe_auction.procedure_number:
            preauction = self._find_by_procedure_number(boe_auction.procedure_number)
            if preauction:
                logger.info(f"Matched by procedure number: {boe_auction.procedure_number}")
                return preauction
        
        # Strategy 2: Match by cadastral reference
        # Note: Would need to add cadastral_reference to AuctionModel
        
        # Strategy 3: Fuzzy match by address + province
        if boe_auction.address and boe_auction.province:
            preauction = self._find_by_address_fuzzy(boe_auction.address, boe_auction.province)
            if preauction:
                logger.info(f"Matched by address: {boe_auction.address}")
                return preauction
        
        return None
    
    def link_preauction_to_active(self, teju_id: str, boe_id: str) -> bool:
        """
        Link a pre-auction record to an active BOE auction
        
        Args:
            teju_id: Pre-auction ID (from TEJU/Sede)
            boe_id: BOE auction ID
        
        Returns:
            True if successfully linked
        """
        try:
            # Update pre-auction record to reference the BOE auction
            # Strategy: Add a new field 'linked_boe_id' or update status
            
            # For now, we'll update the pre-auction status to ACTIVE
            # and store the BOE ID in a reference field
            
            update_data = {
                'status': 'ACTIVE',
                'original_source': 'TEJU',  # Preserve that it was pre-auction
                'court_reference': boe_id,  # Store BOE ID here
                'transitioned_at': datetime.now(),
            }
            
            success = self.db.update_auction(teju_id, update_data)
            
            if success:
                logger.info(f"Linked pre-auction {teju_id} to BOE {boe_id}")
            
            return success
        
        except Exception as e:
            logger.error(f"Error linking pre-auction {teju_id} to {boe_id}: {e}")
            return False
    
    def mark_zombie_preauctions(self, days_threshold: int = 90) -> int:
        """
        Mark pre-auctions that never transitioned to active as 'zombie'/stale
        
        Args:
            days_threshold: Days since detection to consider stale
        
        Returns:
            Number of auctions marked as stale
        """
        try:
            threshold_date = datetime.now() - timedelta(days=days_threshold)
            
            # Query pre-auction items older than threshold
            query = """
                SELECT boeId FROM Auction
                WHERE status = 'PRE_AUCTION'
                AND publishedAt < ?
                AND courtReference IS NULL
            """
            
            stale_auctions = self.db.query_auctions(query, (threshold_date,))
            
            count = 0
            for auction in stale_auctions:
                try:
                    # Mark as stale (or archived)
                    self.db.update_auction(auction['boeId'], {
                        'status': 'CANCELLED',  # Or create a new 'STALE' status
                        'transitioned_at': datetime.now()
                    })
                    count += 1
                except Exception as e:
                    logger.error(f"Error marking {auction['boeId']} as stale: {e}")
            
            logger.info(f"Marked {count} pre-auctions as stale (>{days_threshold} days)")
            return count
        
        except Exception as e:
            logger.error(f"Error marking zombie pre-auctions: {e}")
            return 0
    
    # Private helper methods
    
    def _find_by_procedure_number(self, procedure_number: str) -> Optional[str]:
        """Find pre-auction by procedure number"""
        try:
            query = """
                SELECT boeId FROM Auction
                WHERE procedureNumber = ?
                AND status = 'PRE_AUCTION'
                AND source IN ('TEJU', 'SEDE')
                LIMIT 1
            """
            
            results = self.db.query_auctions(query, (procedure_number,))
            
            if results and len(results) > 0:
                return results[0]['boeId']
        
        except Exception as e:
            logger.error(f"Error finding by procedure number: {e}")
        
        return None
    
    def _find_by_address_fuzzy(self, address: str, province: str) -> Optional[str]:
        """
        Find pre-auction by fuzzy address matching
        
        This is a simple implementation - could be enhanced with
        Levenshtein distance or other fuzzy matching algorithms
        """
        try:
            # Extract street name (first part before number)
            address_clean = address.lower().strip()
            street_match = address_clean.split(',')[0] if ',' in address_clean else address_clean
            
            query = """
                SELECT boeId, address FROM Auction
                WHERE status = 'PRE_AUCTION'
                AND province = ?
                AND address IS NOT NULL
                AND source IN ('TEJU', 'SEDE')
            """
            
            results = self.db.query_auctions(query, (province,))
            
            # Fuzzy match
            for result in results:
                if result.get('address'):
                    result_address = result['address'].lower()
                    if street_match in result_address:
                        logger.info(f"Fuzzy match found: {result['address']} ~ {address}")
                        return result['boeId']
        
        except Exception as e:
            logger.error(f"Error in fuzzy address matching: {e}")
        
        return None
