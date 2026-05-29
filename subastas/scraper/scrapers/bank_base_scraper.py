"""
Bank Base Scraper
Abstract base class for all bank portal scrapers (Servihabitat, Haya, Altamira, etc.)
"""

import requests
import time
import random
import os
from typing import Optional, List, Dict, Any
from datetime import datetime
from ..core.base_scraper import BaseScraper
from ..database.adapter import get_database_adapter
from ..core.proxy_manager import ProxyManager, get_random_user_agent
import logging

logger = logging.getLogger(__name__)


class BankBaseScraper(BaseScraper):
    """
    Base class for bank portal scrapers that use JSON APIs
    All bank auctions use:
    - status: CELEBRANDOSE (banks only show active listings)
    - auction_type: BANCARIA
    """
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.session = requests.Session()
        self.proxy_manager = ProxyManager()
        self.user_agent = get_random_user_agent()
        self.session.headers.update({
            'User-Agent': self.user_agent,
            'Accept': 'application/json,text/plain,*/*',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'DNT': '1',
        })
        self.rate_limit_delay = int(os.getenv('BANK_RATE_LIMIT_SECONDS', '6'))
        self.last_request_time = 0
        self.max_retries = int(os.getenv('BANK_MAX_RETRIES', '3'))
        self.db_adapter = get_database_adapter()
    
    def get_api_base_url(self) -> str:
        """Return the base API URL for this bank"""
        raise NotImplementedError("Subclass must implement get_api_base_url()")
    
    def get_search_endpoint(self) -> str:
        """Return the search/listing endpoint"""
        raise NotImplementedError("Subclass must implement get_search_endpoint()")
    
    def build_search_params(self, page: int = 0, **kwargs) -> Dict[str, Any]:
        """Build search parameters for API request"""
        raise NotImplementedError("Subclass must implement build_search_params()")
    
    def fetch_api(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
        """
        Fetch data from bank API with rate limiting
        
        Args:
            endpoint: API endpoint
            params: Query parameters
        
        Returns:
            JSON response dict or None if request fails
        """
        url = f"{self.get_api_base_url()}{endpoint}"
        self.log_info(f"Fetching: {url}")
        
        for attempt in range(1, self.max_retries + 1):
            # Rate limiting with jitter
            elapsed = time.time() - self.last_request_time
            if elapsed < self.rate_limit_delay:
                time.sleep(self.rate_limit_delay - elapsed)
            time.sleep(random.uniform(0.5, 1.5))
            
            try:
                proxies = self._get_requests_proxy()
                response = self.session.get(url, params=params, timeout=30, proxies=proxies)
                self.last_request_time = time.time()
                
                if response.status_code == 200:
                    return response.json()
                
                if response.status_code in (403, 429, 503):
                    backoff = 2 ** attempt
                    self.log_warning(f"Rate limited ({response.status_code}); retrying in {backoff}s")
                    time.sleep(backoff)
                    continue
                
                self.log_error(f"API request failed with status {response.status_code}")
                return None
            
            except Exception as e:
                self.log_error(f"API request exception (attempt {attempt})", e)
                time.sleep(2 ** attempt)
        
        return None

    def _get_requests_proxy(self) -> Optional[Dict[str, str]]:
        """Convert proxy config to requests-compatible format"""
        if not self.proxy_manager.should_use_proxy():
            return None
        proxy = self.proxy_manager.get_proxy_config()
        if not proxy:
            return None
        server = proxy.get('server')
        username = proxy.get('username')
        password = proxy.get('password')
        if username and password:
            server = server.replace('http://', '').replace('https://', '')
            proxy_url = f"http://{username}:{password}@{server}"
        else:
            proxy_url = server
        return {'http': proxy_url, 'https': proxy_url}
    
    def parse_property_list(self, json_response: Dict) -> List[Dict]:
        """
        Extract list of properties from API response
        
        Args:
            json_response: Raw API response
        
        Returns:
            List of property dictionaries
        """
        raise NotImplementedError("Subclass must implement parse_property_list()")
    
    def parse_property_detail(self, property_data: Dict) -> Optional[Dict[str, Any]]:
        """
        Parse a single property from API response into auction data
        
        Args:
            property_data: Raw property data from API
        
        Returns:
            Parsed auction data or None
        """
        raise NotImplementedError("Subclass must implement parse_property_detail()")
    
    def extract_pagination_info(self, json_response: Dict) -> Optional[Dict]:
        """
        Extract pagination info from response
        
        Returns:
            Dict with 'has_next', 'total_pages', 'current_page' or None
        """
        return None  # Override if API supports pagination
    
    def scrape(self, max_pages: int = 10, **kwargs) -> List[Dict[str, Any]]:
        """
        Main scraping method for bank portal
        
        Args:
            max_pages: Maximum pages to scrape
            **kwargs: Additional search parameters
        
        Returns:
            List of auction dictionaries
        """
        self.reset_stats()
        all_auctions = []
        
        page = 0
        while page < max_pages:
            self.log_info(f"Scraping page {page + 1}")
            
            # Build search params
            params = self.build_search_params(page=page, **kwargs)
            
            # Fetch page
            response = self.fetch_api(self.get_search_endpoint(), params)
            
            if not response:
                self.log_error(f"Failed to fetch page {page + 1}")
                break
            
            # Parse properties
            properties = self.parse_property_list(response)
            self.log_info(f"Found {len(properties)} properties on page {page + 1}")
            
            if not properties:
                break  # No more results
            
            # Parse each property
            for prop in properties:
                try:
                    auction_data = self.parse_property_detail(prop)
                    if auction_data and self.validate_auction_data(auction_data):
                        normalized = self.normalize_auction_data(auction_data)
                        # Save to database
                        self.db_adapter.upsert_auction(normalized)
                        all_auctions.append(normalized)
                        self.increment_stat('items_found')
                    else:
                        self.increment_stat('items_skipped')
                except Exception as e:
                    self.log_error(f"Error parsing property", e)
            
            # Check pagination
            pagination = self.extract_pagination_info(response)
            if not pagination or not pagination.get('has_next'):
                break
            
            page += 1
        
        self.log_info(f"Scraping completed. Found {len(all_auctions)} auctions")
        return all_auctions
    
    def parse_listing(self, element: Any) -> Optional[Dict[str, Any]]:
        """
        Not used in bank scrapers (they use JSON APIs)
        Implemented for compatibility with BaseScraper interface
        """
        return None
    
    def build_search_url(self, **kwargs) -> str:
        """
        Not used in bank scrapers (they use JSON APIs)
        Implemented for compatibility with BaseScraper interface
        """
        return self.get_api_base_url() + self.get_search_endpoint()
