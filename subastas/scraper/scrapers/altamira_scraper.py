"""
Altamira Scraper
Scrapes property auctions from Altamira (Santander) portal
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import os
import time
import random
from scrapers.bank_base_scraper import BankBaseScraper
import logging

logger = logging.getLogger(__name__)


class AltamiraScraper(BankBaseScraper):
    """
    Scraper for Altamira portal (Banco Santander)
    Target: https://www.altamirainmuebles.com/
    """
    
    BASE_URL = "https://www.altamirainmuebles.com"

    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.session.headers.update({
            'Referer': self.BASE_URL,
            'Origin': self.BASE_URL,
        })

    def get_source_name(self) -> str:
        return "ALTAMIRA"
    
    def get_api_base_url(self) -> str:
        return os.getenv("ALTAMIRA_API_BASE", self.BASE_URL)
    
    def get_search_endpoint(self) -> str:
        return os.getenv("ALTAMIRA_SEARCH_ENDPOINT", "/nodejs/index")

    def fetch_api(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
        """
        Altamira uses JSON POST to /nodejs/index.
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
        """
        Build search parameters for Altamira API
        
        NOTE: If GraphQL, this will need to be converted to a query
        """
        params = {
            'page': page,
            'pageSize': 50,
            'sortBy': 'fecha',
            'sortOrder': 'desc',
        }
        
        if self.province:
            params['provincia'] = self.province
        
        return params
    
    def parse_property_list(self, json_response: Dict) -> List[Dict]:
        """Extract properties from Altamira API response"""
        try:
            # GraphQL structure: data -> search -> items
            if 'data' in json_response:
                data = json_response['data']
                if 'search' in data and 'items' in data['search']:
                    return data['search']['items']
                elif 'properties' in data:
                    return data['properties']
            
            # REST structure
            if 'properties' in json_response:
                return json_response['properties']
            if 'results' in json_response:
                return json_response['results']
            
            return []
        except Exception as e:
            self.log_error("Error parsing property list", e)
            return []
    
    def parse_property_detail(self, property_data: Dict) -> Optional[Dict[str, Any]]:
        """Parse a single Altamira property"""
        try:
            external_id = property_data.get('id') or property_data.get('reference')
            if not external_id:
                return None
            
            boe_id = f"ALTAMIRA-{external_id}"
            
            # Location
            province = property_data.get('provincia') or property_data.get('province')
            municipality = property_data.get('municipio') or property_data.get('municipality')
            
            # Price
            price = property_data.get('precio') or property_data.get('price') or property_data.get('valoracion')
            if not price:
                return None
            
            # Type
            tipo = property_data.get('tipoInmueble') or property_data.get('tipo') or property_data.get('type', '')
            category = self._map_property_type(tipo)
            
            # Title
            title = property_data.get('titulo') or property_data.get('title', '')
            if not title:
                title = f"{category} en {municipality or province}"
            
            return {
                'boe_id': boe_id,
                'title': title.strip(),
                'category': category,
                'province': province,
                'municipality': municipality,
                'status': 'CELEBRANDOSE',
                'auction_type': 'BANCARIA',
                'source': self.get_source_name(),
                'appraisal_value': self._parse_price(price),
                'current_bid': None,
                'minimum_bid': self._parse_price(price),
                'boe_link': property_data.get('url') or f"https://www.altamirainmuebles.com/inmueble/{external_id}",
                'address': property_data.get('direccion') or property_data.get('address'),
                'latitude': property_data.get('latitud') or property_data.get('lat'),
                'longitude': property_data.get('longitud') or property_data.get('lng'),
                'image_url': self._extract_image_url(property_data),
                'published_at': datetime.now(),
                'ends_at': None,
            }
        
        except Exception as e:
            self.log_error(f"Error parsing Altamira property", e)
            return None
    
    def _map_property_type(self, tipo: str) -> str:
        """Map property type to category"""
        type_map = {
            'vivienda': 'Viviendas',
            'piso': 'Viviendas',
            'casa': 'Viviendas',
            'garaje': 'Garajes',
            'local': 'Locales',
            'nave': 'Naves industriales',
            'terreno': 'Terrenos',
            'finca': 'Fincas rústicas',
        }
        
        tipo_lower = tipo.lower()
        for key, value in type_map.items():
            if key in tipo_lower:
                return value
        
        return 'Otros inmuebles'
    
    def _parse_price(self, price) -> float:
        """Parse price to float"""
        if isinstance(price, (int, float)):
            return float(price)
        if isinstance(price, str):
            cleaned = price.replace('€', '').replace('.', '').replace(',', '.').strip()
            try:
                return float(cleaned)
            except:
                return 0.0
        return 0.0
    
    def _extract_image_url(self, property_data: Dict) -> Optional[str]:
        """Extract image URL"""
        if 'imagen' in property_data:
            return property_data['imagen']
        if 'imagenes' in property_data and property_data['imagenes']:
            images = property_data['imagenes']
            if isinstance(images, list) and len(images) > 0:
                return images[0] if isinstance(images[0], str) else images[0].get('url')
        if 'multimedia' in property_data and property_data['multimedia']:
            return property_data['multimedia'][0].get('url')
        return None
