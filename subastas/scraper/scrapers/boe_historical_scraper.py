"""
BOE Historical Scraper Module
Scrapes finished auctions from Portal de Subastas BOE for market analytics

Features:
- Scrapes in monthly batches to avoid timeouts
- Captures 2 years of historical data
- Extracts final bid prices for market analysis
- Calculates discount percentages (final bid vs appraisal)
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import re
import logging
import time

from .boe_scraper import BOEScraper, BOE_STATUS_MAP
from ..core.stealth import random_delay
from ..config.provinces import get_province_code, ALL_PROVINCES
from ..config.settings import SCRAPE_MAX_PAGES, BOE_REQUEST_DELAY_SECONDS

logger = logging.getLogger(__name__)


class BOEHistoricalScraper(BOEScraper):
    """
    Specialized BOE scraper for historical/finished auctions
    Used for market analytics and price trends
    """
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.months_to_scrape = 24  # 2 years
    
    def get_source_name(self) -> str:
        return "BOE_HISTORICAL"
    
    def build_historical_search_url(self, start_date: datetime, end_date: datetime, **kwargs) -> str:
        """
        Build BOE search URL for historical/finished auctions within a date range
        
        Args:
            start_date: Start of date range
            end_date: End of date range
            province: Province name (optional)
        """
        province = kwargs.get('province', self.province)
        
        # Format dates for BOE (DD/MM/YYYY)
        start_str = start_date.strftime('%d/%m/%Y')
        end_str = end_date.strftime('%d/%m/%Y')
        
        url = f"{self.SEARCH_URL}?"
        field_index = 0
        
        # Status filter - CE = Cerrada (Finished)
        url += f"campo[{field_index}]=SUBASTA.ESTADO&dato[{field_index}]=CE"
        field_index += 1
        
        # Date range filter
        url += f"&campo[{field_index}]=SUBASTA.FECHA_FIN&dato[{field_index}]={start_str}"
        field_index += 1
        url += f"&campo[{field_index}]=SUBASTA.FECHA_FIN&operador[{field_index}]=<="
        url += f"&dato[{field_index}]={end_str}"
        field_index += 1
        
        # Province filter (optional)
        if province:
            province_code = get_province_code(province)
            url += f"&campo[{field_index}]=SUBASTA.CODPROV&dato[{field_index}]={province_code}"
        
        return url
    
    def parse_historical_listing(self, element: Any) -> Optional[Dict[str, Any]]:
        """
        Parse a historical auction listing with focus on final bid data
        
        Args:
            element: Playwright Locator for auction item
        
        Returns:
            Historical auction data dictionary or None
        """
        # Use parent parse_listing with finished status
        base_data = self.parse_listing(element, status_override='CONCLUIDA_PORTAL')
        
        if not base_data:
            return None
        
        # Extract historical-specific data
        try:
            full_text = element.inner_text()
            
            # Extract final bid amount
            final_bid = self._extract_currency(full_text, [
                'Puja final', 'Precio adjudicación', 'Adjudicado', 'Importe final'
            ])
            if final_bid:
                base_data['final_bid'] = final_bid
            
            # Extract bid count if available
            bid_count = self._extract_bid_count(full_text)
            if bid_count:
                base_data['bid_count'] = bid_count
            
            # Calculate discount percentage
            if final_bid and base_data.get('appraisal_value'):
                discount = ((base_data['appraisal_value'] - final_bid) / base_data['appraisal_value']) * 100
                base_data['discount_percentage'] = round(discount, 2)
            
            # Extract auction duration
            start_date = self._extract_start_date(full_text)
            end_date = self._extract_end_date(full_text)
            if start_date and end_date:
                duration = (end_date - start_date).days
                base_data['auction_duration_days'] = duration
            
        except Exception as e:
            self.log_warning(f"Failed to extract historical-specific data: {e}")
        
        return base_data
    
    def scrape_month(self, year: int, month: int, **kwargs) -> List[Dict[str, Any]]:
        """
        Scrape finished auctions for a specific month
        
        Args:
            year: Year to scrape
            month: Month to scrape (1-12)
        
        Returns:
            List of historical auction data dictionaries
        """
        max_pages = kwargs.get('max_pages', SCRAPE_MAX_PAGES)
        
        # Calculate date range for the month
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        
        self.reset_stats()
        self.log_info(f"Scraping historical auctions for {year}-{month:02d}")
        
        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)
            
            # Build historical search URL
            search_url = self.build_historical_search_url(start_date, end_date, **kwargs)
            self.log_info(f"Navigating to: {search_url}")
            
            random_delay(1.0, 3.0)
            page.goto(search_url, wait_until='networkidle', timeout=30000)
            random_delay(2.0, 4.0)
            
            # Wait for results
            page.wait_for_selector('.resultado-busqueda, .sin-resultados', timeout=10000)
            
            if page.locator('.sin-resultados').count() > 0:
                self.log_info(f"No historical auctions found for {year}-{month:02d}")
                return []
            
            # Scrape pages
            current_page = 1
            while current_page <= max_pages:
                self.log_info(f"Scraping page {current_page}/{max_pages}")
                
                auction_items = page.locator('.resultado-busqueda, .resultado-subasta').all()
                self.log_info(f"Found {len(auction_items)} historical items on page")
                
                for item in auction_items:
                    try:
                        auction_data = self.parse_historical_listing(item)
                        
                        if auction_data and self.validate_auction_data(auction_data):
                            self.db_adapter.upsert_auction(auction_data)
                            self.results.append(auction_data)
                            self.increment_stat('items_saved')
                        else:
                            self.increment_stat('items_skipped')
                    
                    except Exception as e:
                        self.log_error(f"Error processing historical item: {e}")
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
            
            self.log_info(f"Historical scraping for {year}-{month:02d} completed: {len(self.results)} auctions")
            return self.results
        
        except Exception as e:
            self.log_error(f"Historical scraping failed for {year}-{month:02d}: {e}", e)
            return self.results
        
        finally:
            if page:
                self.browser_manager.close_page(page)
    
    def scrape_historical_range(self, months: int = 24, **kwargs) -> Dict[str, int]:
        """
        Scrape historical auctions for the past N months
        
        Args:
            months: Number of months to scrape (default: 24 = 2 years)
        
        Returns:
            Dictionary with "YYYY-MM" -> count mapping
        """
        results = {}
        current_date = datetime.now()
        
        self.log_info(f"Starting historical scrape for {months} months")
        
        for month_offset in range(months):
            target_date = current_date - relativedelta(months=month_offset)
            year = target_date.year
            month = target_date.month
            month_key = f"{year}-{month:02d}"
            
            self.log_info(f"Processing {month_key} ({month_offset + 1}/{months})")
            
            try:
                auctions = self.scrape_month(year, month, **kwargs)
                results[month_key] = len(auctions)
                self.log_info(f"Completed {month_key}: {len(auctions)} auctions")
            
            except Exception as e:
                self.log_error(f"Failed to scrape {month_key}: {e}")
                results[month_key] = 0
            
            # Rate limiting: pause between months
            if month_offset < months - 1:
                delay = 60  # 1 minute between months
                self.log_info(f"Waiting {delay}s before next month...")
                time.sleep(delay)
        
        total = sum(results.values())
        self.log_info(f"Historical scrape completed. Total: {total} auctions over {months} months")
        
        return results
    
    def scrape_full_history(self, **kwargs) -> Dict[str, int]:
        """
        Scrape full 2-year history
        
        Returns:
            Dictionary with "YYYY-MM" -> count mapping
        """
        return self.scrape_historical_range(months=self.months_to_scrape, **kwargs)
    
    # Historical-specific extraction methods
    
    def _extract_bid_count(self, text: str) -> Optional[int]:
        """Extract number of bids from text"""
        patterns = [
            r'(?:Pujas|Licitadores)[:\s]+(\d+)',
            r'(\d+)\s*(?:pujas|licitadores)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    return int(match.group(1))
                except:
                    continue
        
        return None
    
    def _extract_start_date(self, text: str) -> Optional[datetime]:
        """Extract auction start date from text"""
        patterns = [
            r'(?:Inicio|Apertura|Comienza)[:\s]+(\d{1,2})[/-](\d{1,2})[/-](\d{4})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    day, month, year = match.groups()
                    return datetime(int(year), int(month), int(day))
                except:
                    continue
        
        return None


def run_historical_batch(months: int = 24, province: Optional[str] = None) -> Dict[str, int]:
    """
    Run historical batch scraping job
    
    Args:
        months: Number of months to scrape
        province: Optional province filter
    
    Returns:
        Dictionary with month -> count mapping
    """
    scraper = BOEHistoricalScraper(province=province)
    return scraper.scrape_historical_range(months=months)


def get_historical_stats(results: Dict[str, int]) -> Dict[str, Any]:
    """
    Calculate statistics from historical scrape results
    
    Args:
        results: Dictionary with month -> count mapping
    
    Returns:
        Statistics dictionary
    """
    if not results:
        return {}
    
    counts = list(results.values())
    return {
        'total_auctions': sum(counts),
        'months_scraped': len(results),
        'average_per_month': round(sum(counts) / len(counts), 1),
        'max_month': max(results.items(), key=lambda x: x[1]),
        'min_month': min(results.items(), key=lambda x: x[1]),
    }
