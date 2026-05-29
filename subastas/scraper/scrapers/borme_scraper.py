"""
BORME Scraper Module
Scrapes commercial and business asset auctions from BORME
(Boletín Oficial del Registro Mercantil)
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


class BORMEScraper(BaseScraper):
    """
    BORME scraper for commercial auctions
    Finds company liquidations and bankruptcy proceedings with asset sales
    """
    
    BASE_URL = "https://www.boe.es/borme"
    SEARCH_URL = f"{BASE_URL}/dias"
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.browser_manager = get_browser_manager()
        self.db_adapter = get_database_adapter()
    
    def get_source_name(self) -> str:
        return "BORME"
    
    def build_search_url(self, **kwargs) -> str:
        """Build BORME search URL"""
        date = kwargs.get('date', datetime.now())
        
        # BORME is organized by date
        year = date.year
        month = date.month
        day = date.day
        
        return f"{self.SEARCH_URL}/{year}/{month:02d}/{day:02d}/"
    
    def parse_listing(self, element: Any) -> Optional[Dict[str, Any]]:
        """Parse BORME announcement"""
        try:
            # Extract company name
            company_elem = element.locator('.empresa, .company-name')
            company_name = company_elem.inner_text().strip() if company_elem.count() > 0 else ''
            
            # Extract CIF
            cif_elem = element.locator('.cif, .company-id')
            cif = cif_elem.inner_text().strip() if cif_elem.count() > 0 else ''
            
            # Extract announcement type
            type_elem = element.locator('.tipo-anuncio, .announcement-type')
            announcement_type = type_elem.inner_text().strip() if type_elem.count() > 0 else ''
            
            # Extract PDF link
            pdf_elem = element.locator('a[href*=".pdf"]').first
            pdf_url = pdf_elem.get_attribute('href') if pdf_elem.count() > 0 else ''
            
            return {
                'company_name': company_name,
                'cif': cif,
                'announcement_type': announcement_type,
                'pdf_url': pdf_url,
            }
        
        except Exception as e:
            self.log_error(f"Failed to parse BORME listing: {e}")
            return None
    
    def scrape(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Main scrape method for BORME
        
        Args:
            announcement_types: Types to filter (default: liquidation/bankruptcy)
            date: Date to scrape (default: today)
            max_results: Maximum results to process
        """
        announcement_types = kwargs.get('announcement_types', [
            'Liquidación',
            'Concurso de acreedores',
            'Disolución',
        ])
        date = kwargs.get('date', datetime.now())
        max_results = kwargs.get('max_results', 20)
        
        self.reset_stats()
        self.log_info(f"Starting BORME scrape for date: {date.strftime('%Y-%m-%d')}")
        
        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)
            
            search_url = self.build_search_url(date=date)
            self.log_info(f"Navigating to: {search_url}")
            
            random_delay(1.0, 2.5)
            page.goto(search_url, wait_until='networkidle', timeout=30000)
            random_delay(2.0, 4.0)
            
            # Navigate to province section if specified
            if self.province:
                province_code = get_province_code(self.province)
                province_link = page.locator(f'a[href*="={province_code}"]').first
                if province_link.count() > 0:
                    random_delay(1.0, 2.0)
                    province_link.click()
                    page.wait_for_load_state('networkidle')
                    random_delay(2.0, 3.0)
            
            # Parse announcements
            announcement_items = page.locator('.anuncio, .empresa-item, .borme-entry').all()
            self.log_info(f"Found {len(announcement_items)} BORME announcements")
            
            for idx, item in enumerate(announcement_items[:max_results]):
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
            
            self.log_info(f"BORME scraping completed: {self.stats}")
            return self.results
        
        except Exception as e:
            self.log_error(f"BORME scraping failed: {e}", e)
            return self.results
        
        finally:
            if page:
                self.browser_manager.close_page(page)
    
    def scrape_liquidaciones(self, province: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Find company liquidation auctions
        
        Args:
            province: Optional province filter
        
        Returns:
            List of auction data dictionaries
        """
        self.province = province or self.province
        return self.scrape(announcement_types=['Liquidación'])
    
    def scrape_concursos(self, province: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Find bankruptcy proceedings with asset sales
        
        Args:
            province: Optional province filter
        
        Returns:
            List of auction data dictionaries
        """
        self.province = province or self.province
        return self.scrape(announcement_types=['Concurso de acreedores'])
    
    # Helper methods
    
    def _is_auction_relevant(self, listing_data: dict) -> bool:
        """Check if announcement is auction-relevant"""
        announcement_type = listing_data.get('announcement_type', '').lower()
        
        relevant_keywords = [
            'liquidación', 'concurso', 'disolución', 'subasta',
            'venta', 'adjudicación', 'enajenación',
        ]
        
        return any(keyword in announcement_type for keyword in relevant_keywords)
    
    def _convert_to_auction(self, listing_data: dict, full_text: str) -> Optional[Dict[str, Any]]:
        """Convert BORME announcement to auction format"""
        try:
            # Generate unique ID
            company_name = listing_data.get('company_name', '')
            cif = listing_data.get('cif', '')
            borme_id = f"BORME-{cif}" if cif else f"BORME-{hash(full_text[:100]) % 100000:05d}"
            
            # Extract asset info
            assets = self._extract_assets(full_text)
            title = assets if assets else f"Liquidación de {company_name}"
            
            auction_data = {
                'boe_id': borme_id,
                'title': title,
                'category': 'Otros bienes muebles',  # Default for business assets
                'province': self.province or self._extract_province(full_text),
                'municipality': self._extract_municipality(full_text),
                'status': 'PRE_AUCTION',
                'source': 'BORME',
                'appraisal_value': self._extract_value(full_text) or 100000,
                'current_bid': None,
                'court_name': company_name,
                'court_reference': cif,
                'edict_url': listing_data.get('pdf_url'),
                'published_at': datetime.now(),
                'ends_at': datetime.now() + timedelta(days=60),  # Estimate
                'image_url': 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=800&auto=format&fit=crop',
            }
            
            return auction_data
        
        except Exception as e:
            self.log_error(f"Failed to convert BORME entry to auction: {e}")
            return None
    
    def _extract_assets(self, text: str) -> str:
        """Extract asset description from text"""
        patterns = [
            r'(?:Activos?|Bienes?)[:\s]+([^\n]{10,150})',
            r'(?:Venta de)[:\s]+([^\n]{10,150})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return ''
    
    def _extract_value(self, text: str) -> Optional[float]:
        """Extract monetary value from text"""
        keywords = ['Valor', 'Precio', 'Importe', 'Valoración']
        
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
        ]
        
        for municipality in municipalities:
            if municipality.lower() in text.lower():
                return municipality
        
        return None
