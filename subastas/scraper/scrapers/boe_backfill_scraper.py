"""
BOE Backfill Scraper Module
Fetches ALL auctions from the last 6 years using Playwright form interaction.

Uses the advanced search form at subastas.boe.es/subastas_ava.php with:
- Tipo de subasta: Todos
- Estado de la subasta: Cualquiera
- Tipo de bien subastado: Todos
- Resultados por pagina: 500
- Fecha fin Subasta: month-by-month date ranges

Designed for bulk historical data collection with resume capability.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import json
import re
import logging
import time
from pathlib import Path

from .boe_scraper import BOEScraper, BOE_STATUS_MAP
from ..core.stealth import random_delay
from ..config.settings import SCRAPER_ROOT, BOE_REQUEST_DELAY_SECONDS
from ..database.adapter import get_database_adapter

logger = logging.getLogger(__name__)

# Progress file for resume capability
PROGRESS_FILE = SCRAPER_ROOT / 'backfill_progress.json'


class BOEBackfillScraper(BOEScraper):
    """
    Bulk BOE scraper that fetches all auctions from the last 6 years.
    Uses form-based Playwright interaction to set search parameters
    that are not available via URL query strings (e.g., results per page).
    """

    SEARCH_FORM_URL = "https://subastas.boe.es/subastas_ava.php"

    def __init__(self):
        super().__init__(province=None)
        self.max_pages_per_month = 100  # 500 results/page * 100 = 50,000 max per month
        self.results_per_page = 500

    def get_source_name(self) -> str:
        return "BOE_BACKFILL"

    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """
        Override validation to allow auctions without appraisal values.
        Historical auctions often don't show appraisal on search results.
        """
        required_fields = ['boe_id', 'title', 'category', 'province', 'status']
        
        for field in required_fields:
            if field not in data or data[field] is None:
                self.log_warning(f"Missing required field: {field}")
                return False
        
        # Appraisal value is optional for historical data
        # Set a default if missing
        if 'appraisal_value' not in data or data['appraisal_value'] is None:
            data['appraisal_value'] = 0.0
        
        return True

    def _load_progress(self) -> Dict[str, Any]:
        """Load progress from JSON file"""
        if PROGRESS_FILE.exists():
            try:
                with open(PROGRESS_FILE, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to load progress file: {e}")
        return {'completed_months': [], 'total_auctions': 0, 'errors': []}

    def _save_progress(self, progress: Dict[str, Any]):
        """Save progress to JSON file"""
        try:
            with open(PROGRESS_FILE, 'w') as f:
                json.dump(progress, f, indent=2, default=str)
        except IOError as e:
            logger.error(f"Failed to save progress file: {e}")

    def _fill_search_form(self, page, start_date: datetime, end_date: datetime):
        """
        Fill the BOE advanced search form with the required parameters.

        Sets:
        - Tipo de subasta: Todos
        - Estado de la subasta: Cualquiera
        - Tipo de bien subastado: Todos
        - Resultados por pagina: 500
        - Fecha fin Subasta: start_date to end_date
        """
        # Navigate to the search form
        self.log_info(f"Navigating to search form...")
        random_delay(1.0, 2.0)
        page.goto(self.SEARCH_FORM_URL, wait_until='networkidle', timeout=60000)
        random_delay(2.0, 4.0)

        # --- Select dropdowns ---
        # Tipo de subasta -> "Todos" (first option / default)
        # The form uses <select> elements. We select by visible text or value.
        try:
            # Tipo de subasta - select "Todos"
            tipo_subasta_select = page.locator('select').filter(has_text='Judicial').first
            if tipo_subasta_select.count() > 0:
                tipo_subasta_select.select_option(index=0)  # "Todos" is first option
                self.log_info("Set Tipo de subasta: Todos")
            random_delay(0.3, 0.8)
        except Exception as e:
            self.log_warning(f"Could not set Tipo de subasta: {e}")

        try:
            # Estado de la subasta - select "Cualquiera"
            estado_select = page.locator('select').filter(has_text='Celebrándose').first
            if estado_select.count() > 0:
                estado_select.select_option(index=0)  # "Cualquiera" is first option
                self.log_info("Set Estado de la subasta: Cualquiera")
            random_delay(0.3, 0.8)
        except Exception as e:
            self.log_warning(f"Could not set Estado: {e}")

        try:
            # Tipo de bien subastado - select "Todos"
            tipo_bien_select = page.locator('select').filter(has_text='Inmuebles').first
            if tipo_bien_select.count() > 0:
                tipo_bien_select.select_option(index=0)  # "Todos" is first option
                self.log_info("Set Tipo de bien: Todos")
            random_delay(0.3, 0.8)
        except Exception as e:
            self.log_warning(f"Could not set Tipo de bien: {e}")

        # --- Fill date range (Fecha fin Subasta) ---
        start_str = start_date.strftime('%d-%m-%Y')
        end_str = end_date.strftime('%d-%m-%Y')

        try:
            # The form has two date input groups for "Fecha fin Subasta"
            # They are labeled "de" and "a" (from / to)
            # Look for date inputs near "Fecha fin Subasta" text
            fecha_fin_inputs = page.locator('input[type="text"]').all()

            # Find inputs associated with "Fecha fin Subasta"
            # The BOE form typically has these as the last pair of date inputs
            # We look for inputs near the label text
            date_from_filled = False
            date_to_filled = False

            # Strategy: use the form's fieldset/label structure
            # Try locating by the label "Fecha fin Subasta" nearby
            all_inputs = page.locator('input[type="text"]').all()
            for i, inp in enumerate(all_inputs):
                try:
                    placeholder = inp.get_attribute('placeholder') or ''
                    name = inp.get_attribute('name') or ''
                    title = inp.get_attribute('title') or ''

                    # Check for date-related attributes
                    combined = f"{placeholder} {name} {title}".lower()
                    if 'fecha' in combined and 'fin' in combined:
                        if not date_from_filled:
                            inp.fill('')
                            inp.type(start_str, delay=50)
                            date_from_filled = True
                            self.log_info(f"Set Fecha fin desde: {start_str}")
                        elif not date_to_filled:
                            inp.fill('')
                            inp.type(end_str, delay=50)
                            date_to_filled = True
                            self.log_info(f"Set Fecha fin hasta: {end_str}")
                except Exception:
                    continue

            # Fallback: if we couldn't find by attribute, try by position
            # The BOE form typically has date inputs in a predictable order
            if not date_from_filled or not date_to_filled:
                self.log_info("Using fallback date input strategy...")
                # Try to find date inputs by evaluating the page structure
                page.evaluate("""
                    () => {
                        // Find all labels containing "Fecha fin"
                        const labels = Array.from(document.querySelectorAll('label, span, td'))
                            .filter(el => el.textContent.includes('Fecha fin'));
                        if (labels.length > 0) {
                            const container = labels[0].closest('tr, div, fieldset') || labels[0].parentElement;
                            const inputs = container.querySelectorAll('input[type="text"], input[type="date"], input:not([type])');
                            if (inputs.length >= 2) {
                                inputs[0].setAttribute('data-backfill', 'fecha-fin-desde');
                                inputs[1].setAttribute('data-backfill', 'fecha-fin-hasta');
                            } else if (inputs.length === 1) {
                                inputs[0].setAttribute('data-backfill', 'fecha-fin-desde');
                            }
                        }
                    }
                """)

                if not date_from_filled:
                    desde_input = page.locator('[data-backfill="fecha-fin-desde"]')
                    if desde_input.count() > 0:
                        desde_input.fill('')
                        desde_input.type(start_str, delay=50)
                        date_from_filled = True
                        self.log_info(f"Set Fecha fin desde (fallback): {start_str}")

                if not date_to_filled:
                    hasta_input = page.locator('[data-backfill="fecha-fin-hasta"]')
                    if hasta_input.count() > 0:
                        hasta_input.fill('')
                        hasta_input.type(end_str, delay=50)
                        date_to_filled = True
                        self.log_info(f"Set Fecha fin hasta (fallback): {end_str}")

            if not date_from_filled or not date_to_filled:
                self.log_warning("Could not fill date inputs via attributes or fallback. Trying JS injection...")
                # Last resort: use JavaScript to fill inputs by form structure
                page.evaluate(f"""
                    () => {{
                        const form = document.querySelector('form');
                        if (!form) return;
                        const inputs = form.querySelectorAll('input[type="text"]');
                        // Date inputs are typically among the last text inputs
                        // Look for pairs near "Fecha fin" text
                        for (let i = 0; i < inputs.length; i++) {{
                            const row = inputs[i].closest('tr, div');
                            if (row && row.textContent.includes('Fecha fin') && row.textContent.includes('Subasta')) {{
                                // Found the right row
                                const rowInputs = row.querySelectorAll('input[type="text"]');
                                if (rowInputs.length >= 1 && !rowInputs[0].value) {{
                                    rowInputs[0].value = '{start_str}';
                                    rowInputs[0].dispatchEvent(new Event('change', {{bubbles: true}}));
                                }}
                                if (rowInputs.length >= 2 && !rowInputs[1].value) {{
                                    rowInputs[1].value = '{end_str}';
                                    rowInputs[1].dispatchEvent(new Event('change', {{bubbles: true}}));
                                }}
                                break;
                            }}
                        }}
                    }}
                """)
                self.log_info(f"Set dates via JS injection: {start_str} - {end_str}")

        except Exception as e:
            self.log_error(f"Failed to fill date range: {e}")

        random_delay(0.5, 1.0)

        # --- Set results per page to 500 ---
        try:
            # Look for the results-per-page select
            page_size_select = page.locator('select').filter(has_text='500').first
            if page_size_select.count() > 0:
                page_size_select.select_option(label='500')
                self.log_info("Set Resultados por pagina: 500")
            else:
                # Try by common name patterns
                for selector in ['select[name="page_hits"]', 'select[name="acces"]',
                                 'select[name="registros"]', 'select[name="resultados"]']:
                    select = page.locator(selector)
                    if select.count() > 0:
                        select.select_option(label='500')
                        self.log_info(f"Set results per page via {selector}")
                        break
            random_delay(0.3, 0.8)
        except Exception as e:
            self.log_warning(f"Could not set results per page: {e}")

    def _submit_form(self, page):
        """Submit the search form and wait for results"""
        try:
            # Look for submit button
            submit = page.locator('input[type="submit"], button[type="submit"]').first
            if submit.count() > 0:
                random_delay(0.5, 1.0)
                submit.click()
            else:
                # Try a generic form submit
                page.locator('form').first.evaluate('form => form.submit()')

            # Wait for results or "no results" message
            page.wait_for_load_state('networkidle', timeout=60000)
            random_delay(2.0, 4.0)

            # Wait for results container
            page.wait_for_selector(
                '.resultado-busqueda, .resultado-subasta, .sin-resultados, .no-results',
                timeout=30000
            )

        except Exception as e:
            self.log_error(f"Form submission failed: {e}")
            raise

    def _extract_province_from_listing(self, element) -> str:
        """Extract province from a listing element"""
        try:
            full_text = element.inner_text()
            # Import all provinces
            from ..config.provinces import ALL_PROVINCES
            for province_name in ALL_PROVINCES.keys():
                if province_name.lower() in full_text.lower():
                    return province_name
            return 'Desconocida'
        except Exception:
            return 'Desconocida'

    def scrape_month(self, year: int, month: int) -> List[Dict[str, Any]]:
        """
        Scrape all auctions for a specific month using form interaction.

        Args:
            year: Year (e.g., 2020)
            month: Month 1-12

        Returns:
            List of auction data dictionaries
        """
        # Calculate date range
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1) - timedelta(days=1)

        month_key = f"{year}-{month:02d}"
        self.reset_stats()
        self.log_info(f"=== Backfill scraping {month_key} ({start_date.strftime('%d/%m/%Y')} - {end_date.strftime('%d/%m/%Y')}) ===")

        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)

            # Fill and submit the search form
            self._fill_search_form(page, start_date, end_date)
            self._submit_form(page)

            # Check for no results
            no_results = page.locator('.sin-resultados, .no-results')
            if no_results.count() > 0:
                self.log_info(f"No auctions found for {month_key}")
                return []

            # Try to read total results count from page
            try:
                results_text = page.locator('.resultado-total, .total-resultados, .num-resultados').first.inner_text()
                total_match = re.search(r'(\d[\d.]*)', results_text.replace('.', ''))
                if total_match:
                    total = int(total_match.group(1))
                    self.log_info(f"Total results for {month_key}: {total}")
            except Exception:
                pass

            # Paginate through all results
            current_page = 1
            while current_page <= self.max_pages_per_month:
                self.log_info(f"Scraping page {current_page} of {month_key}")

                # Parse all listings on this page
                auction_items = page.locator('.resultado-busqueda, .resultado-subasta').all()
                page_count = len(auction_items)
                self.log_info(f"Found {page_count} items on page {current_page}")

                if page_count == 0:
                    break

                for item in auction_items:
                    try:
                        # Extract province from the listing text
                        province = self._extract_province_from_listing(item)
                        self.province = province

                        # Use parent parse_listing (status will be parsed from the listing itself)
                        auction_data = self.parse_listing(item, status_override=None)

                        if auction_data:
                            # Ensure province is set
                            if auction_data.get('province') in (None, 'Unknown'):
                                auction_data['province'] = province

                            if self.validate_auction_data(auction_data):
                                self.db_adapter.upsert_auction(auction_data)
                                self.results.append(auction_data)
                                self.increment_stat('items_saved')
                            else:
                                self.increment_stat('items_skipped')
                        else:
                            self.increment_stat('items_skipped')

                    except Exception as e:
                        self.log_error(f"Error processing item: {e}")
                        self.increment_stat('errors')

                self.increment_stat('items_found', page_count)

                # Check for next page
                next_button = page.locator('a.siguiente, .pagination a.next, a:has-text("Siguiente")')
                if next_button.count() > 0 and current_page < self.max_pages_per_month:
                    random_delay(BOE_REQUEST_DELAY_SECONDS, BOE_REQUEST_DELAY_SECONDS + 2)
                    try:
                        next_button.first.click()
                        page.wait_for_load_state('networkidle', timeout=30000)
                        random_delay(2.0, 4.0)
                        current_page += 1
                    except Exception as e:
                        self.log_warning(f"Failed to navigate to next page: {e}")
                        break
                else:
                    break

            self.log_info(
                f"Backfill for {month_key} complete: "
                f"{self.stats['items_found']} found, "
                f"{self.stats['items_saved']} saved, "
                f"{self.stats['items_skipped']} skipped, "
                f"{self.stats['errors']} errors"
            )
            return self.results

        except Exception as e:
            self.log_error(f"Backfill failed for {month_key}: {e}", e)
            return self.results

        finally:
            if page:
                self.browser_manager.close_page(page)

    def scrape_range(
        self,
        start_year: int = 2020,
        start_month: int = 2,
        end_year: int = 2026,
        end_month: int = 1,
        resume: bool = True,
    ) -> Dict[str, int]:
        """
        Scrape all auctions month-by-month for a given date range.

        Args:
            start_year: Start year (default: 2020)
            start_month: Start month (default: 2 = February)
            end_year: End year (default: 2026)
            end_month: End month (default: 1 = January)
            resume: Whether to skip already-completed months

        Returns:
            Dictionary mapping 'YYYY-MM' to auction count per month
        """
        # Load progress
        progress = self._load_progress() if resume else {
            'completed_months': [],
            'total_auctions': 0,
            'errors': [],
        }

        # Build list of months to scrape
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
        self.log_info(f"=== BOE Backfill: {total_months} months to scrape ===")
        self.log_info(f"Range: {start_year}-{start_month:02d} to {end_year}-{end_month:02d}")
        if progress['completed_months']:
            self.log_info(f"Resuming: {len(progress['completed_months'])} months already done")

        results = {}

        for idx, (year, month) in enumerate(months_to_scrape):
            month_key = f"{year}-{month:02d}"
            self.log_info(f"\n--- Month {idx + 1}/{total_months}: {month_key} ---")

            try:
                auctions = self.scrape_month(year, month)
                count = len(auctions)
                results[month_key] = count

                # Update progress
                progress['completed_months'].append(month_key)
                progress['total_auctions'] += count
                self._save_progress(progress)

                self.log_info(f"Completed {month_key}: {count} auctions (running total: {progress['total_auctions']})")

            except Exception as e:
                self.log_error(f"Failed to scrape {month_key}: {e}")
                results[month_key] = 0
                progress['errors'].append({
                    'month': month_key,
                    'error': str(e),
                    'timestamp': datetime.now().isoformat(),
                })
                self._save_progress(progress)

            # Rate limiting between months (skip delay after last month)
            if idx < total_months - 1:
                delay = 60
                self.log_info(f"Waiting {delay}s before next month...")
                time.sleep(delay)

        # Final summary
        total = sum(results.values())
        self.log_info(f"\n{'='*60}")
        self.log_info(f"BOE Backfill Complete!")
        self.log_info(f"Months scraped: {len(results)}")
        self.log_info(f"Auctions this run: {total}")
        self.log_info(f"Total auctions (all runs): {progress['total_auctions']}")
        if progress['errors']:
            self.log_info(f"Errors: {len(progress['errors'])}")
        self.log_info(f"{'='*60}")

        return results


def run_backfill(
    start_year: int = 2020,
    start_month: int = 2,
    end_year: int = 2026,
    end_month: int = 1,
    resume: bool = True,
) -> Dict[str, int]:
    """
    Run the backfill scraper.

    Args:
        start_year: Start year
        start_month: Start month
        end_year: End year
        end_month: End month
        resume: Whether to resume from previous progress

    Returns:
        Dictionary mapping month keys to auction counts
    """
    scraper = BOEBackfillScraper()
    return scraper.scrape_range(
        start_year=start_year,
        start_month=start_month,
        end_year=end_year,
        end_month=end_month,
        resume=resume,
    )
