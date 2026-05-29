"""
Bank Mapper
Maps bank portal data (Servihabitat, Haya, Altamira) to standardized AuctionModel
"""

from typing import Dict, Any
from database.models import AuctionModel
from services.normalization_service import NormalizationService


class BankMapper:
    """
    Maps bank-specific data structure to AuctionModel
    Works for Servihabitat, Haya, Altamira, and similar portals
    """
    
    def __init__(self):
        self.normalizer = NormalizationService()
    
    def map(self, raw_data: Dict[str, Any], source_type: str) -> AuctionModel:
        """
        Map bank raw data to AuctionModel
        
        Args:
            raw_data: Raw data from bank scraper
            source_type: SERVIHABITAT, HAYA, ALTAMIRA, etc.
        
        Returns:
            AuctionModel instance
        """
        return self.normalizer.normalize_auction_item(raw_data, source_type)
    
    def extract_property_id(self, raw_data: Dict) -> str:
        """Extract unique property ID from bank data"""
        return (
            raw_data.get('id') or
            raw_data.get('reference') or
            raw_data.get('ref') or
            raw_data.get('propertyId') or
            ''
        )
    
    def extract_location(self, raw_data: Dict) -> Dict[str, Any]:
        """Extract location data from bank JSON"""
        location = raw_data.get('location', {})
        
        return {
            'province': location.get('province') or location.get('provincia'),
            'municipality': location.get('municipality') or location.get('municipio') or location.get('city'),
            'address': raw_data.get('address') or location.get('address') or raw_data.get('direccion'),
            'latitude': location.get('lat') or location.get('latitude') or raw_data.get('lat'),
            'longitude': location.get('lng') or location.get('longitude') or raw_data.get('lng'),
        }
