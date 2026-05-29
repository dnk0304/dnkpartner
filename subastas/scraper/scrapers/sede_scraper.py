"""
Sede Judicial Scraper Module
Scrapes court proceedings from Sede Judicial Electrónica
Finds mortgage executions and other pre-auction proceedings
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


class SedeJudicialScraper(BaseScraper):
    """
    Sede Judicial Electrónica scraper
    Monitors court proceedings for mortgage executions heading to auction
    """
    
    BASE_URL = "https://sedejudicial.justicia.es"
    SEARCH_URL = f"{BASE_URL}/sede/portal/citaciones"
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.browser_manager = get_browser_manager()
        self.db_adapter = get_database_adapter()
    
    def get_source_name(self) -> str:
        return "SEDE"
    
    def build_search_url(self, **kwargs) -> str:
        """Build Sede Judicial search URL"""
        court_id = kwargs.get('court_id')
        
        if court_id:
            return f"{self.SEARCH_URL}/juzgado/{court_id}"
        
        return self.SEARCH_URL
    
    def parse_listing(self, element: Any) -> Optional[Dict[str, Any]]:
        """Parse court proceeding listing"""
        try:
            # Extract proceeding number (NIG)
            nig_elem = element.locator('.nig, .proceeding-number')
            nig = nig_elem.inner_text().strip() if nig_elem.count() > 0 else ''
            
            # Extract court name
            court_elem = element.locator('.juzgado, .court')
            court_name = court_elem.inner_text().strip() if court_elem.count() > 0 else ''
            
            # Extract proceeding type
            type_elem = element.locator('.tipo-procedimiento, .proceeding-type')
            proc_type = type_elem.inner_text().strip() if type_elem.count() > 0 else ''
            
            # Extract parties
            parties_elem = element.locator('.partes, .parties')
            parties = parties_elem.inner_text().strip() if parties_elem.count() > 0 else ''
            
            # Extract date
            date_elem = element.locator('.fecha, .date')
            date_text = date_elem.inner_text().strip() if date_elem.count() > 0 else ''
            
            return {
                'nig': nig,
                'court_name': court_name,
                'proceeding_type': proc_type,
                'parties': parties,
                'date_text': date_text,
            }
        
        except Exception as e:
            self.log_error(f"Failed to parse Sede listing: {e}")
            return None
    
    def scrape(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Main scrape method for Sede Judicial
        
        Args:
            proceeding_types: List of proceeding types to filter (default: execution-related)
            max_results: Maximum results to process
        """
        proceeding_types = kwargs.get('proceeding_types', [
            'Ejecución hipotecaria',
            'Ejecución de títulos judiciales',
            'Procedimiento ordinario',
        ])
        max_results = kwargs.get('max_results', 20)
        
        self.reset_stats()
        self.log_info(f"Starting Sede Judicial scrape for province: {self.province or 'ALL'}")
        
        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)
            
            search_url = self.build_search_url(**kwargs)
            self.log_info(f"Navigating to: {search_url}")
            
            random_delay(1.0, 2.5)
            page.goto(search_url, wait_until='networkidle', timeout=30000)
            random_delay(2.0, 4.0)
            
            # Search for execution proceedings
            search_input = page.locator('input[name="busqueda"], input[type="search"]')
            if search_input.count() > 0:
                search_query = "ejecución hipotecaria"
                if self.province:
                    search_query += f" {self.province}"
                
                random_delay(0.5, 1.5)
                search_input.first.fill(search_query)
                random_delay(0.5, 1.0)
                
                # Submit search
                submit_button = page.locator('button[type="submit"], input[type="submit"]')
                if submit_button.count() > 0:
                    submit_button.first.click()
                    page.wait_for_load_state('networkidle')
                    random_delay(2.0, 3.0)
            
            # Parse results
            result_items = page.locator('.resultado, .proceeding-item, .anuncio').all()
            self.log_info(f"Found {len(result_items)} proceedings")
            
            for idx, item in enumerate(result_items[:max_results]):
                try:
                    listing_data = self.parse_listing(item)
                    
                    if listing_data and self._is_auction_relevant(listing_data):
                        # Extract full details
                        full_text = item.inner_text()
                        auction_data = self._convert_to_auction(listing_data, full_text)
                        
                        if auction_data and self.validate_auction_data(auction_data):
                            self.db_adapter.upsert_auction(auction_data)
                            self.results.append(auction_data)
                            self.increment_stat('items_saved')
                    else:
                        self.increment_stat('items_skipped')
                    
                    self.increment_stat('items_found')
                
                except Exception as e:
                    self.log_error(f"Error processing item {idx}: {e}")
                    self.increment_stat('errors')
            
            self.log_info(f"Sede Judicial scraping completed: {self.stats}")
            return self.results
        
        except Exception as e:
            self.log_error(f"Sede Judicial scraping failed: {e}", e)
            return self.results
        
        finally:
            if page:
                self.browser_manager.close_page(page)
    
    def scrape_court_announcements(self, court_id: str) -> List[Dict[str, Any]]:
        """
        Scrape announcements from a specific court
        
        Args:
            court_id: Court identifier
        
        Returns:
            List of auction data dictionaries
        """
        return self.scrape(court_id=court_id)
    
    # Helper methods
    
    def _is_auction_relevant(self, listing_data: dict) -> bool:
        """Check if proceeding is auction-relevant"""
        proc_type = listing_data.get('proceeding_type', '').lower()
        
        relevant_keywords = [
            'ejecución', 'hipotecaria', 'subasta', 'embargo',
            'procedimiento ordinario', 'remate',
        ]
        
        return any(keyword in proc_type for keyword in relevant_keywords)
    
    def _convert_to_auction(self, listing_data: dict, full_text: str) -> Optional[Dict[str, Any]]:
        """Convert Sede proceeding to auction format"""
        try:
            # Generate unique ID
            nig = listing_data.get('nig', '')
            sede_id = f"SEDE-{nig}" if nig else f"SEDE-{hash(full_text[:100]) % 100000:05d}"
            
            # Extract property info from text
            title = self._extract_property_info(full_text)
            address = self._extract_address(full_text)
            appraisal = self._extract_value(full_text)
            
            auction_data = {
                'boe_id': sede_id,
                'title': title or f"Ejecución hipotecaria - {listing_data.get('court_name', 'Desconocido')}",
                'category': get_category_type(title or '', full_text),
                'province': self.province or self._extract_province(full_text),
                'municipality': self._extract_municipality(full_text),
                'status': 'PRE_AUCTION',
                'source': 'SEDE',
                'appraisal_value': appraisal or 200000,
                'current_bid': None,
                'court_name': listing_data.get('court_name'),
                'court_reference': nig,
                'procedure_number': nig,
                'published_at': datetime.now(),
                'ends_at': datetime.now() + timedelta(days=90),  # Estimate
                'address': address,
                'image_url': 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop',
            }
            
            return auction_data
        
        except Exception as e:
            self.log_error(f"Failed to convert proceeding to auction: {e}")
            return None
    
    def _extract_property_info(self, text: str) -> str:
        """Extract property information from text"""
        patterns = [
            r'(?:Finca|Inmueble|Vivienda)[:\s]+([^\n]{10,150})',
            r'(?:Descripción)[:\s]+([^\n]{10,150})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return ''
    
    def _extract_address(self, text: str) -> Optional[str]:
        """Extract address from text"""
        patterns = [
            r'(?:Dirección|Sita en|Ubicada en)[:\s]+([^\n]{10,200})',
            r'(?:Calle|Avenida|Plaza)[^,\n]{5,150}',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                address = match.group(1).strip() if match.lastindex else match.group(0).strip()
                return address
        
        return None
    
    def _extract_value(self, text: str) -> Optional[float]:
        """Extract monetary value from text"""
        keywords = ['Valor', 'Tasación', 'Valoración', 'Crédito']
        
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
    
    def _extract_province(self, text: str) -> str:
        """Extract province from text"""
        from ..config.provinces import ALL_PROVINCES
        
        for province_name in ALL_PROVINCES.keys():
            if province_name.lower() in text.lower():
                return province_name
        
        return 'Unknown'
    
    def _extract_municipality(self, text: str) -> Optional[str]:
        """Extract municipality from text"""
        municipalities = [
            'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza',
            'Málaga', 'Murcia', 'Palma', 'Las Palmas de Gran Canaria',
            'Bilbao', 'Alicante', 'Córdoba', 'Valladolid',
        ]
        
        for municipality in municipalities:
            if municipality.lower() in text.lower():
                return municipality
        
        return None
