"""
Servihabitat Scraper
Scrapes property auctions from Servihabitat portal
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import os
import json
import re
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from scrapers.bank_base_scraper import BankBaseScraper
import logging

logger = logging.getLogger(__name__)


class ServihabitatScraper(BankBaseScraper):
    """
    Scraper for Servihabitat portal
    Target: https://www.servihabitat.com/
    """

    BASE_URL = "https://www.servihabitat.com"
    LISTING_URLS = {
        "sinposesion": "https://www.servihabitat.com/es/land/sinposesion",
        "venta_vivienda": "https://www.servihabitat.com/es/venta/vivienda/",
    }

    def __init__(self, province: Optional[str] = None, listing_mode: str = "venta_vivienda"):
        super().__init__(province)
        self.listing_mode = listing_mode
        self.listing_url = self.LISTING_URLS.get(listing_mode, self.LISTING_URLS["venta_vivienda"])
        self.session.headers.update({
            'Referer': self.listing_url,
            'Origin': self.BASE_URL,
        })

    def get_source_name(self) -> str:
        if self.listing_mode == "sinposesion":
            return "SERVIHABITAT_SINPOSESION"
        return "SERVIHABITAT"
    
    def get_api_base_url(self) -> str:
        # NOTE: This is indicative - needs reverse engineering
        return os.getenv("SERVIHABITAT_API_BASE", "https://api.servihabitat.com")
    
    def get_search_endpoint(self) -> str:
        return os.getenv("SERVIHABITAT_SEARCH_ENDPOINT", "/v1/assets")
    
    def build_search_params(self, page: int = 0, **kwargs) -> Dict[str, Any]:
        """
        Build search parameters for Servihabitat API
        
        NOTE: These params are indicative and need confirmation
        """
        params = {
            'page': page,
            'limit': 50,
            'sortBy': 'date',
            'sortOrder': 'desc',
        }
        
        if self.province:
            params['province'] = self.province

        # Listing mode: sinposesion vs regular listings
        if self.listing_mode == "sinposesion":
            params['withoutPossession'] = True
        
        return params
    
    def parse_property_list(self, json_response: Dict) -> List[Dict]:
        """Extract properties from Servihabitat API response"""
        try:
            if 'properties' in json_response:
                return json_response['properties']
            elif 'data' in json_response:
                return json_response['data']
            elif 'results' in json_response:
                return json_response['results']
            else:
                self.log_warning("Unknown API response structure")
                return []
        except Exception as e:
            self.log_error("Error parsing property list", e)
            return []
    
    def parse_property_detail(self, property_data: Dict) -> Optional[Dict[str, Any]]:
        """Parse a single Servihabitat property into auction data"""
        try:
            external_id = property_data.get('id') or property_data.get('ref')
            if not external_id:
                return None
            
            boe_id = f"SERVIHABITAT-{external_id}"
            
            # Location
            province = property_data.get('provincia') or property_data.get('province')
            municipality = property_data.get('municipio') or property_data.get('municipality')
            
            # Price
            price = property_data.get('precio') or property_data.get('price')
            if not price:
                return None
            
            # Property type
            tipo = property_data.get('tipo') or property_data.get('type', '')
            category = self._map_property_type(tipo)

            description = (
                property_data.get('descripcion')
                or property_data.get('description')
                or property_data.get('detalle')
                or property_data.get('detalle_inmueble')
            )
            features = property_data.get('caracteristicas') or property_data.get('features')
            
            # Title
            title = property_data.get('titulo') or property_data.get('title', '')
            if not title:
                title = f"{category} en {municipality or province}"
            
            auction_data = {
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
                'boe_link': property_data.get('url') or f"{self.BASE_URL}/inmueble/{external_id}",
                'address': property_data.get('direccion') or property_data.get('address'),
                'latitude': property_data.get('lat') or property_data.get('latitude'),
                'longitude': property_data.get('lng') or property_data.get('longitude'),
                'image_url': self._extract_image_url(property_data),
                'property_description': description,
                'lot_description': features if isinstance(features, str) else None,
                'published_at': datetime.now(),
                'ends_at': None,
            }
            
            return auction_data
        
        except Exception as e:
            self.log_error(f"Error parsing Haya property", e)
            return None

    def scrape(self, max_pages: int = 1, **kwargs) -> List[Dict[str, Any]]:
        """
        Scrape Servihabitat HTML listings (no public JSON API).
        """
        self.reset_stats()
        all_auctions: List[Dict[str, Any]] = []

        listing_url = self._build_listing_url(self.province)
        self.log_info(f"Scraping HTML: {listing_url}")

        try:
            items = self._fetch_listing_items(listing_url)
            self.log_info(f"Found {len(items)} listing items")

            for item in items:
                try:
                    detail = self._fetch_detail(item["detail_url"])
                    if not detail:
                        self.increment_stat('items_skipped')
                        continue

                    auction_data = self._build_auction_data(item, detail)
                    if auction_data and self.validate_auction_data(auction_data):
                        normalized = self.normalize_auction_data(auction_data)
                        self.db_adapter.upsert_auction(normalized)
                        all_auctions.append(normalized)
                        self.increment_stat('items_found')
                        self.increment_stat('items_saved')
                    else:
                        self.increment_stat('items_skipped')
                except Exception as e:
                    self.log_error("Error parsing Servihabitat item", e)
                    self.increment_stat('errors')

        except Exception as e:
            self.log_error("Servihabitat HTML scrape failed", e)

        self.log_info(f"Scraping completed. Found {len(all_auctions)} auctions")
        return all_auctions
    
    def extract_pagination_info(self, json_response: Dict) -> Optional[Dict]:
        """Extract pagination info from Haya response"""
        try:
            total = json_response.get('total', 0)
            page = json_response.get('page', 0)
            limit = json_response.get('limit', 50)
            
            total_pages = (total + limit - 1) // limit
            has_next = (page + 1) < total_pages
            
            return {
                'has_next': has_next,
                'total_pages': total_pages,
                'current_page': page
            }
        except:
            return None
    
    # Helper methods
    
    def _map_property_type(self, tipo: str) -> str:
        """Map Haya property type to our categories"""
        type_map = {
            'vivienda': 'Viviendas',
            'piso': 'Viviendas',
            'casa': 'Viviendas',
            'garaje': 'Garajes',
            'plaza de garaje': 'Garajes',
            'local comercial': 'Locales',
            'local': 'Locales',
            'oficina': 'Locales',
            'nave industrial': 'Naves industriales',
            'nave': 'Naves industriales',
            'terreno': 'Terrenos',
            'solar': 'Terrenos',
            'finca rustica': 'Fincas rústicas',
            'finca': 'Fincas rústicas',
        }
        
        tipo_lower = tipo.lower()
        for key, value in type_map.items():
            if key in tipo_lower:
                return value
        
        return 'Otros inmuebles'

    def _slugify(self, text: str) -> str:
        if not text:
            return ''
        replacements = {
            'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n',
            'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u', 'Ü': 'u', 'Ñ': 'n',
        }
        for src, dst in replacements.items():
            text = text.replace(src, dst)
        text = text.lower()
        text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
        return text

    def _build_listing_url(self, province: Optional[str]) -> str:
        if self.listing_mode == "sinposesion":
            base = f"{self.BASE_URL}/es/land/sinposesion/venta/vivienda"
        else:
            base = f"{self.BASE_URL}/es/venta/vivienda"

        if province:
            return f"{base}/{self._slugify(province)}"
        return base

    def _fetch_listing_items(self, url: str) -> List[Dict[str, Any]]:
        response = self.session.get(url, timeout=30)
        if response.status_code != 200:
            self.log_warning(f"Listing request failed: {response.status_code}")
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        items: List[Dict[str, Any]] = []

        for card in soup.select('.gtm-search-item'):
            data_id = card.get('data-id')
            if not data_id:
                continue
            link = card.find('a', href=True)
            if not link:
                continue
            detail_url = urljoin(self.BASE_URL, link['href'])
            items.append({
                'external_id': data_id,
                'price_raw': card.get('data-price'),
                'category_path': card.get('data-category') or '',
                'detail_url': detail_url,
            })

        return items

    def _fetch_detail(self, url: str) -> Optional[Dict[str, Any]]:
        response = self.session.get(url, timeout=30)
        if response.status_code != 200:
            self.log_warning(f"Detail request failed: {response.status_code}")
            return None

        soup = BeautifulSoup(response.text, "html.parser")
        product_json = None
        for script in soup.find_all('script', {'type': 'application/ld+json'}):
            try:
                data = json.loads(script.get_text())
                if isinstance(data, dict) and data.get('@type') == 'Product':
                    product_json = data
                    break
            except Exception:
                continue

        if not product_json:
            return None

        return {
            'product': product_json,
            'detail_url': url,
        }

    def _category_from_path(self, path_value: str, fallback: str) -> str:
        if not path_value:
            return fallback
        for key, value in {
            'vivienda': 'Viviendas',
            'piso': 'Viviendas',
            'casa': 'Viviendas',
            'atico': 'Viviendas',
            'garaje': 'Garajes',
            'local': 'Locales',
            'oficina': 'Locales',
            'nave': 'Naves industriales',
            'terreno': 'Terrenos',
            'finca': 'Fincas rústicas',
        }.items():
            if key in path_value:
                return value
        return fallback

    def _build_auction_data(self, item: Dict[str, Any], detail: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        product = detail.get('product') or {}
        offers = product.get('offers') or {}
        address = (offers.get('availableAtOrFrom') or {}).get('address') or {}

        price = offers.get('price') or item.get('price_raw')
        if price is None:
            return None

        title = product.get('name') or f"Inmueble Servihabitat {item.get('external_id')}"
        description = product.get('description')
        image_url = product.get('image')
        municipality = address.get('addressLocality')
        province = address.get('addressRegion') or self.province or 'Unknown'

        address_parts = [address.get('streetAddress'), municipality, province, address.get('postalCode')]
        full_address = ", ".join([p for p in address_parts if p])

        category = self._category_from_path(item.get('category_path', ''), self._map_property_type(title))
        boe_id = f"{self.get_source_name()}-{item.get('external_id')}"

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
            'boe_link': detail.get('detail_url'),
            'address': full_address or None,
            'image_url': image_url,
            'property_description': description,
            'published_at': datetime.now(),
            'ends_at': None,
        }
    
    def _parse_price(self, price) -> float:
        """Parse price to float"""
        if isinstance(price, (int, float)):
            return float(price)
        if isinstance(price, str):
            # Remove currency symbols and spaces
            cleaned = price.replace('€', '').replace('.', '').replace(',', '.').strip()
            try:
                return float(cleaned)
            except:
                return 0.0
        return 0.0
    
    def _extract_image_url(self, property_data: Dict) -> Optional[str]:
        """Extract image URL from property data"""
        # Try multiple possible fields
        if 'imagen' in property_data:
            return property_data['imagen']
        if 'foto' in property_data:
            return property_data['foto']
        if 'images' in property_data and property_data['images']:
            images = property_data['images']
            if isinstance(images, list) and len(images) > 0:
                img = images[0]
                if isinstance(img, str):
                    return img
                if isinstance(img, dict):
                    return img.get('url') or img.get('src')
        return None
