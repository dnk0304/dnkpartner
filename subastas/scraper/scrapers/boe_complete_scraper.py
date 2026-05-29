"""
BOE Complete Backfill Scraper
Extends BOEScraper to fetch ALL auctions (all statuses) with full detail pages.

Key features:
- Scrapes ALL status codes (not just finished)
- Fetches detail pages for comprehensive data
- Saves auctions even without appraisal value
- Month-by-month approach for 6 years
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import json
import logging
from pathlib import Path

from .boe_scraper import BOEScraper
from ..core.stealth import random_delay
from ..config.settings import SCRAPER_ROOT, BOE_REQUEST_DELAY_SECONDS, SCRAPE_MAX_PAGES

logger = logging.getLogger(__name__)

PROGRESS_FILE = SCRAPER_ROOT / 'complete_backfill_progress.json'


class BOECompleteBackfillScraper(BOEScraper):
    """Complete historical backfill with ALL statuses and detail fetching"""
    
    def __init__(self):
        super().__init__(province=None)
        self.max_pages = 100  # Higher page limit for backfill
    
    def get_source_name(self) -> str:
        return "BOE_COMPLETE_BACKFILL"
    
    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """Relaxed validation - appraisal value is optional"""
        required_fields = ['boe_id', 'title', 'category', 'province', 'status']
        
        for field in required_fields:
            if field not in data or data[field] is None:
                return False
        
        # Make appraisal value optional
        if 'appraisal_value' not in data or data['appraisal_value'] is None:
            data['appraisal_value'] = 0.0
            
        return True
    
    def scrape_month_with_status(self, year: int, month: int, status_code: str) -> int:
        """
        Scrape a single month with a specific status code.
        
        Status codes:
        - PA: Próxima apertura
        - EJ: En ejecución
        - CE: Cerrada
        - SU: Suspendida
        - AN: Anulada
        - FI: Finalizada
        """
        # Date range
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        
        start_str = start_date.strftime('%d/%m/%Y')
        end_str = end_date.strftime('%d/%m/%Y')
        
        # Build URL like historical scraper does
        url = f"{self.SEARCH_URL}?"
        field_index = 0
        
        # Status filter
        url += f"campo[{field_index}]=SUBASTA.ESTADO&dato[{field_index}]={status_code}"
        field_index += 1
        
        # Date range filter (FECHA_FIN)
        url += f"&campo[{field_index}]=SUBASTA.FECHA_FIN&dato[{field_index}]={start_str}"
        field_index += 1
        url += f"&campo[{field_index}]=SUBASTA.FECHA_FIN&operador[{field_index}]=<=&dato[{field_index}]={end_str}"
        
        self.reset_stats()
        page = None
        saved_count = 0
        
        try:
            page = self.browser_manager.get_page(stealth=True)
            
            random_delay(1.0, 3.0)
            page.goto(url, wait_until='networkidle', timeout=30000)
            random_delay(2.0, 4.0)
            
            # Wait for results or no-results message
            page.wait_for_selector('.resultado-busqueda, .sin-resultados', timeout=10000)
            
            if page.locator('.sin-resultados').count() > 0:
                return 0
            
            # Paginate through results
            current_page = 1
            while current_page <= self.max_pages:
                auction_items = page.locator('.resultado-busqueda, .resultado-subasta').all()
                
                if len(auction_items) == 0:
                    break
                
                for item in auction_items:
                    try:
                        # Parse listing (will fetch detail page automatically if BOE_FETCH_DETAIL=1)
                        auction_data = self.parse_listing(item)
                        
                        if auction_data and self.validate_auction_data(auction_data):
                            # Override status based on the status code we're scraping
                            status_map = {
                                'PA': 'PROXIMA_APERTURA',
                                'EJ': 'CELEBRANDOSE',
                                'CE': 'CONCLUIDA_PORTAL',
                                'SU': 'SUSPENDIDA',
                                'AN': 'ANULADA',
                                'FI': 'CONCLUIDA_PORTAL',
                            }
                            auction_data['status'] = status_map.get(status_code, 'CELEBRANDOSE')
                            
                            self.db_adapter.upsert_auction(auction_data)
                            saved_count += 1
                            self.increment_stat('items_saved')
                        else:
                            self.increment_stat('items_skipped')
                    
                    except Exception as e:
                        self.log_error(f"Error processing item: {e}")
                        self.increment_stat('errors')
                
                self.increment_stat('items_found', len(auction_items))
                
                # Next page
                next_button = page.locator('a.siguiente, .pagination a.next')
                if next_button.count() > 0 and current_page < self.max_pages:
                    random_delay(BOE_REQUEST_DELAY_SECONDS, BOE_REQUEST_DELAY_SECONDS + 2)
                    next_button.first.click()
                    page.wait_for_load_state('networkidle', timeout=30000)
                    random_delay(2.0, 4.0)
                    current_page += 1
                else:
                    break
            
            return saved_count
        
        except Exception as e:
            self.log_error(f"Failed to scrape {year}-{month:02d} status {status_code}: {e}")
            return saved_count
        
        finally:
            if page:
                self.browser_manager.close_page(page)
    
    def scrape_month_all_statuses(self, year: int, month: int) -> Dict[str, int]:
        """Scrape a month with all status codes"""
        status_codes = ['PA', 'EJ', 'CE', 'SU', 'AN', 'FI']
        status_names = {
            'PA': 'Próxima apertura',
            'EJ': 'En ejecución',
            'CE': 'Cerrada',
            'SU': 'Suspendida',
            'AN': 'Anulada',
            'FI': 'Finalizada',
        }
        
        results = {}
        for status_code in status_codes:
            status_name = status_names[status_code]
            self.log_info(f"  [{status_code}] {status_name}...")
            
            try:
                count = self.scrape_month_with_status(year, month, status_code)
                results[status_code] = count
                self.log_info(f"    ✓ {count} auctions")
            except Exception as e:
                self.log_error(f"    ✗ Error: {e}")
                results[status_code] = 0
        
        return results
    
    def scrape_complete_range(
        self,
        start_year: int = 2020,
        start_month: int = 2,
        end_year: int = 2026,
        end_month: int = 1,
        resume: bool = True,
    ) -> Dict[str, Any]:
        """Scrape 6 years of complete data month-by-month"""
        
        # Load progress
        progress = self._load_progress() if resume else {
            'completed_months': [],
            'total_auctions': 0,
            'by_status': {},
            'errors': [],
        }
        
        # Build month list
        months_to_scrape = []
        current = datetime(start_year, start_month, 1)
        end = datetime(end_year, end_month, 1)
        
        while current <= end:
            month_key = f"{current.year}-{current.month:02d}"
            if resume and month_key in progress['completed_months']:
                self.log_info(f"Skipping {month_key} (already completed)")
            else:
                months_to_scrape.append((current.year, current.month))
            current += relativedelta(months=1)
        
        total_months = len(months_to_scrape)
        self.log_info(f"=== Starting complete backfill: {total_months} months ===")
        
        for idx, (year, month) in enumerate(months_to_scrape):
            month_key = f"{year}-{month:02d}"
            self.log_info(f"\n[{idx + 1}/{total_months}] Scraping {month_key}")
            
            try:
                status_results = self.scrape_month_all_statuses(year, month)
                month_total = sum(status_results.values())
                
                # Update progress
                progress['completed_months'].append(month_key)
                progress['total_auctions'] += month_total
                
                for status_code, count in status_results.items():
                    if status_code not in progress['by_status']:
                        progress['by_status'][status_code] = 0
                    progress['by_status'][status_code] += count
                
                self._save_progress(progress)
                self.log_info(f"✓ {month_key}: {month_total} total (running total: {progress['total_auctions']:,})")
                
            except Exception as e:
                self.log_error(f"Failed {month_key}: {e}")
                progress['errors'].append({
                    'month': month_key,
                    'error': str(e),
                    'timestamp': datetime.now().isoformat(),
                })
                self._save_progress(progress)
        
        self.log_info("\n" + "=" * 60)
        self.log_info("COMPLETE BACKFILL FINISHED")
        self.log_info(f"Total months: {len(progress['completed_months'])}")
        self.log_info(f"Total auctions: {progress['total_auctions']:,}")
        self.log_info(f"By status: {progress['by_status']}")
        self.log_info("=" * 60)
        
        return progress
    
    def _load_progress(self) -> Dict[str, Any]:
        """Load progress from JSON"""
        if PROGRESS_FILE.exists():
            try:
                with open(PROGRESS_FILE, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load progress: {e}")
        
        return {
            'completed_months': [],
            'total_auctions': 0,
            'by_status': {},
            'errors': [],
        }
    
    def _save_progress(self, progress: Dict[str, Any]):
        """Save progress to JSON"""
        try:
            progress['last_updated'] = datetime.now().isoformat()
            with open(PROGRESS_FILE, 'w') as f:
                json.dump(progress, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save progress: {e}")
