"""
Aliseda Scraper Module
Scrapes property auctions from Aliseda Inmobiliaria
URL: https://www.alisedainmobiliaria.com
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


class AlisedaScraper(BankBaseScraper):
    """
    Aliseda Inmobiliaria property portal scraper
    Uses JSON API for fetching listings
    """
    
    BANK_NAME = "Aliseda"
    BASE_URL = "https://www.alisedainmobiliaria.com"
    API_BASE = "https://laravel.alisedainmobiliaria.com"
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.session.headers.update({
            'Referer': self.BASE_URL,
            'Origin': self.BASE_URL,
        })
    
    def get_source_name(self) -> str:
        return "BANK_ALISEDA"
    
    def get_api_base_url(self) -> str:
        return os.getenv("ALISEDA_API_BASE", self.API_BASE)
    
    def get_search_endpoint(self) -> str:
        return os.getenv("ALISEDA_SEARCH_ENDPOINT", "/api/v2/new-search")

    def fetch_api(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
        """
        Aliseda search uses POST JSON body (laravel API).
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
        """Build search parameters for Aliseda API"""
        params = {
            'pagina': page + 1,  # 1-based pagination
            'cantidad': 25,
            'orden': 'precio',
            'direccion': 'asc',
            'operacion': 'venta',
        }
        
        # Province filter
        if self.province:
            province_normalized = normalize_province_name(self.province)
            params['provincia'] = province_normalized
        
        # Category filter
        category = kwargs.get('category')
        if category:
            category_map = {
                'viviendas': 'piso',
                'locales': 'local',
                'terrenos': 'terreno',
                'garajes': 'garaje',
                'trasteros': 'trastero',
                'naves industriales': 'nave',
            }
            params['tipo'] = category_map.get(category.lower(), 'piso')
        
        return params
    
    def parse_property_list(self, json_response: Dict) -> List[Dict]:
        """Extract list of properties from Aliseda API response"""
        if not json_response:
            return []
        
        return json_response.get('inmuebles', json_response.get('data', json_response.get('results', [])))
    
    def parse_property_detail(self, property_data: Dict) -> Optional[Dict[str, Any]]:
        """Parse Aliseda property into auction format"""
        try:
            # Extract property ID
            prop_id = property_data.get('id', property_data.get('referencia', ''))
            if not prop_id:
                return None
            
            # Generate unique BOE-like ID
            boe_id = f"ALISEDA-{prop_id}"
            
            # Extract basic info
            title = property_data.get('titulo', property_data.get('nombre', ''))
            description = property_data.get('descripcion', '')
            if not title:
                tipo = property_data.get('tipoInmueble', property_data.get('tipo', 'Inmueble'))
                localidad = property_data.get('localidad', property_data.get('ciudad', 'España'))
                title = f"{tipo} en {localidad}"
            
            # Extract price
            price = property_data.get('precio', property_data.get('precioVenta', 0))
            if isinstance(price, str):
                price = float(price.replace('.', '').replace(',', '.').replace('€', '').strip())
            
            # Appraisal value (if different from sale price)
            appraisal = property_data.get('valorTasacion', property_data.get('tasacion', price))
            if isinstance(appraisal, str):
                appraisal = float(appraisal.replace('.', '').replace(',', '.').replace('€', '').strip())
            
            # Extract location
            province = property_data.get('provincia', self.province or 'Unknown')
            municipality = property_data.get('localidad', property_data.get('municipio', ''))
            address = property_data.get('direccion', property_data.get('via', ''))
            postal_code = property_data.get('codigoPostal', property_data.get('cp', ''))
            
            if postal_code and address:
                address = f"{address}, {postal_code}"
            
            # Extract coordinates
            lat = property_data.get('latitud', property_data.get('coordenadas', {}).get('lat'))
            lng = property_data.get('longitud', property_data.get('coordenadas', {}).get('lng'))
            
            # Determine category
            prop_type = property_data.get('tipoInmueble', property_data.get('tipo', ''))
            category = self._map_category(prop_type, title, description)
            
            # Get images
            images = property_data.get('imagenes', property_data.get('fotos', []))
            image_url = None
            if images and len(images) > 0:
                if isinstance(images[0], dict):
                    image_url = images[0].get('url', images[0].get('imagen', ''))
                else:
                    image_url = images[0]
            
            # Make image URL absolute if needed
            if image_url and not image_url.startswith('http'):
                image_url = f"{self.BASE_URL}{image_url}"
            
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
                'appraisal_value': float(appraisal) if appraisal else float(price) if price else 100000,
                'current_bid': float(price) if price and price != appraisal else None,
                'boe_link': f"{self.BASE_URL}/inmueble/{prop_id}",
                'published_at': datetime.now(),
                'ends_at': None,
                'latitude': float(lat) if lat else None,
                'longitude': float(lng) if lng else None,
                'image_url': image_url,
                'property_description': description[:2000] if description else None,
            }
            
            return auction_data
        
        except Exception as e:
            self.log_error(f"Failed to parse Aliseda property: {e}")
            return None
    
    def extract_pagination_info(self, json_response: Dict) -> Optional[Dict]:
        """Extract pagination info from Aliseda response"""
        if not json_response:
            return None
        
        total = json_response.get('total', json_response.get('totalResultados', 0))
        page = json_response.get('pagina', json_response.get('paginaActual', 1))
        per_page = json_response.get('cantidad', json_response.get('porPagina', 25))
        
        total_pages = (total // per_page) + (1 if total % per_page else 0)
        has_next = page < total_pages
        
        return {
            'has_next': has_next,
            'total_pages': total_pages,
            'current_page': page,
            'total_items': total,
        }
    
    def _map_category(self, prop_type: str, title: str, description: str = '') -> str:
        """Map Aliseda property type to our category"""
        prop_lower = (prop_type or '').lower()
        combined_text = f"{prop_lower} {title.lower()} {description.lower()}"
        
        category_map = {
            'piso': 'Viviendas',
            'vivienda': 'Viviendas',
            'casa': 'Viviendas',
            'chalet': 'Viviendas',
            'adosado': 'Viviendas',
            'apartamento': 'Viviendas',
            'duplex': 'Viviendas',
            'atico': 'Viviendas',
            'local': 'Locales',
            'comercial': 'Locales',
            'oficina': 'Locales',
            'terreno': 'Terrenos',
            'solar': 'Terrenos',
            'parcela': 'Terrenos',
            'rustica': 'Fincas rústicas',
            'finca': 'Fincas rústicas',
            'garaje': 'Garajes',
            'plaza de garaje': 'Garajes',
            'parking': 'Garajes',
            'trastero': 'Trasteros',
            'almacen': 'Trasteros',
            'nave': 'Naves industriales',
            'industrial': 'Naves industriales',
        }
        
        for key, category in category_map.items():
            if key in combined_text:
                return category
        
        return get_category_type(title, description)
