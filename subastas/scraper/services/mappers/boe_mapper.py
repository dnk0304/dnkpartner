"""
BOE Mapper
Maps BOE scraper output to standardized AuctionModel
"""

from typing import Dict, Any
from database.models import AuctionModel
from services.normalization_service import NormalizationService


class BOEMapper:
    """
    Maps BOE-specific data structure to AuctionModel
    """
    
    def __init__(self):
        self.normalizer = NormalizationService()
    
    def map(self, raw_data: Dict[str, Any]) -> AuctionModel:
        """
        Map BOE raw data to AuctionModel
        
        Args:
            raw_data: Raw data from BOE scraper
        
        Returns:
            AuctionModel instance
        """
        return self.normalizer.normalize_auction_item(raw_data, 'BOE')
    
    def extract_procedure_number(self, raw_data: Dict) -> str:
        """Extract procedure number from BOE data"""
        # Multiple possible fields
        return (
            raw_data.get('procedure_number') or
            raw_data.get('procedureNumber') or
            raw_data.get('expediente') or
            ''
        )
    
    def extract_court_info(self, raw_data: Dict) -> Dict[str, Any]:
        """Extract court information"""
        return {
            'court_name': raw_data.get('court_name') or raw_data.get('juzgado'),
            'court_reference': raw_data.get('court_reference'),
        }
