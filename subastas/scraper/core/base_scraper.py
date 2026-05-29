"""
Base Scraper Module
Abstract base class that all scrapers must inherit from
"""

from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class BaseScraper(ABC):
    """
    Abstract base class for all scrapers
    Enforces a consistent interface across BOE, TEJU, Sede, Registro, and BORME scrapers
    """
    
    def __init__(self, province: Optional[str] = None):
        """
        Initialize scraper
        
        Args:
            province: Optional province name to limit scraping scope
        """
        self.province = province
        self.browser_manager = None
        self.results = []
        self.errors = []
        self.stats = {
            'items_found': 0,
            'items_saved': 0,
            'items_updated': 0,
            'items_skipped': 0,
            'errors': 0,
        }
    
    @abstractmethod
    def get_source_name(self) -> str:
        """
        Return the source identifier
        
        Returns:
            Source name (e.g., 'BOE', 'TEJU', 'SEDE', 'REGISTRO', 'BORME')
        """
        pass
    
    @abstractmethod
    def build_search_url(self, **kwargs) -> str:
        """
        Build the search URL for this source
        
        Args:
            **kwargs: Search parameters (province, category, date, etc.)
        
        Returns:
            Complete search URL
        """
        pass
    
    @abstractmethod
    def parse_listing(self, element: Any) -> Optional[Dict[str, Any]]:
        """
        Parse a single listing from the page
        
        Args:
            element: DOM element or data structure containing listing info
        
        Returns:
            Dictionary with parsed auction data or None if parsing fails
        """
        pass
    
    @abstractmethod
    def scrape(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Main scrape method - orchestrates the entire scraping process
        
        Args:
            **kwargs: Scraping parameters
        
        Returns:
            List of auction dictionaries
        """
        pass
    
    # Common helper methods
    
    def log_info(self, message: str):
        """Log info message with source prefix"""
        logger.info(f"[{self.get_source_name()}] {message}")
    
    def log_error(self, message: str, exception: Optional[Exception] = None):
        """Log error message with source prefix"""
        self.stats['errors'] += 1
        self.errors.append(message)
        if exception:
            logger.error(f"[{self.get_source_name()}] {message}: {exception}")
        else:
            logger.error(f"[{self.get_source_name()}] {message}")
    
    def log_warning(self, message: str):
        """Log warning message with source prefix"""
        logger.warning(f"[{self.get_source_name()}] {message}")
    
    def increment_stat(self, stat_name: str, amount: int = 1):
        """Increment a statistics counter"""
        if stat_name in self.stats:
            self.stats[stat_name] += amount
    
    def get_stats(self) -> Dict[str, Any]:
        """Get scraping statistics"""
        return {
            'source': self.get_source_name(),
            'province': self.province,
            'timestamp': datetime.now().isoformat(),
            **self.stats,
        }
    
    def reset_stats(self):
        """Reset statistics counters"""
        self.stats = {
            'items_found': 0,
            'items_saved': 0,
            'items_updated': 0,
            'items_skipped': 0,
            'errors': 0,
        }
        self.results = []
        self.errors = []
    
    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """
        Validate that auction data has required fields
        
        Args:
            data: Auction data dictionary
        
        Returns:
            True if valid, False otherwise
        """
        required_fields = ['boe_id', 'title', 'category', 'province', 'status', 'appraisal_value']
        
        for field in required_fields:
            if field not in data or data[field] is None:
                self.log_warning(f"Missing required field: {field}")
                return False
        
        return True
    
    def normalize_auction_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize auction data to standard format
        
        Args:
            data: Raw auction data
        
        Returns:
            Normalized auction data
        """
        normalized = {
            'boe_id': data.get('boe_id', ''),
            'title': data.get('title', '').strip(),
            'category': data.get('category', 'Otros inmuebles'),
            'province': data.get('province', self.province),
            'municipality': data.get('municipality'),
            'status': data.get('status', 'ACTIVE'),
            'source': self.get_source_name(),
            'appraisal_value': float(data.get('appraisal_value', 0)),
            'current_bid': float(data['current_bid']) if data.get('current_bid') else None,
            'minimum_bid': float(data['minimum_bid']) if data.get('minimum_bid') else None,
            'court_name': data.get('court_name'),
            'court_reference': data.get('court_reference'),
            'procedure_number': data.get('procedure_number'),
            'boe_link': data.get('boe_link'),
            'edict_url': data.get('edict_url'),
            'published_at': data.get('published_at', datetime.now()),
            'ends_at': data.get('ends_at'),
            'address': data.get('address'),
            'latitude': float(data['latitude']) if data.get('latitude') else None,
            'longitude': float(data['longitude']) if data.get('longitude') else None,
            'pdf_url': data.get('pdf_url'),
            'image_url': data.get('image_url'),
            'boe_announcement': data.get('boe_announcement'),
            'lot_description': data.get('lot_description'),
            'property_description': data.get('property_description'),
            'charges_detail': data.get('charges_detail'),
            'auction_type': data.get('auction_type'),
        }
        
        return normalized
    
    def should_skip_auction(self, boe_id: str) -> bool:
        """
        Check if auction should be skipped (e.g., already processed recently)
        Override in subclass for custom logic
        
        Args:
            boe_id: Auction identifier
        
        Returns:
            True if should skip, False otherwise
        """
        return False
    
    def get_retry_config(self) -> Dict[str, int]:
        """
        Get retry configuration for this scraper
        Override in subclass for custom retry logic
        
        Returns:
            Dictionary with retry parameters
        """
        return {
            'max_retries': 3,
            'retry_delay': 5,  # seconds
            'backoff_multiplier': 2,
        }
