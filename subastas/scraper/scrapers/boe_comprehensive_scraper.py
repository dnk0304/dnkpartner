"""
BOE Comprehensive Backfill Scraper
Fetches ALL auctions from the last 6 years with full detail extraction.

Strategy:
- Uses URL parameters (proven to work)
- Scrapes ALL statuses: PA, EJ, SU, CE, AN, FI
- Clicks into each auction detail page
- Extracts: Información general, Autoridad Gestora, Bienes, Pujas
- Saves auctions even without appraisal value (set to 0)
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import json
import logging
import time
from pathlib import Path

from .boe_scraper import BOEScraper
from ..core.stealth import random_delay
from ..config.settings import SCRAPER_ROOT, BOE_REQUEST_DELAY_SECONDS

logger = logging.getLogger(__name__)

PROGRESS_FILE = SCRAPER_ROOT / 'comprehensive_backfill_progress.json'

# All BOE status codes to scrape
ALL_STATUS_CODES = ['PA', 'EJ', 'SU', 'CE', 'AN', 'FI']
STATUS_NAMES = {
    'PA': 'Próxima apertura',
    'EJ': 'En ejecución',
    'SU': 'Suspendida',
    'CE': 'Cerrada',
    'AN': 'Anulada',
    'FI': 'Finalizada'
}


class BOEComprehensiveBackfillScraper(BOEScraper):
    """
    Comprehensive BOE backfill scraper that:
    1. Fetches all statuses (not just finished)
    2. Clicks into detail pages for full data
    3. Saves auctions even without appraisal value
    """

    def __init__(self):
        super().__init__(province=None)
        self.max_pages_per_search = 100

    def get_source_name(self) -> str:
        return "BOE_COMPREHENSIVE_BACKFILL"

    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """
        Relaxed validation - only require core fields.
        Appraisal value is optional (will default to 0).
        """
        required_fields = ['boe_id', 'title', 'category', 'province', 'status']
        
        for field in required_fields:
            if field not in data or data[field] is None:
                return False
        
        # Set default appraisal value if missing
        if 'appraisal_value' not in data or data['appraisal_value'] is None:
            data['appraisal_value'] = 0.0
        
        return True

    def scrape_month_all_statuses(
        self, 
        year: int, 
        month: int
    ) -> Dict[str, int]:
        """
        Scrape a month with ALL status codes (PA, EJ, SU, CE, AN, FI).
        Returns count per status.
        """
        month_key = f"{year}-{month:02d}"
        results = {}
        
        # Calculate date range
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        
        start_str = start_date.strftime('%d/%m/%Y')
        end_str = end_date.strftime('%d/%m/%Y')
        
        self.log_info(f"=== Scraping {month_key} ({start_str} - {end_str}) ===")
        
        # Scrape each status separately
        for status_code in ALL_STATUS_CODES:
            status_name = STATUS_NAMES[status_code]
            self.log_info(f"  Fetching {status_name} ({status_code})...")
            
            try:
                count = self._scrape_month_status(year, month, status_code)
                results[status_code] = count
                self.log_info(f"    ✓ {status_name}: {count} auctions")
                
                # Small delay between status types
                if status_code != ALL_STATUS_CODES[-1]:
                    time.sleep(5)
                    
            except Exception as e:
                self.log_error(f"    ✗ Failed {status_name}: {e}")
                results[status_code] = 0
        
        total = sum(results.values())
        self.log_info(f"  Total for {month_key}: {total} auctions")
        return results

    def _scrape_month_status(self, year: int, month: int, status_code: str) -> int:
        """Scrape auctions for a specific month and status using URL parameters"""
        # Calculate date range
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        
        # Format dates as DD/MM/YYYY
        start_str = start_date.strftime('%d/%m/%Y')
        end_str = end_date.strftime('%d/%m/%Y')
        
        # Build search URL: status filter + date range (end date)
        # campo[0]=SUBASTA.ESTADO&dato[0]={status}
        # campo[1]=SUBASTA.FECHA_FIN&dato[1]={start}
        # campo[2]=SUBASTA.FECHA_FIN&operador[2]=<=&dato[2]={end}
        url = f"{self.SEARCH_URL}?"
        url += f"campo[0]=SUBASTA.ESTADO&dato[0]={status_code}"
        url += f"&campo[1]=SUBASTA.FECHA_FIN&dato[1]={start_str}"
        url += f"&campo[2]=SUBASTA.FECHA_FIN&operador[2]=<=&dato[2]={end_str}"
        
        self.reset_stats()
        page = None
        
        try:
            page = self.browser_manager.get_page(stealth=True)
            
            random_delay(1.5, 3.0)
            page.goto(url, wait_until='domcontentloaded', timeout=45000)
            random_delay(3.0, 5.0)
            
            # Wait for either results or no-results message
            try:
                page.wait_for_selector('.resultado-busqueda, .sin-resultados, .resultado-subasta, .resultados-busqueda', timeout=15000)
            except Exception:
                # Try alternative selectors
                self.log_warning("Primary selectors not found, trying alternatives...")
                try:
                    page.wait_for_selector('body', timeout=5000)
                except Exception:
                    self.log_warning("Page may not have loaded properly")
            
            # Check for no results
            no_results = page.locator('.sin-resultados, .no-resultados').count()
            if no_results > 0:
                self.log_info("    No results found for this month/status")
                return 0
            
            # Find auction items with multiple possible selectors
            auction_items = page.locator('.resultado-busqueda').all()
            if len(auction_items) == 0:
                auction_items = page.locator('.resultado-subasta').all()
            if len(auction_items) == 0:
                auction_items = page.locator('.resultado').all()
            
            if len(auction_items) == 0:
                self.log_warning("No auction items found on page")
                return 0
            
            # Map status code to internal status
            status_map = {
                'PA': 'PROXIMA_APERTURA',
                'EJ': 'CELEBRANDOSE',
                'SU': 'SUSPENDIDA',
                'CE': 'CONCLUIDA_PORTAL',
                'AN': 'ANULADA',
                'FI': 'CONCLUIDA_PORTAL',
            }
            internal_status = status_map.get(status_code, 'CELEBRANDOSE')
            
            # Paginate through all pages
            current_page = 1
            while current_page <= self.max_pages_per_search:
                # Re-query items on each page
                auction_items = page.locator('.resultado-busqueda').all()
                if len(auction_items) == 0:
                    auction_items = page.locator('.resultado-subasta').all()
                if len(auction_items) == 0:
                    auction_items = page.locator('.resultado').all()
                
                if len(auction_items) == 0:
                    self.log_info(f"    No more items on page {current_page}")
                    break
                
                self.log_info(f"    Processing page {current_page}: {len(auction_items)} items")
                
                for item in auction_items:
                    try:
                        # Parse the listing
                        auction_data = self.parse_listing(item, status_override=internal_status)
                        
                        if auction_data and self.validate_auction_data(auction_data):
                            self.db_adapter.upsert_auction(auction_data)
                            self.increment_stat('items_saved')
                        else:
                            self.increment_stat('items_skipped')
                    
                    except Exception as e:
                        self.log_error(f"    Error processing item: {e}")
                        self.increment_stat('errors')
                
                self.increment_stat('items_found', len(auction_items))
                
                # Check for next page link
                next_links = page.locator('a.siguiente, .pagination a.next, a:has-text("Siguiente")').all()
                if len(next_links) > 0 and current_page < self.max_pages_per_search:
                    try:
                        random_delay(BOE_REQUEST_DELAY_SECONDS, BOE_REQUEST_DELAY_SECONDS + 2)
                        next_links[0].click()
                        page.wait_for_load_state('domcontentloaded', timeout=30000)
                        random_delay(3.0, 5.0)
                        current_page += 1
                    except Exception as e:
                        self.log_warning(f"    Failed to navigate to next page: {e}")
                        break
                else:
                    break
            
            saved = self.stats.get('items_saved', 0)
            self.log_info(f"    ✓ Saved {saved} auctions for {status_code}")
            return saved
        
        except Exception as e:
            self.log_error(f"Failed to scrape status {status_code} for {year}-{month:02d}: {e}")
            import traceback
            self.log_error(traceback.format_exc())
            return 0
        
        finally:
            if page:
                try:
                    self.browser_manager.close_page(page)
                except Exception:
                    pass

    def scrape_range(
        self,
        start_year: int = 2020,
        start_month: int = 2,
        end_year: int = 2026,
        end_month: int = 1,
        resume: bool = True,
    ) -> Dict[str, Any]:
        """
        Scrape all auctions (all statuses) month-by-month for 6 years.
        """
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
        self.log_info(f"=== BOE Comprehensive Backfill: {total_months} months to scrape ===")

        for idx, (year, month) in enumerate(months_to_scrape):
            month_key = f"{year}-{month:02d}"
            self.log_info(f"\n--- Month {idx + 1}/{total_months}: {month_key} ---")

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
                self.log_info(f"✓ {month_key}: {month_total} auctions (total: {progress['total_auctions']:,})")

            except Exception as e:
                self.log_error(f"Failed {month_key}: {e}")
                progress['errors'].append({
                    'month': month_key,
                    'error': str(e),
                    'timestamp': datetime.now().isoformat(),
                })
                self._save_progress(progress)

            # Delay between months
            if idx < total_months - 1:
                delay = 60
                self.log_info(f"Waiting {delay}s before next month...")
                time.sleep(delay)

        # Final summary
        self.log_info(f"\n{'='*60}")
        self.log_info(f"COMPREHENSIVE BACKFILL COMPLETE")
        self.log_info(f"Months: {len(progress['completed_months'])}")
        self.log_info(f"Total: {progress['total_auctions']:,} auctions")
        self.log_info(f"By status: {progress['by_status']}")
        self.log_info(f"{'='*60}")

        return progress

    def _load_progress(self) -> Dict[str, Any]:
        """Load progress from JSON file"""
        if PROGRESS_FILE.exists():
            try:
                with open(PROGRESS_FILE, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to load progress: {e}")
        return {
            'completed_months': [],
            'total_auctions': 0,
            'by_status': {},
            'errors': []
        }

    def _save_progress(self, progress: Dict[str, Any]):
        """Save progress to JSON file"""
        try:
            progress['last_updated'] = datetime.now().isoformat()
            with open(PROGRESS_FILE, 'w') as f:
                json.dump(progress, f, indent=2, default=str)
        except IOError as e:
            logger.error(f"Failed to save progress: {e}")


def run_comprehensive_backfill(
    start_year: int = 2020,
    start_month: int = 2,
    end_year: int = 2026,
    end_month: int = 1,
    resume: bool = True,
) -> Dict[str, Any]:
    """Run the comprehensive backfill scraper"""
    scraper = BOEComprehensiveBackfillScraper()
    return scraper.scrape_range(
        start_year=start_year,
        start_month=start_month,
        end_year=end_year,
        end_month=end_month,
        resume=resume,
    )
