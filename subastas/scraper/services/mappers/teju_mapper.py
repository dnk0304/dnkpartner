"""
TEJU Mapper
Maps TEJU (Tablón Edictal Judicial Único) data to standardized AuctionModel
"""

from typing import Dict, Any
from database.models import AuctionModel, AuctionStatus
from services.normalization_service import NormalizationService


class TEJUMapper:
    """
    Maps TEJU-specific data structure to AuctionModel
    TEJU data comes from PDF OCR, so fields might be inconsistent
    """
    
    def __init__(self):
        self.normalizer = NormalizationService()
    
    def map(self, raw_data: Dict[str, Any]) -> AuctionModel:
        """
        Map TEJU raw data to AuctionModel
        
        Args:
            raw_data: Raw data from TEJU scraper
        
        Returns:
            AuctionModel instance
        """
        # TEJU items are always PRE_AUCTION status
        raw_data['status'] = AuctionStatus.PRE_AUCTION.value
        
        return self.normalizer.normalize_auction_item(raw_data, 'TEJU')
    
    def extract_from_ocr_text(self, ocr_text: str) -> Dict[str, Any]:
        """
        Extract structured data from OCR text
        
        Args:
            ocr_text: Raw OCR text from PDF
        
        Returns:
            Extracted fields
        """
        import re
        
        data = {}
        
        # Extract procedure number
        proc_match = re.search(r'procedimiento[:\s]+([0-9/\-A-Z]+)', ocr_text, re.IGNORECASE)
        if proc_match:
            data['procedure_number'] = proc_match.group(1)
        
        # Extract court name
        court_match = re.search(r'juzgado[:\s]+([^\n]+)', ocr_text, re.IGNORECASE)
        if court_match:
            data['court_name'] = court_match.group(1).strip()
        
        # Extract appraisal value
        value_match = re.search(r'valoraci[óo]n[:\s]+([0-9.,]+)\s*€?', ocr_text, re.IGNORECASE)
        if value_match:
            data['appraisal_value'] = value_match.group(1)
        
        return data
