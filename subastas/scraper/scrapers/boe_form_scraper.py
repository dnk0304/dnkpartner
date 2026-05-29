"""
BOE Form-Based Complete Backfill Scraper
Uses Playwright to properly submit the search form with POST data.

This is the correct approach - BOE uses POST form submission, not GET URL parameters.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import json
import logging
from pathlib import Path
import time

from .boe_scraper import BOEScraper
from ..core.stealth import random_delay
from ..config.settings import SCRAPER_ROOT, BOE_REQUEST_DELAY_SECONDS

logger = logging.getLogger(__name__)

PROGRESS_FILE = SCRAPER_ROOT / 'form_backfill_progress.json'


class BOEFormBackfillScraper(BOEScraper):
    """
    Form-based BOE scraper that submits search criteria via form POST.
    This properly mimics how the website actually works.
    """
    
    def __init__(self):
        super().__init__(province=None)
        self.max_pages = 100
        # Spanish provinces for iteration
        self.provinces = [
            'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga',
            'Murcia', 'Palma', 'Las Palmas', 'Bilbao', 'Alicante', 'Córdoba',
            'Valladolid', 'Vigo', 'Gijón', 'L\'Hospitalet', 'Granada', 'A Coruña',
            'Vitoria', 'Elche', 'Oviedo', 'Santa Cruz de Tenerife', 'Badalona',
            'Cartagena', 'Terrassa', 'Jerez de la Frontera', 'Sabadell', 'Móstoles',
            'Alcalá de Henares', 'Pamplona', 'Fuenlabrada', 'Almería', 'Leganés',
            'San Sebastián', 'Santander', 'Castellón de la Plana', 'Burgos',
            'Albacete', 'Getafe', 'Salamanca', 'Huelva', 'Logroño', 'Badajoz',
            'Tarragona', 'León', 'Lleida', 'Cádiz', 'Marbella', 'Mataró',
            'Dos Hermanas', 'Santa Coloma de Gramenet', 'Torrejón de Ardoz'
        ]
    
    def get_source_name(self) -> str:
        return "BOE_FORM_BACKFILL"
    
    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """Relaxed validation - appraisal value optional"""
        required_fields = ['boe_id', 'title', 'category', 'province', 'status']
        
        for field in required_fields:
            if field not in data or data[field] is None:
                return False
        
        if 'appraisal_value' not in data or data['appraisal_value'] is None:
            data['appraisal_value'] = 0.0
            
        return True
    
    def submit_search_form(
        self,
        page: Any,
        start_date: str,
        end_date: str,
        tipo_subasta: str = "Todos",
        estado: str = "Cualquiera",
        tipo_bien: str = "Todos",
        resultados_pagina: str = "500"
    ):
        """
        Submit the BOE advanced search form using Playwright.
        
        Args:
            page: Playwright page object
            start_date: Start date in YYYY-MM-DD format (for type="date" inputs)
            end_date: End date in YYYY-MM-DD format (for type="date" inputs)
            tipo_subasta: "Todos", "Judicial", etc.
            estado: "Cualquiera", "Celebrándose", etc.
            tipo_bien: "Todos", "Inmuebles", "Vehículos", etc.
            resultados_pagina: "50", "100", "200", "500"
        """
        self.log_info(f"Submitting search form: {start_date} to {end_date}")
        
        try:
            # Navigate to search page
            page.goto("https://subastas.boe.es/subastas_ava.php", wait_until='domcontentloaded', timeout=30000)
            random_delay(2, 3)
            
            # Wait for form to be ready
            page.wait_for_selector('#desdeFP', timeout=10000)
            
            # Fill date fields using correct field IDs
            page.fill('#desdeFP', start_date)
            random_delay(0.5, 1)
            page.fill('#hastaFP', end_date)
            random_delay(0.5, 1)
            
            # Set results per page
            page.select_option('#mostrar', resultados_pagina)
            random_delay(0.5, 1)
            
            # Note: Tipo subasta, Estado, and Tipo bien are already set to defaults
            # "Todos" and "Cualquiera" are the default selections
            
            # Submit form
            submit_button = page.locator('input[type="submit"][value="Buscar"]').first
            submit_button.click()
            
            # Wait for results to load
            random_delay(3, 5)
            page.wait_for_load_state('domcontentloaded', timeout=30000)
            random_delay(2, 3)
            
            self.log_info("Form submitted successfully")
            
        except Exception as e:
            self.log_error(f"Failed to submit search form: {e}")
            raise
    
    def scrape_month_with_form(self, year: int, month: int) -> int:
        """
        Scrape a single month by submitting the search form.
        Due to BOE limits, break into weekly chunks to avoid "too many results" error.
        """
        # Date range for the month
        month_start = datetime(year, month, 1)
        if month == 12:
            month_end = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = datetime(year, month + 1, 1) - timedelta(days=1)
        
        self.log_info(f"Scraping {year}-{month:02d} in weekly chunks to avoid BOE limits...")
        
        total_saved = 0
        
        # Break month into weekly chunks
        current_date = month_start
        week_num = 1
        
        while current_date <= month_end:
            # Calculate week end (7 days later or end of month)
            week_end = min(current_date + timedelta(days=6), month_end)
            
            start_str = current_date.strftime('%Y-%m-%d')
            end_str = week_end.strftime('%Y-%m-%d')
            
            self.log_info(f"  Week {week_num}: {start_str} to {end_str}")
            
            try:
                count = self._scrape_date_range(start_str, end_str, year, month)
                total_saved += count
                self.log_info(f"    Saved {count} auctions for week {week_num}")
            except Exception as e:
                self.log_error(f"    Failed week {week_num}: {e}")
            
            # Move to next week
            current_date = week_end + timedelta(days=1)
            week_num += 1
            
            # Small delay between weeks
            if current_date <= month_end:
                random_delay(10, 15)
        
        self.log_info(f"Total saved for {year}-{month:02d}: {total_saved} auctions")
        return total_saved
    
    def _scrape_date_range(self, start_str: str, end_str: str, year: int, month: int) -> int:
        """Scrape a specific date range (used for weekly chunks)"""
        self.reset_stats()
        page = None
        saved_count = 0
        
        try:
            page = self.browser_manager.get_page(stealth=True)
            
            # Submit the search form
            self.submit_search_form(page, start_str, end_str)
            
            # Check for results or no-results message
            try:
                page.wait_for_selector('.resultado-busqueda, .sin-resultados, .resultados-busqueda, .error', timeout=15000)
            except Exception:
                self.log_warning("Could not find results container, checking page content...")
            
            # Check for error message (too many results)
            error_msg = page.locator('.caja.gris.error').all()
            if len(error_msg) > 0:
                self.log_warning(f"BOE returned error: too many results for {start_str} to {end_str}")
                return 0
            
            # Check for no results
            if page.locator('.sin-resultados').count() > 0:
                return 0
            
            # Paginate through results
            current_page = 1
            while current_page <= self.max_pages:
                # Find auction items
                auction_items = page.locator('.resultado-busqueda').all()
                if len(auction_items) == 0:
                    auction_items = page.locator('.resultado-subasta').all()
                if len(auction_items) == 0:
                    auction_items = page.locator('.resultado').all()
                
                if len(auction_items) == 0:
                    self.log_info(f"No items found on page {current_page}")
                    break
                
                self.log_info(f"Page {current_page}: Processing {len(auction_items)} items")
                
                for item in auction_items:
                    try:
                        # Parse listing (will fetch detail page if BOE_FETCH_DETAIL=1)
                        auction_data = self.parse_listing(item)
                        
                        if auction_data and self.validate_auction_data(auction_data):
                            self.db_adapter.upsert_auction(auction_data)
                            saved_count += 1
                            self.increment_stat('items_saved')
                        else:
                            self.increment_stat('items_skipped')
                    
                    except Exception as e:
                        self.log_error(f"Error processing item: {e}")
                        self.increment_stat('errors')
                
                self.increment_stat('items_found', len(auction_items))
                
                # Check for next page - try multiple selectors
                self.log_info(f"Looking for next page link...")
                
                # Try various selectors for pagination
                next_links = page.locator('a:has-text("Siguiente")').all()
                if len(next_links) == 0:
                    next_links = page.locator('a.siguiente').all()
                if len(next_links) == 0:
                    next_links = page.locator('.pagination a:has-text("›")').all()
                if len(next_links) == 0:
                    next_links = page.locator('.pagination a:has-text(">")').all()
                if len(next_links) == 0:
                    next_links = page.locator('a[title*="iguiente"]').all()
                if len(next_links) == 0:
                    # Try finding any link with page number higher than current
                    next_links = page.locator(f'a:has-text("{current_page + 1}")').all()
                
                if len(next_links) > 0 and current_page < self.max_pages:
                    try:
                        self.log_info(f"Found next page link, clicking... (page {current_page} -> {current_page + 1})")
                        random_delay(BOE_REQUEST_DELAY_SECONDS, BOE_REQUEST_DELAY_SECONDS + 2)
                        next_links[0].click()
                        page.wait_for_load_state('domcontentloaded', timeout=30000)
                        random_delay(2, 4)
                        current_page += 1
                    except Exception as e:
                        self.log_warning(f"Could not navigate to next page: {e}")
                        break
                else:
                    self.log_info(f"No more pages found. Total pages processed: {current_page}")
                    break
            
            return saved_count
        
        except Exception as e:
            self.log_error(f"Failed to scrape date range {start_str} to {end_str}: {e}")
            import traceback
            self.log_error(traceback.format_exc())
            return saved_count
        
        finally:
            if page:
                try:
                    self.browser_manager.close_page(page)
                except Exception:
                    pass
    
    def scrape_form_range(
        self,
        start_year: int = 2020,
        start_month: int = 2,
        end_year: int = 2026,
        end_month: int = 1,
        resume: bool = True,
    ) -> Dict[str, Any]:
        """Scrape 6 years using form submission month-by-month"""
        
        # Load progress
        progress = self._load_progress() if resume else {
            'completed_months': [],
            'total_auctions': 0,
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
        self.log_info(f"=== Form-based backfill: {total_months} months to scrape ===")
        
        for idx, (year, month) in enumerate(months_to_scrape):
            month_key = f"{year}-{month:02d}"
            self.log_info(f"\n[{idx + 1}/{total_months}] Scraping {month_key}")
            
            try:
                count = self.scrape_month_with_form(year, month)
                
                # Update progress
                progress['completed_months'].append(month_key)
                progress['total_auctions'] += count
                
                self._save_progress(progress)
                self.log_info(f"✓ {month_key}: {count} auctions (total: {progress['total_auctions']:,})")
                
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
                delay = 30
                self.log_info(f"Waiting {delay}s before next month...")
                time.sleep(delay)
        
        self.log_info("\n" + "=" * 60)
        self.log_info("FORM-BASED BACKFILL COMPLETE")
        self.log_info(f"Months: {len(progress['completed_months'])}")
        self.log_info(f"Total: {progress['total_auctions']:,} auctions")
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
