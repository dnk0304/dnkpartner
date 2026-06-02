"""
BOE Parallel Scraper - 15-Day Batch Strategy
Splits scraping into 3 parallel workers for different year ranges
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import json
import logging
from pathlib import Path
import sys

import os
from .boe_scraper import BOEScraper
from ..core.stealth import random_delay
from ..config.settings import SCRAPER_ROOT, BOE_REQUEST_DELAY_SECONDS

logger = logging.getLogger(__name__)


class BOEParallelScraper(BOEScraper):
    """
    Parallel BOE scraper that works in 15-day batches.
    Designed to run 3 instances simultaneously for different year ranges.
    """
    
    def __init__(self, scraper_id: int = 1):
        super().__init__(province=None)
        self.scraper_id = scraper_id
        self.max_pages = 100
        self.progress_file = SCRAPER_ROOT / f'parallel_backfill_{scraper_id}_progress.json'
        # Force separate browser instance per scraper
        self._own_browser = None
    
    def _get_own_browser(self):
        """Get dedicated browser instance for this scraper"""
        if self._own_browser is None:
            from playwright.sync_api import sync_playwright
            self._playwright = sync_playwright().start()
            headless_mode = os.environ.get('HEADLESS', 'true').lower() != 'false'
            self._own_browser = self._playwright.chromium.launch(
                headless=headless_mode,  # True on server (HEADLESS env var)
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                ]
            )
            self.log_info(f"[Scraper {self.scraper_id}] Launched dedicated browser")
        return self._own_browser
    
    def _get_own_page(self):
        """Get new page from dedicated browser"""
        browser = self._get_own_browser()
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = context.new_page()
        
        # Inject stealth scripts
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            window.chrome = {runtime: {}};
        """)
        
        return page
    
    def _close_own_browser(self):
        """Close dedicated browser"""
        if self._own_browser:
            try:
                self._own_browser.close()
                self._playwright.stop()
                self.log_info(f"[Scraper {self.scraper_id}] Closed browser")
            except:
                pass
    
    def get_source_name(self) -> str:
        return f"BOE_PARALLEL_{self.scraper_id}"

    def _navigate_and_extract(self, boe_id, detail_url):
        """
        Own-browser navigate + extract (overrides the shared-browser path).

        BUG FIX (2026-06-01, verified on SUB-NN-2026-1626077): the inherited
        BOEScraper path opens the detail page on the SHARED browser_manager. But
        this class drives its OWN sync-Playwright browser (_get_own_page);
        opening a second Playwright instance from the same thread raises "using
        Playwright Sync API inside the asyncio loop", so the detail fetch failed
        for EVERY row and appraisal/minBid/deposit/title came back NULL even when
        BOE published them. This affected the judicial daily update too (this
        class is its scraper). Navigate with our own page and reuse the shared
        _extract_detail_from_page so financial fields populate.

        #14: this single override now also serves the multi-lot split path —
        _build_lote_record calls _navigate_and_extract with each lote URL, so
        the lote pages are fetched on the SAME own-browser, no extra override.
        """
        page = None
        try:
            page = self._get_own_page()
            random_delay(1.0, 2.0)
            page.goto(detail_url, wait_until='domcontentloaded', timeout=30000)
            random_delay(1.0, 2.0)
            # Same tab activations as the shared-browser path (this override
            # otherwise skipped them): general-info loads the AJAX date/status
            # panel (endsAt), bienes restores the "Datos del bien subastado"
            # block (Dirección -> address pin). Both best-effort / null-safe.
            self._activate_general_info_tab(page)
            self._activate_bienes_tab(page)
            info = self._extract_detail_from_page(page, boe_id, detail_url)
            info['lote_numbers'] = self._enumerate_lote_numbers(page)
            # #16 pujas LAST (own-browser path): same page -> ver=5, after the
            # ver=3 DOM read + lote enumeration.
            self._attach_pujas(page, boe_id, detail_url, info)
            return info
        except Exception as e:
            self.log_warning(f"Failed to fetch detail info for {boe_id}: {e}")
            return self._empty_detail_info(boe_id)
        finally:
            if page is not None:
                try:
                    page.context.close()
                except Exception:
                    try:
                        page.close()
                    except Exception:
                        pass

    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """Relaxed validation - appraisal value optional.

        ROOT-CAUSE FIX: previously coerced a missing appraisal_value to 0.0,
        which is the source of the `appraisalValue = 0` garbage in production.
        We no longer fabricate a 0. The detail-page parser populates the real
        Tasación; when it is genuinely absent the value stays None (honest NULL).
        The `appraisalValue` column must be nullable for this — see schema note.
        """
        required_fields = ['boe_id', 'title', 'category', 'province', 'status']

        for field in required_fields:
            if field not in data or data[field] is None:
                return False

        return True
    
    def scrape_date_range(
        self,
        start_year: int,
        start_month: int,
        start_day: int,
        end_year: int,
        end_month: int,
        end_day: int,
        resume: bool = True
    ) -> Dict[str, Any]:
        """
        Scrape a date range in 15-day batches.
        
        Args:
            start_year, start_month, start_day: Start date
            end_year, end_month, end_day: End date
            resume: Whether to resume from previous progress
        """
        # Load progress
        progress = self._load_progress() if resume else {
            'scraper_id': self.scraper_id,
            'completed_batches': [],
            'total_auctions': 0,
            'total_batches': 0,
            'batches_found': {},  # batch_key -> results_found
            'batches_fetched': {}, # batch_key -> auctions_fetched
            'errors': [],
        }
        
        # Generate 15-day batches
        batches = self._generate_15day_batches(
            datetime(start_year, start_month, start_day),
            datetime(end_year, end_month, end_day)
        )
        
        total_batches = len(batches)
        progress['total_batches'] = total_batches
        
        self.log_info(f"[Scraper {self.scraper_id}] Starting: {total_batches} batches (15-day chunks)")
        self.log_info(f"[Scraper {self.scraper_id}] Range: {start_year}-{start_month:02d}-{start_day:02d} to {end_year}-{end_month:02d}-{end_day:02d}")
        
        for idx, (batch_start, batch_end) in enumerate(batches):
            batch_key = f"{batch_start.strftime('%Y-%m-%d')}_to_{batch_end.strftime('%Y-%m-%d')}"
            
            if resume and batch_key in progress['completed_batches']:
                self.log_info(f"[Scraper {self.scraper_id}] Skipping {batch_key} (completed)")
                continue
            
            self.log_info(f"\n[Scraper {self.scraper_id}] Batch {idx + 1}/{total_batches}: {batch_key}")
            
            try:
                results_found, auctions_fetched = self._scrape_batch(batch_start, batch_end)
                
                # Update progress
                progress['completed_batches'].append(batch_key)
                progress['total_auctions'] += auctions_fetched
                progress['batches_found'][batch_key] = results_found
                progress['batches_fetched'][batch_key] = auctions_fetched
                
                self._save_progress(progress)
                
                self.log_info(f"[Scraper {self.scraper_id}] ✓ Batch complete: Found {results_found}, Fetched {auctions_fetched}")
                
            except Exception as e:
                self.log_error(f"[Scraper {self.scraper_id}] Failed batch {batch_key}: {e}")
                progress['errors'].append({
                    'batch': batch_key,
                    'error': str(e),
                    'timestamp': datetime.now().isoformat(),
                })
                self._save_progress(progress)
            
            # Delay between batches
            if idx < total_batches - 1:
                random_delay(15, 20)
        
        self.log_info(f"\n[Scraper {self.scraper_id}] COMPLETE: {progress['total_auctions']:,} auctions")
        
        # Cleanup browser
        self._close_own_browser()
        
        return progress
    
    def _generate_15day_batches(self, start_date: datetime, end_date: datetime) -> List[tuple]:
        """Generate list of 15-day batch tuples"""
        batches = []
        current = start_date
        
        while current <= end_date:
            batch_end = min(current + timedelta(days=14), end_date)
            batches.append((current, batch_end))
            current = batch_end + timedelta(days=1)
        
        return batches
    
    def _scrape_batch(self, start_date: datetime, end_date: datetime) -> tuple:
        """
        Scrape a single 15-day batch with human-like behavior.
        Returns: (total_results_found, auctions_actually_fetched)
        """
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        self.reset_stats()
        page = None
        saved_count = 0
        total_found = 0
        
        try:
            # Use dedicated browser for this scraper
            page = self._get_own_page()
            
            # Human-like: Random initial delay
            random_delay(1, 3)
            
            # Submit search form with human-like clicking
            self._submit_search_form_human(page, start_str, end_str)
            
            # Human-like: Wait for results to load
            random_delay(2, 4)
            
            # Check for results
            try:
                page.wait_for_selector('.resultado-busqueda, .sin-resultados, .error', timeout=15000)
            except Exception:
                self.log_warning("Could not find results container")
            
            # Check for error
            if page.locator('.caja.gris.error').count() > 0:
                self.log_warning("BOE returned 'too many results' error")
                return (0, 0)
            
            # Check for no results
            if page.locator('.sin-resultados').count() > 0:
                return (0, 0)
            
            # Paginate through all pages
            current_page = 1
            while current_page <= self.max_pages:
                # Find auction items
                auction_items = page.locator('.resultado-busqueda').all()
                if len(auction_items) == 0:
                    auction_items = page.locator('.resultado-subasta').all()
                if len(auction_items) == 0:
                    auction_items = page.locator('.resultado').all()
                
                if len(auction_items) == 0:
                    break
                
                total_found += len(auction_items)
                self.log_info(f"  Page {current_page}: {len(auction_items)} items")
                
                for idx, item in enumerate(auction_items):
                    try:
                        # Human-like: Small delay between items
                        if idx > 0 and idx % 10 == 0:
                            random_delay(1, 2)
                        
                        auction_data = self.parse_listing(item)

                        if auction_data and auction_data.get('_split_lotes'):
                            # #14: declared-split auction -> N independent lote
                            # rows instead of the umbrella row.
                            saved_count += self._upsert_split_lotes(
                                auction_data['_split_lotes']
                            )
                        elif auction_data and self.validate_auction_data(auction_data):
                            self.db_adapter.upsert_auction(auction_data)
                            saved_count += 1
                    
                    except Exception as e:
                        self.log_error(f"  Error processing item: {e}")
                
                # Human-like: Scroll before clicking next
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                random_delay(1, 2)
                
                # Check for next page
                next_links = page.locator('a:has-text("Siguiente")').all()
                if len(next_links) == 0:
                    next_links = page.locator('a.siguiente').all()
                if len(next_links) == 0:
                    next_links = page.locator(f'a:has-text("{current_page + 1}")').all()
                
                if len(next_links) > 0 and current_page < self.max_pages:
                    try:
                        # Human-like: Hover before clicking
                        next_links[0].hover()
                        random_delay(0.5, 1)
                        next_links[0].click()
                        
                        # Human-like: Wait for navigation
                        random_delay(BOE_REQUEST_DELAY_SECONDS + 1, BOE_REQUEST_DELAY_SECONDS + 3)
                        page.wait_for_load_state('domcontentloaded', timeout=30000)
                        random_delay(2, 4)
                        current_page += 1
                    except Exception as e:
                        self.log_warning(f"  Could not navigate to next page: {e}")
                        break
                else:
                    break
            
            return (total_found, saved_count)
        
        except Exception as e:
            self.log_error(f"Failed to scrape batch: {e}")
            import traceback
            self.log_error(traceback.format_exc())
            return (total_found, saved_count)
        
        finally:
            if page:
                try:
                    page.close()
                except Exception:
                    pass
    
    def _submit_search_form_human(self, page: Any, start_date: str, end_date: str):
        """Submit BOE search form with human-like clicking behavior"""
        try:
            self.log_info(f"  Navigating to BOE search page...")
            page.goto("https://subastas.boe.es/subastas_ava.php", wait_until='domcontentloaded', timeout=30000)
            random_delay(2, 3)
            
            # Human-like: Wait for page to be interactive
            page.wait_for_selector('#desdeFP', timeout=10000)
            random_delay(1, 2)
            
            # Human-like: Click into first field, then type
            self.log_info(f"  Filling dates: {start_date} to {end_date}")
            page.click('#desdeFP')
            random_delay(0.3, 0.7)
            page.fill('#desdeFP', start_date)
            random_delay(0.5, 1)
            
            # Human-like: Click into second field
            page.click('#hastaFP')
            random_delay(0.3, 0.7)
            page.fill('#hastaFP', end_date)
            random_delay(0.5, 1)
            
            # Human-like: Scroll to results dropdown
            page.evaluate("window.scrollTo(0, 400)")
            random_delay(0.5, 1)
            
            # Human-like: Click dropdown, then select
            self.log_info(f"  Setting 500 results per page...")
            page.click('#mostrar')
            random_delay(0.3, 0.7)
            page.select_option('#mostrar', '500')
            random_delay(0.5, 1)
            
            # Human-like: Scroll to submit button
            page.evaluate("window.scrollTo(0, 600)")
            random_delay(0.5, 1)
            
            # Human-like: Hover over submit button, then click
            self.log_info(f"  Submitting search...")
            submit_button = page.locator('input[type="submit"][value="Buscar"]').first
            submit_button.hover()
            random_delay(0.5, 1)
            submit_button.click()
            
            # Human-like: Wait for form submission and page load
            random_delay(3, 5)
            page.wait_for_load_state('domcontentloaded', timeout=30000)
            random_delay(2, 3)
            
            self.log_info(f"  Search submitted successfully")
            
        except Exception as e:
            self.log_error(f"Failed to submit search form: {e}")
            raise
    
    def _load_progress(self) -> Dict[str, Any]:
        """Load progress from JSON"""
        if self.progress_file.exists():
            try:
                with open(self.progress_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load progress: {e}")
        
        return {
            'scraper_id': self.scraper_id,
            'completed_batches': [],
            'total_auctions': 0,
            'total_batches': 0,
            'batches_found': {},
            'batches_fetched': {},
            'errors': [],
        }
    
    def _save_progress(self, progress: Dict[str, Any]):
        """Save progress to JSON"""
        try:
            progress['last_updated'] = datetime.now().isoformat()
            with open(self.progress_file, 'w') as f:
                json.dump(progress, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save progress: {e}")
