"""
Change Detector Service
Detects changes in auction data (status, price, etc.) for notification purposes
"""

from typing import Optional, Dict, Any, List
from database.models import AuctionModel
import logging

logger = logging.getLogger(__name__)


class ChangeDetector:
    """
    Service for detecting meaningful changes in auction data
    Used to trigger user notifications
    """
    
    def detect_status_change(self, old_item: AuctionModel, new_item: AuctionModel) -> Optional[str]:
        """
        Detect if auction status changed
        
        Args:
            old_item: Previous auction state
            new_item: Current auction state
        
        Returns:
            Status change description or None
        """
        if old_item.status != new_item.status:
            return f"Status changed from {old_item.status} to {new_item.status}"
        return None
    
    def detect_price_change(self, old_item: AuctionModel, new_item: AuctionModel) -> Optional[Dict[str, Any]]:
        """
        Detect if price changed (bid or appraisal)
        
        Args:
            old_item: Previous auction state
            new_item: Current auction state
        
        Returns:
            Dict with change details or None
        """
        changes = {}
        
        # Check current bid change
        if old_item.current_bid != new_item.current_bid:
            changes['current_bid'] = {
                'old': old_item.current_bid,
                'new': new_item.current_bid,
                'increased': (new_item.current_bid or 0) > (old_item.current_bid or 0)
            }
        
        # Check appraisal value change (rare but possible for corrections)
        if old_item.appraisal_value != new_item.appraisal_value:
            changes['appraisal_value'] = {
                'old': old_item.appraisal_value,
                'new': new_item.appraisal_value,
                'difference': new_item.appraisal_value - old_item.appraisal_value
            }
        
        return changes if changes else None
    
    def detect_location_change(self, old_item: AuctionModel, new_item: AuctionModel) -> Optional[Dict[str, Any]]:
        """
        Detect if location coordinates were added/updated
        
        Returns:
            Dict with location change or None
        """
        old_has_coords = old_item.latitude is not None and old_item.longitude is not None
        new_has_coords = new_item.latitude is not None and new_item.longitude is not None
        
        if not old_has_coords and new_has_coords:
            return {
                'type': 'coordinates_added',
                'lat': new_item.latitude,
                'lng': new_item.longitude
            }
        
        if old_has_coords and new_has_coords:
            # Check if coordinates changed significantly (moved)
            lat_diff = abs(old_item.latitude - new_item.latitude)
            lng_diff = abs(old_item.longitude - new_item.longitude)
            
            if lat_diff > 0.001 or lng_diff > 0.001:  # ~100m threshold
                return {
                    'type': 'coordinates_updated',
                    'old_lat': old_item.latitude,
                    'old_lng': old_item.longitude,
                    'new_lat': new_item.latitude,
                    'new_lng': new_item.longitude
                }
        
        return None
    
    def get_changes_summary(self, old_item: AuctionModel, new_item: AuctionModel) -> Dict[str, Any]:
        """
        Get comprehensive summary of all changes
        
        Args:
            old_item: Previous auction state
            new_item: Current auction state
        
        Returns:
            Dict with all detected changes
        """
        summary = {
            'auction_id': new_item.boe_id,
            'has_changes': False,
            'changes': {}
        }
        
        # Status change
        status_change = self.detect_status_change(old_item, new_item)
        if status_change:
            summary['changes']['status'] = status_change
            summary['has_changes'] = True
        
        # Price changes
        price_change = self.detect_price_change(old_item, new_item)
        if price_change:
            summary['changes']['prices'] = price_change
            summary['has_changes'] = True
        
        # Location changes
        location_change = self.detect_location_change(old_item, new_item)
        if location_change:
            summary['changes']['location'] = location_change
            summary['has_changes'] = True
        
        # End date change (extension or correction)
        if old_item.ends_at != new_item.ends_at:
            summary['changes']['end_date'] = {
                'old': old_item.ends_at.isoformat() if old_item.ends_at else None,
                'new': new_item.ends_at.isoformat() if new_item.ends_at else None
            }
            summary['has_changes'] = True
        
        return summary
    
    def is_significant_change(self, changes_summary: Dict[str, Any]) -> bool:
        """
        Determine if changes are significant enough to notify users
        
        Args:
            changes_summary: Output from get_changes_summary()
        
        Returns:
            True if users should be notified
        """
        if not changes_summary['has_changes']:
            return False
        
        changes = changes_summary['changes']
        
        # Always notify on status changes
        if 'status' in changes:
            return True
        
        # Notify on price changes > 5%
        if 'prices' in changes:
            price_changes = changes['prices']
            if 'current_bid' in price_changes:
                return True  # Always notify on new bids
            
            if 'appraisal_value' in price_changes:
                diff = abs(price_changes['appraisal_value']['difference'])
                old_val = price_changes['appraisal_value']['old']
                if old_val > 0:
                    change_percent = (diff / old_val) * 100
                    if change_percent > 5:
                        return True
        
        # Notify on new coordinates (improved location data)
        if 'location' in changes and changes['location']['type'] == 'coordinates_added':
            return True
        
        # Notify on end date extensions
        if 'end_date' in changes:
            return True
        
        return False
