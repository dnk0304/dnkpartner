"""
Solvia Scraper Module
Scrapes property auctions from Solvia (Sabadell Bank)
URL: https://www.solvia.es
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import re
import logging
import os
import time
import random

from .bank_base_scraper import BankBaseScraper
from ..config.categories import get_category_type
from ..config.provinces import normalize_province_name

logger = logging.getLogger(__name__)


class SolviaScraper(BankBaseScraper):
    """
    Solvia (Sabadell) property portal scraper
    Uses JSON API for fetching listings
    """
    
    BANK_NAME = "Solvia"
    BASE_URL = "https://www.solvia.es"
    API_BASE = "https://www.solvia.es"
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.session.headers.update({
            'Referer': self.BASE_URL,
            'Origin': self.BASE_URL,
        })
    
    def get_source_name(self) -> str:
        return "BANK_SOLVIA"
    
    def get_api_base_url(self) -> str:
        return os.getenv("SOLVIA_API_BASE", self.API_BASE)
    
    def get_search_endpoint(self) -> str:
        return os.getenv("SOLVIA_SEARCH_ENDPOINT", "/api/inmuebles/v2/buscarInmuebles")

    def fetch_api(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
        """
        Solvia search uses POST JSON body.
        """
        url = f"{self.get_api_base_url()}{endpoint}"
        payload = params or {}
        self.log_info(f"Fetching (POST): {url}")

        for attempt in range(1, self.max_retries + 1):
            elapsed = time.time() - self.last_request_time
            if elapsed < self.rate_limit_delay:
                time.sleep(self.rate_limit_delay - elapsed)
            time.sleep(random.uniform(0.5, 1.5))

            try:
                proxies = self._get_requests_proxy()
                response = self.session.post(url, json=payload, timeout=30, proxies=proxies)
                self.last_request_time = time.time()

                if response.status_code == 200:
                    return response.json()
                if response.status_code in (403, 429, 503):
                    time.sleep(2 ** attempt)
                    continue
                self.log_error(f"API request failed with status {response.status_code}")
                return None
            except Exception as e:
                self.log_error(f"API request exception (attempt {attempt})", e)
                time.sleep(2 ** attempt)

        return None
    
    def build_search_params(self, page: int = 0, **kwargs) -> Dict[str, Any]:
        """Build search parameters for Solvia API"""
        params = {
            'page': page + 1,
            'pageSize': 24,
            'sort': 'price_asc',
            'operation': 'sale',
            'filters': {}
        }
        
        # Province filter
        if self.province:
            province_normalized = normalize_province_name(self.province)
            params['filters']['province'] = province_normalized
        
        # Category filter
        category = kwargs.get('category')
        if category:
            category_map = {
                'viviendas': 'homes',
                'locales': 'premises',
                'terrenos': 'land',
                'garajes': 'parking',
            }
            params['filters']['propertyType'] = category_map.get(category.lower(), 'homes')
        
        return params
    
    def parse_property_list(self, json_response: Dict) -> List[Dict]:
        """Extract list of properties from Solvia API response"""
        if not json_response:
            return []
        
        # Solvia typically returns properties under 'items' or 'results'
        return json_response.get('items', json_response.get('results', []))
    
    def parse_property_detail(self, property_data: Dict) -> Optional[Dict[str, Any]]:
        """Parse Solvia property into auction format"""
        try:
            # Extract property ID
            prop_id = property_data.get('id', property_data.get('propertyId', ''))
            if not prop_id:
                return None
            
            # Generate unique BOE-like ID
            boe_id = f"SOLVIA-{prop_id}"
            
            # Extract basic info
            title = property_data.get('title', property_data.get('description', ''))
            if not title:
                title = f"Inmueble {prop_id}"
            
            # Extract price
            price = property_data.get('price', property_data.get('salePrice', 0))
            if isinstance(price, str):
                price = float(price.replace('.', '').replace(',', '.').replace('€', '').strip())
            
            # Extract location
            location = property_data.get('location', {})
            if isinstance(location, str):
                location = {'address': location}
            
            province = location.get('province', self.province or 'Unknown')
            municipality = location.get('city', location.get('municipality', ''))
            address = location.get('address', location.get('fullAddress', ''))
            
            # Extract coordinates
            lat = property_data.get('latitude', location.get('lat'))
            lng = property_data.get('longitude', location.get('lng'))
            
            # Determine category
            prop_type = property_data.get('propertyType', property_data.get('type', ''))
            category = self._map_category(prop_type, title)
            
            # Get images
            images = property_data.get('images', property_data.get('photos', []))
            image_url = None
            if images and len(images) > 0:
                if isinstance(images[0], dict):
                    image_url = images[0].get('url', images[0].get('path', ''))
                else:
                    image_url = images[0]
            
            # Build auction data
            auction_data = {
                'boe_id': boe_id,
                'title': title[:500],  # Limit title length
                'category': category,
                'province': province,
                'municipality': municipality,
                'address': address,
                'status': 'CELEBRANDOSE',  # Bank auctions are always active
                'auction_type': 'BANCARIA',
                'source': self.get_source_name(),
                'appraisal_value': float(price) if price else 100000,
                'current_bid': None,
                'boe_link': f"{self.BASE_URL}/property/{prop_id}",
                'published_at': datetime.now(),
                'ends_at': None,  # Bank auctions don't have end dates
                'latitude': float(lat) if lat else None,
                'longitude': float(lng) if lng else None,
                'image_url': image_url,
            }
            
            return auction_data
        
        except Exception as e:
            self.log_error(f"Failed to parse Solvia property: {e}")
            return None
    
    def extract_pagination_info(self, json_response: Dict) -> Optional[Dict]:
        """Extract pagination info from Solvia response"""
        if not json_response:
            return None
        
        total = json_response.get('total', json_response.get('totalCount', 0))
        page = json_response.get('page', 0)
        page_size = json_response.get('pageSize', 24)
        
        total_pages = (total // page_size) + (1 if total % page_size else 0)
        has_next = page < total_pages - 1
        
        return {
            'has_next': has_next,
            'total_pages': total_pages,
            'current_page': page,
            'total_items': total,
        }
    
    def _map_category(self, prop_type: str, title: str) -> str:
        """Map Solvia property type to our category"""
        prop_lower = (prop_type or '').lower()
        
        category_map = {
            'home': 'Viviendas',
            'apartment': 'Viviendas',
            'flat': 'Viviendas',
            'piso': 'Viviendas',
            'house': 'Viviendas',
            'chalet': 'Viviendas',
            'premise': 'Locales',
            'local': 'Locales',
            'commercial': 'Locales',
            'land': 'Terrenos',
            'plot': 'Terrenos',
            'solar': 'Terrenos',
            'parking': 'Garajes',
            'garage': 'Garajes',
            'storage': 'Trasteros',
            'trastero': 'Trasteros',
            'warehouse': 'Naves industriales',
            'industrial': 'Naves industriales',
        }
        
        for key, category in category_map.items():
            if key in prop_lower:
                return category
        
        # Fallback to category detection from title
        return get_category_type(title, '')
