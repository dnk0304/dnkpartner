"""
BOE Vehicle Scraper Module
Dedicated scraper for vehicle auctions from Portal de Subastas BOE

Scrapes all vehicle categories:
- VT = Vehículos Turismos (cars)
- VM = Vehículos Motocicletas (motorcycles)
- VI = Vehículos Industriales (commercial vehicles, trucks)
- VE = Embarcaciones (boats/vessels)
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import re
import logging

from .boe_scraper import BOEScraper, BOE_STATUS_MAP
from ..core.stealth import random_delay
from ..config.provinces import get_province_code, ALL_PROVINCES
from ..config.settings import SCRAPE_MAX_PAGES, BOE_REQUEST_DELAY_SECONDS

logger = logging.getLogger(__name__)

# BOE Vehicle Category Codes
VEHICLE_CATEGORIES = {
    'turismos': {
        'code': 'V',      # BOE code for Vehículos (general, often cars)
        'category': 'Turismos',
        'label': 'Vehículos Turismos',
    },
    'motocicletas': {
        'code': 'M',      # Motocicletas
        'category': 'Motocicletas',
        'label': 'Motocicletas',
    },
    'industriales': {
        'code': 'I',      # Industrial vehicles
        'category': 'Vehículos Industriales',
        'label': 'Vehículos Industriales',
    },
    'barcos': {
        'code': 'E',      # Embarcaciones (boats)
        'category': 'Barcos',
        'label': 'Embarcaciones',
    },
}


class BOEVehicleScraper(BOEScraper):
    """
    Specialized BOE scraper for vehicle auctions
    Inherits from BOEScraper and adds vehicle-specific functionality
    """
    
    def __init__(self, province: Optional[str] = None, vehicle_type: str = 'turismos'):
        super().__init__(province)
        self.vehicle_type = vehicle_type
        self.vehicle_config = VEHICLE_CATEGORIES.get(vehicle_type, VEHICLE_CATEGORIES['turismos'])
    
    def get_source_name(self) -> str:
        return f"BOE_{self.vehicle_config['label'].upper().replace(' ', '_')}"
    
    def build_vehicle_search_url(self, **kwargs) -> str:
        """
        Build BOE search URL for vehicle auctions
        
        Args:
            province: Province name (optional)
            vehicle_code: Vehicle category code (V, M, I, E)
            status: BOE status code (EJ = active, PA = pre-auction, etc.)
        """
        province = kwargs.get('province', self.province)
        vehicle_code = kwargs.get('vehicle_code', self.vehicle_config['code'])
        status_code = kwargs.get('status_code', 'EJ')  # Default to active auctions
        
        # Build URL with vehicle category filter
        url = f"{self.SEARCH_URL}?"
        field_index = 0
        
        # Vehicle type filter - this is the primary filter
        url += f"campo[{field_index}]=BIEN.TIPO&dato[{field_index}]={vehicle_code}"
        field_index += 1
        
        # Status filter
        url += f"&campo[{field_index}]=SUBASTA.ESTADO&dato[{field_index}]={status_code}"
        field_index += 1
        
        # Province filter (optional)
        if province:
            province_code = get_province_code(province)
            url += f"&campo[{field_index}]=SUBASTA.CODPROV&dato[{field_index}]={province_code}"
        
        return url
    
    def parse_vehicle_listing(self, element: Any, status_override: str = None) -> Optional[Dict[str, Any]]:
        """
        Parse a vehicle auction listing with vehicle-specific data extraction
        
        Args:
            element: Playwright Locator for auction item
            status_override: Override status (e.g., from search filter)
        
        Returns:
            Vehicle auction data dictionary or None
        """
        # Use parent parse_listing for basic data
        base_data = self.parse_listing(element, status_override)
        
        if not base_data:
            return None
        
        # Override category with vehicle category
        base_data['category'] = self.vehicle_config['category']
        
        # Extract vehicle-specific data from full text
        try:
            full_text = element.inner_text()
            
            # Extract make/model
            make_model = self._extract_vehicle_make_model(full_text)
            if make_model:
                base_data['title'] = f"{make_model} - {base_data['title']}"
            
            # Extract year
            year = self._extract_vehicle_year(full_text)
            if year:
                base_data['lot_description'] = f"Año: {year}"
            
            # Extract mileage
            mileage = self._extract_vehicle_mileage(full_text)
            if mileage:
                if base_data.get('lot_description'):
                    base_data['lot_description'] += f", Km: {mileage:,}"
                else:
                    base_data['lot_description'] = f"Km: {mileage:,}"
            
            # Extract fuel type
            fuel_type = self._extract_fuel_type(full_text)
            if fuel_type:
                if base_data.get('lot_description'):
                    base_data['lot_description'] += f", Combustible: {fuel_type}"
                else:
                    base_data['lot_description'] = f"Combustible: {fuel_type}"
            
        except Exception as e:
            self.log_warning(f"Failed to extract vehicle-specific data: {e}")
        
        return base_data
    
    def scrape_vehicles(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Scrape vehicle auctions with the configured vehicle type
        
        Args:
            max_pages: Maximum pages to scrape
            status: 'active', 'pre-auction', 'finished'
        
        Returns:
            List of vehicle auction data dictionaries
        """
        max_pages = kwargs.get('max_pages', SCRAPE_MAX_PAGES)
        status = kwargs.get('status', 'active')
        
        # Map status to BOE status code
        status_code_map = {
            'pre-auction': 'PA',
            'active': 'EJ',
            'finished': 'CE',
            'suspended': 'SU',
        }
        status_code = status_code_map.get(status, 'EJ')
        status_override = BOE_STATUS_MAP.get(status_code, 'CELEBRANDOSE')
        
        self.reset_stats()
        self.log_info(f"Starting vehicle scrape: {self.vehicle_config['label']}, province: {self.province or 'ALL'}")
        
        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)
            
            # Build vehicle search URL
            search_url = self.build_vehicle_search_url(status_code=status_code, **kwargs)
            self.log_info(f"Navigating to: {search_url}")
            
            random_delay(1.0, 3.0)
            page.goto(search_url, wait_until='networkidle', timeout=30000)
            random_delay(2.0, 4.0)
            
            # Wait for results
            page.wait_for_selector('.resultado-busqueda, .sin-resultados', timeout=10000)
            
            if page.locator('.sin-resultados').count() > 0:
                self.log_info("No vehicle auctions found")
                return []
            
            # Scrape pages
            current_page = 1
            while current_page <= max_pages:
                self.log_info(f"Scraping page {current_page}/{max_pages}")
                
                auction_items = page.locator('.resultado-busqueda, .resultado-subasta').all()
                self.log_info(f"Found {len(auction_items)} vehicle items on page")
                
                for item in auction_items:
                    try:
                        auction_data = self.parse_vehicle_listing(item, status_override=status_override)
                        
                        if auction_data and self.validate_auction_data(auction_data):
                            self.db_adapter.upsert_auction(auction_data)
                            self.results.append(auction_data)
                            self.increment_stat('items_saved')
                        else:
                            self.increment_stat('items_skipped')
                    
                    except Exception as e:
                        self.log_error(f"Error processing vehicle item: {e}")
                        self.increment_stat('errors')
                
                self.increment_stat('items_found', len(auction_items))
                
                # Next page
                next_button = page.locator('a.siguiente, .pagination a.next')
                if next_button.count() > 0 and current_page < max_pages:
                    random_delay(BOE_REQUEST_DELAY_SECONDS, BOE_REQUEST_DELAY_SECONDS + 2)
                    next_button.first.click()
                    page.wait_for_load_state('networkidle')
                    random_delay(2.0, 4.0)
                    current_page += 1
                else:
                    break
            
            self.log_info(f"Vehicle scraping completed: {self.stats}")
            return self.results
        
        except Exception as e:
            self.log_error(f"Vehicle scraping failed: {e}", e)
            return self.results
        
        finally:
            if page:
                self.browser_manager.close_page(page)
    
    def scrape_all_vehicle_types(self, **kwargs) -> Dict[str, List[Dict[str, Any]]]:
        """
        Scrape all vehicle categories
        
        Returns:
            Dictionary with vehicle_type -> auctions list
        """
        results = {}
        
        for vehicle_type in VEHICLE_CATEGORIES.keys():
            self.log_info(f"Scraping vehicle type: {vehicle_type}")
            self.vehicle_type = vehicle_type
            self.vehicle_config = VEHICLE_CATEGORIES[vehicle_type]
            
            auctions = self.scrape_vehicles(**kwargs)
            results[vehicle_type] = auctions
            
            self.log_info(f"Completed {vehicle_type}: {len(auctions)} auctions")
            
            # Delay between vehicle types
            random_delay(10.0, 20.0)
        
        total = sum(len(auctions) for auctions in results.values())
        self.log_info(f"All vehicle types completed. Total: {total} auctions")
        return results
    
    # Vehicle-specific extraction methods
    
    def _extract_vehicle_make_model(self, text: str) -> Optional[str]:
        """Extract vehicle make and model from text"""
        # Common patterns for make/model
        patterns = [
            r'(?:Marca|Modelo)[:\s]+([^\n,]+)',
            r'((?:BMW|Mercedes|Audi|Volkswagen|Ford|Seat|Renault|Peugeot|Citroen|Toyota|Honda|Nissan|Hyundai|Kia|Fiat|Opel|Volvo)[^\n,]*)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()[:100]  # Limit length
        
        return None
    
    def _extract_vehicle_year(self, text: str) -> Optional[int]:
        """Extract vehicle year from text"""
        patterns = [
            r'(?:Año|Matriculación)[:\s]+(\d{4})',
            r'(\d{4})\s*(?:año|matriculación)',
            r'matrícula[^\d]*(\d{4})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                year = int(match.group(1))
                if 1980 <= year <= datetime.now().year + 1:
                    return year
        
        return None
    
    def _extract_vehicle_mileage(self, text: str) -> Optional[int]:
        """Extract vehicle mileage from text"""
        patterns = [
            r'(?:Km|Kilómetros|Kilometraje)[:\s]+([0-9.,]+)',
            r'([0-9.,]+)\s*(?:km|kilómetros)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    mileage_str = match.group(1).replace('.', '').replace(',', '')
                    mileage = int(mileage_str)
                    if 0 < mileage < 10000000:  # Sanity check
                        return mileage
                except:
                    continue
        
        return None
    
    def _extract_fuel_type(self, text: str) -> Optional[str]:
        """Extract fuel type from text"""
        fuel_types = {
            'gasolina': 'Gasolina',
            'diesel': 'Diesel',
            'diésel': 'Diesel',
            'gasoil': 'Diesel',
            'eléctrico': 'Eléctrico',
            'híbrido': 'Híbrido',
            'gas': 'Gas',
            'glp': 'GLP',
            'gnc': 'GNC',
        }
        
        text_lower = text.lower()
        for pattern, fuel in fuel_types.items():
            if pattern in text_lower:
                return fuel
        
        return None


def scrape_all_vehicles(province: Optional[str] = None, max_pages: int = 5) -> Dict[str, int]:
    """
    Convenience function to scrape all vehicle types
    
    Args:
        province: Optional province filter
        max_pages: Max pages per vehicle type
    
    Returns:
        Dictionary with vehicle_type -> count mapping
    """
    scraper = BOEVehicleScraper(province=province)
    results = scraper.scrape_all_vehicle_types(max_pages=max_pages)
    return {k: len(v) for k, v in results.items()}
