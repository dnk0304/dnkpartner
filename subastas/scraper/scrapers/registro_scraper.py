"""
Registro de la Propiedad Scraper Module
Scrapes property registry for liens and encumbrances heading to auction
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import re
import logging

from ..core.base_scraper import BaseScraper
from ..core.browser import get_browser_manager
from ..core.stealth import random_delay
from ..config.provinces import get_province_code
from ..config.categories import get_category_type
from ..database.adapter import get_database_adapter

logger = logging.getLogger(__name__)


class RegistroScraper(BaseScraper):
    """
    Registro de la Propiedad scraper
    Finds properties with liens (cargas) that may lead to auction
    """
    
    BASE_URL = "https://www.registradores.org"
    SEARCH_URL = f"{BASE_URL}/busqueda"
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.browser_manager = get_browser_manager()
        self.db_adapter = get_database_adapter()
    
    def get_source_name(self) -> str:
        return "REGISTRO"
    
    def build_search_url(self, **kwargs) -> str:
        """Build Registro search URL"""
        return self.SEARCH_URL
    
    def parse_listing(self, element: Any) -> Optional[Dict[str, Any]]:
        """Parse property registry listing"""
        try:
            # Extract finca reference
            finca_elem = element.locator('.finca, .property-ref')
            finca_ref = finca_elem.inner_text().strip() if finca_elem.count() > 0 else ''
            
            # Extract property description
            desc_elem = element.locator('.descripcion, .description')
            description = desc_elem.inner_text().strip() if desc_elem.count() > 0 else ''
            
            # Extract registry location
            location_elem = element.locator('.registro, .registry')
            registry_name = location_elem.inner_text().strip() if location_elem.count() > 0 else ''
            
            return {
                'finca_ref': finca_ref,
                'description': description,
                'registry_name': registry_name,
            }
        
        except Exception as e:
            self.log_error(f"Failed to parse Registro listing: {e}")
            return None
    
    def scrape(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Main scrape method for Registro de la Propiedad
        
        Args:
            search_type: Type of search ('cargas', 'hipotecas')
            max_results: Maximum results to process
        """
        search_type = kwargs.get('search_type', 'cargas')
        max_results = kwargs.get('max_results', 10)
        
        self.reset_stats()
        self.log_info(f"Starting Registro scrape for province: {self.province or 'ALL'}")
        self.log_warning("Registro scraper is experimental - property registry access may be restricted")
        
        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)
            
            search_url = self.build_search_url(**kwargs)
            self.log_info(f"Navigating to: {search_url}")
            
            random_delay(1.0, 2.5)
            page.goto(search_url, wait_until='networkidle', timeout=30000)
            random_delay(2.0, 4.0)
            
            # Note: Actual implementation depends on registry portal structure
            # Most property registries require authentication or have restricted access
            
            # Placeholder logic
            self.log_info("Searching for properties with liens...")
            
            # In practice, this would:
            # 1. Search for properties with mortgage liens
            # 2. Filter for those in execution proceedings
            # 3. Extract property details
            # 4. Convert to auction format
            
            self.log_warning("Registro scraper requires authentication - no results available in demo mode")
            
            self.log_info(f"Registro scraping completed: {self.stats}")
            return self.results
        
        except Exception as e:
            self.log_error(f"Registro scraping failed: {e}", e)
            return self.results
        
        finally:
            if page:
                self.browser_manager.close_page(page)
    
    def search_cargas(self, province: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Search for properties with auction-related liens
        
        Args:
            province: Optional province filter
        
        Returns:
            List of auction data dictionaries
        """
        self.province = province or self.province
        return self.scrape(search_type='cargas')
    
    def get_nota_simple(self, finca_id: str) -> Optional[Dict[str, Any]]:
        """
        Get property registry extract (nota simple) if public
        
        Args:
            finca_id: Property registry reference
        
        Returns:
            Property data dictionary or None
        """
        self.log_warning("get_nota_simple requires authentication and is not available in demo mode")
        return None
    
    # Helper methods
    
    def _convert_to_auction(self, listing_data: dict, full_text: str) -> Optional[Dict[str, Any]]:
        """Convert Registro property to auction format"""
        try:
            # Generate unique ID
            finca_ref = listing_data.get('finca_ref', '')
            registro_id = f"REGISTRO-{finca_ref}" if finca_ref else f"REGISTRO-{hash(full_text[:100]) % 100000:05d}"
            
            # Extract property info
            description = listing_data.get('description', '')
            title = description[:100] if description else f"Finca {finca_ref}"
            
            auction_data = {
                'boe_id': registro_id,
                'title': title,
                'category': get_category_type(title, full_text),
                'province': self.province or 'Unknown',
                'municipality': self._extract_municipality(full_text),
                'status': 'PRE_AUCTION',
                'source': 'REGISTRO',
                'appraisal_value': self._extract_value(full_text) or 250000,
                'current_bid': None,
                'court_reference': finca_ref,
                'published_at': datetime.now(),
                'ends_at': datetime.now() + timedelta(days=120),  # Estimate
                'image_url': 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop',
            }
            
            return auction_data
        
        except Exception as e:
            self.log_error(f"Failed to convert property to auction: {e}")
            return None
    
    def _extract_value(self, text: str) -> Optional[float]:
        """Extract monetary value from text"""
        keywords = ['Valor', 'Tasación', 'Valoración', 'Hipoteca']
        
        for keyword in keywords:
            pattern = f'(?:{keyword})[:\\s]+([0-9.,]+)\\s*(?:€|euros?)'
            match = re.search(pattern, text, re.IGNORECASE)
            
            if match:
                value_str = match.group(1).replace('.', '').replace(',', '.')
                try:
                    return float(value_str)
                except:
                    continue
        
        return None
    
    def _extract_municipality(self, text: str) -> Optional[str]:
        """Extract municipality from text"""
        municipalities = [
            'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza',
            'Málaga', 'Murcia', 'Palma', 'Las Palmas de Gran Canaria',
        ]
        
        for municipality in municipalities:
            if municipality.lower() in text.lower():
                return municipality
        
        return None
