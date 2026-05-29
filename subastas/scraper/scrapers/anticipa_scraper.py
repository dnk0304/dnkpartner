"""
Anticipa Scraper Module
Scrapes property auctions from Anticipa (BBVA)
URL: https://www.anticipa.es
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import re
import logging
import os

from .bank_base_scraper import BankBaseScraper
from ..config.categories import get_category_type
from ..config.provinces import normalize_province_name

logger = logging.getLogger(__name__)


class AnticipaScraper(BankBaseScraper):
    """
    Anticipa (BBVA) property portal scraper
    Uses JSON API for fetching listings
    """
    
    BANK_NAME = "Anticipa"
    BASE_URL = "https://www.anticipa.es"
    API_BASE = "https://www.anticipa.es/api"
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.session.headers.update({
            'Referer': self.BASE_URL,
            'Origin': self.BASE_URL,
        })
    
    def get_source_name(self) -> str:
        return "BANK_ANTICIPA"
    
    def get_api_base_url(self) -> str:
        return os.getenv("ANTICIPA_API_BASE", self.API_BASE)
    
    def get_search_endpoint(self) -> str:
        return os.getenv("ANTICIPA_SEARCH_ENDPOINT", "/v1/properties")
    
    def build_search_params(self, page: int = 0, **kwargs) -> Dict[str, Any]:
        """Build search parameters for Anticipa API"""
        params = {
            'page': page + 1,  # Anticipa uses 1-based pagination
            'limit': 30,
            'orderBy': 'price',
            'orderDirection': 'asc',
        }
        
        # Province filter
        if self.province:
            province_normalized = normalize_province_name(self.province)
            params['provincia'] = province_normalized
        
        # Category filter
        category = kwargs.get('category')
        if category:
            category_map = {
                'viviendas': 'VIVIENDA',
                'locales': 'LOCAL',
                'terrenos': 'TERRENO',
                'garajes': 'GARAJE',
                'naves industriales': 'NAVE',
            }
            params['tipoInmueble'] = category_map.get(category.lower(), 'VIVIENDA')
        
        return params
    
    def parse_property_list(self, json_response: Dict) -> List[Dict]:
        """Extract list of properties from Anticipa API response"""
        if not json_response:
            return []
        
        # Anticipa typically returns under 'data' or 'items'
        return json_response.get('data', json_response.get('items', json_response.get('properties', [])))
    
    def parse_property_detail(self, property_data: Dict) -> Optional[Dict[str, Any]]:
        """Parse Anticipa property into auction format"""
        try:
            # Extract property ID
            prop_id = property_data.get('id', property_data.get('codigo', ''))
            if not prop_id:
                return None
            
            # Generate unique BOE-like ID
            boe_id = f"ANTICIPA-{prop_id}"
            
            # Extract basic info
            title = property_data.get('titulo', property_data.get('descripcion', ''))
            if not title:
                tipo = property_data.get('tipoInmueble', 'Inmueble')
                title = f"{tipo} en {property_data.get('localidad', 'España')}"
            
            # Extract price
            price = property_data.get('precio', property_data.get('precioVenta', 0))
            if isinstance(price, str):
                price = float(price.replace('.', '').replace(',', '.').replace('€', '').strip())
            
            # Extract location
            province = property_data.get('provincia', self.province or 'Unknown')
            municipality = property_data.get('localidad', property_data.get('municipio', ''))
            address = property_data.get('direccion', '')
            
            # Extract coordinates
            lat = property_data.get('latitud', property_data.get('lat'))
            lng = property_data.get('longitud', property_data.get('lng'))
            
            # Determine category
            prop_type = property_data.get('tipoInmueble', property_data.get('tipo', ''))
            category = self._map_category(prop_type, title)
            
            # Get images
            images = property_data.get('imagenes', property_data.get('fotos', []))
            image_url = None
            if images and len(images) > 0:
                if isinstance(images[0], dict):
                    image_url = images[0].get('url', images[0].get('ruta', ''))
                else:
                    image_url = images[0]
            
            # Build auction data
            auction_data = {
                'boe_id': boe_id,
                'title': title[:500],
                'category': category,
                'province': province,
                'municipality': municipality,
                'address': address,
                'status': 'CELEBRANDOSE',
                'auction_type': 'BANCARIA',
                'source': self.get_source_name(),
                'appraisal_value': float(price) if price else 100000,
                'current_bid': None,
                'boe_link': f"{self.BASE_URL}/inmueble/{prop_id}",
                'published_at': datetime.now(),
                'ends_at': None,
                'latitude': float(lat) if lat else None,
                'longitude': float(lng) if lng else None,
                'image_url': image_url,
            }
            
            return auction_data
        
        except Exception as e:
            self.log_error(f"Failed to parse Anticipa property: {e}")
            return None
    
    def extract_pagination_info(self, json_response: Dict) -> Optional[Dict]:
        """Extract pagination info from Anticipa response"""
        if not json_response:
            return None
        
        pagination = json_response.get('pagination', json_response.get('paginacion', {}))
        if not pagination:
            # Try to extract from response root
            total = json_response.get('total', json_response.get('totalCount', 0))
            page = json_response.get('page', 1)
            limit = json_response.get('limit', 30)
        else:
            total = pagination.get('total', 0)
            page = pagination.get('currentPage', pagination.get('page', 1))
            limit = pagination.get('limit', pagination.get('perPage', 30))
        
        total_pages = (total // limit) + (1 if total % limit else 0)
        has_next = page < total_pages
        
        return {
            'has_next': has_next,
            'total_pages': total_pages,
            'current_page': page,
            'total_items': total,
        }
    
    def _map_category(self, prop_type: str, title: str) -> str:
        """Map Anticipa property type to our category"""
        prop_lower = (prop_type or '').lower()
        
        category_map = {
            'vivienda': 'Viviendas',
            'piso': 'Viviendas',
            'casa': 'Viviendas',
            'chalet': 'Viviendas',
            'apartamento': 'Viviendas',
            'local': 'Locales',
            'comercial': 'Locales',
            'terreno': 'Terrenos',
            'solar': 'Terrenos',
            'parcela': 'Terrenos',
            'garaje': 'Garajes',
            'parking': 'Garajes',
            'trastero': 'Trasteros',
            'almacen': 'Trasteros',
            'nave': 'Naves industriales',
            'industrial': 'Naves industriales',
        }
        
        for key, category in category_map.items():
            if key in prop_lower:
                return category
        
        return get_category_type(title, '')
