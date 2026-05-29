"""
Haya Real Estate Scraper
Scrapes property auctions from Haya Real Estate portal
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import os
from scrapers.bank_base_scraper import BankBaseScraper
import logging

logger = logging.getLogger(__name__)


class HayaScraper(BankBaseScraper):
    """
    Scraper for Haya Real Estate portal
    Target: https://www.haya.es/
    """
    
    BASE_URL = "https://www.haya.es"

    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.session.headers.update({
            'Referer': self.BASE_URL,
            'Origin': self.BASE_URL,
        })

    def get_source_name(self) -> str:
        return "HAYA"
    
    def get_api_base_url(self) -> str:
        # NOTE: This needs reverse engineering
        return os.getenv("HAYA_API_BASE", self.BASE_URL)
    
    def get_search_endpoint(self) -> str:
        return os.getenv("HAYA_SEARCH_ENDPOINT", "/api/search")
    
    def build_search_params(self, page: int = 0, **kwargs) -> Dict[str, Any]:
        """Build search parameters for Haya API"""
        params = {
            'page': page,
            'limit': 50,
            'type': 'inmuebles_banco',
            'subtype': 'cesion_remate',
            'orderBy': 'date',
            'order': 'desc',
        }
        
        if self.province:
            params['province'] = self.province
        
        return params
    
    def parse_property_list(self, json_response: Dict) -> List[Dict]:
        """Extract properties from Haya API response"""
        try:
            if 'properties' in json_response:
                return json_response['properties']
            elif 'data' in json_response:
                return json_response['data']
            elif 'results' in json_response:
                return json_response['results']
            return []
        except Exception as e:
            self.log_error("Error parsing property list", e)
            return []
    
    def parse_property_detail(self, property_data: Dict) -> Optional[Dict[str, Any]]:
        """Parse a single Haya property"""
        try:
            external_id = property_data.get('id') or property_data.get('ref')
            if not external_id:
                return None
            
            boe_id = f"HAYA-{external_id}"
            province = property_data.get('provincia') or property_data.get('province')
            municipality = property_data.get('municipio') or property_data.get('municipality')
            price = property_data.get('precio') or property_data.get('price')
            
            if not price:
                return None
            
            tipo = property_data.get('tipo') or property_data.get('type', '')
            category = self._map_property_type(tipo)
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
                'boe_link': property_data.get('url') or f"https://www.haya.es/inmueble/{external_id}",
                'address': property_data.get('direccion') or property_data.get('address'),
                'latitude': property_data.get('lat') or property_data.get('latitude'),
                'longitude': property_data.get('lng') or property_data.get('longitude'),
                'image_url': self._extract_image_url(property_data),
                'published_at': datetime.now(),
                'ends_at': None,
            }
        
        except Exception as e:
            self.log_error(f"Error parsing Haya property", e)
            return None
    
    def _map_property_type(self, tipo: str) -> str:
        """Map property type to category"""
        type_map = {
            'vivienda': 'Viviendas',
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
        if 'images' in property_data and property_data['images']:
            images = property_data['images']
            if isinstance(images, list) and len(images) > 0:
                return images[0] if isinstance(images[0], str) else images[0].get('url')
        return None
