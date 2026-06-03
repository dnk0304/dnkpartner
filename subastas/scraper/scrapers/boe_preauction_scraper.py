"""
BOE pre-auction discovery scraper (SUBASTA.ESTADO = PA, "Próxima apertura").

WHY THIS EXISTS
---------------
Every Spanish judicial auction sits in BOE state "Próxima apertura" (PA) for
~20 days BEFORE bidding opens. The daily ingestion path
(BOEParallelScraper.scrape_date_range + the per-category scrapers) queries only
a celebration/finalización DATE window (#desdeFP / #hastaFP) and never sets
SUBASTA.ESTADO. PA auctions have a FUTURE apertura and no closing date in that
window, so they are structurally invisible to the daily path — the site's
"Próximas" filter returns 0. The DB column `opensAt`, the `PROXIMA_APERTURA`
status, the `proximas` API filter and scheduler.promote_pending_auctions()
(PROXIMA_APERTURA -> CELEBRANDOSE when opensAt <= now) all already exist and are
idle. This scraper is the missing producer that fills the bucket.

HOW IT WORKS
------------
A dedicated discovery pass that queries the PA STATE directly (not a date
window) via a GET search URL: SUBASTA.ORIGEN=J (judicial-first scope) +
SUBASTA.ESTADO=PA + mostrar=500. It reuses ALL of BOEParallelScraper's machinery:

  * the dedicated own-browser sync-Playwright lifecycle (_get_own_page /
    _close_own_browser) — the same asyncio-crash-avoidance contract the
    scheduler relies on (run via scheduler._run_sync_scrape on a loop-free
    thread);
  * the own-browser detail fetch (_navigate_and_extract) so each PA row's
    "Fecha de inicio" -> opens_at is pulled from the detail page;
  * db_adapter.upsert_auction — idempotent on boe_id, so a PA row that later
    reappears in the normal celebration scrape (same boe_id) updates in place,
    and promote_pending_auctions can flip it to CELEBRANDOSE with no duplicate.

DECISIONS LOCKED (per dispatch brief 2026-06-03)
------------------------------------------------
1. Status FORCED to PROXIMA_APERTURA (the enum value the API mapping and
   promote_pending_auctions key on — NOT the legacy PRE_AUCTION alias kept for
   TEJU). We pass status_override='PROXIMA_APERTURA' to parse_listing so a PA
   row is never mistagged CELEBRANDOSE (parse_listing's no-status-text default).
2. opens_at is MANDATORY. validate_auction_data() drops any PA row whose
   opens_at is missing or not in the future — such a row would never promote and
   would pollute the bucket. The detail banner (_extract_detail_status) returns
   None for a healthy "Próxima apertura" page, so the forced PROXIMA_APERTURA
   survives; if the detail page genuinely says cancelada/concluida the status
   override changes it away from PROXIMA_APERTURA and the gate then drops it (it
   is no longer a pre-auction). Both behaviours are correct.
3. Cadence: every 6h (4x/day), registered in scheduler.setup_schedule and run
   through scheduler._run_sync_scrape (loop-free thread).
4. Scope (first cut): judicial family nationwide (ORIGEN=J). If BOE returns its
   "too many results" error we paginate by province, exactly as the parallel
   scraper already handles the same error.
"""

from typing import Any, Dict, List
from datetime import datetime
import logging

from .boe_parallel_scraper import BOEParallelScraper
from .boe_scraper import BOE_STATUS_MAP
from ..core.stealth import random_delay
from ..config.settings import SCRAPER_ROOT, BOE_REQUEST_DELAY_SECONDS
from ..config.provinces import PROVINCES

logger = logging.getLogger(__name__)

# Internal status we force on every row this pass emits. Must match the enum the
# API `proximas` filter and promote_pending_auctions use.
PA_STATUS = BOE_STATUS_MAP['PA']  # 'PROXIMA_APERTURA'


class BOEPreAuctionScraper(BOEParallelScraper):
    """
    Discovery scraper for BOE "Próxima apertura" (PA) auctions.

    Inherits the own-browser sync-Playwright lifecycle, the own-browser detail
    fetch (_navigate_and_extract), parse_listing and upsert from
    BOEParallelScraper / BOEScraper. Overrides only:
      * the search submit -> a PA-STATE GET search (not the date-window form);
      * validate_auction_data -> require PROXIMA_APERTURA + a FUTURE opens_at.
    """

    # Judicial-first scope (SUBASTA.ORIGEN). None -> all families.
    ORIGEN_CODE = 'J'

    def __init__(self, scraper_id: int = 21):
        super().__init__(scraper_id=scraper_id)
        # Own progress file so the PA pass never collides with the date-range
        # backfill (parallel_backfill_<id>_progress.json) or the per-category
        # files.
        self.progress_file = SCRAPER_ROOT / 'preauction_pa_progress.json'

    def get_source_name(self) -> str:
        return "BOE_PREAUCTION_PA"

    # ------------------------------------------------------------------ #
    # Validation: opens_at is MANDATORY and must be in the FUTURE.        #
    # ------------------------------------------------------------------ #
    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """
        Same base required-fields check, PLUS the PA invariants:
          * status must be PROXIMA_APERTURA (a row whose detail page said
            cancelada/concluida/suspendida got overridden away — it is no longer
            a pre-auction, so we drop it from this pass);
          * opens_at must be present AND strictly in the future (it is the field
            promote_pending_auctions keys on to flip PROXIMA_APERTURA ->
            CELEBRANDOSE; without a real future value the row would never promote
            and would pollute the "Próximas" bucket).
        """
        if not super().validate_auction_data(data):
            return False

        if data.get('status') != PA_STATUS:
            self.log_info(
                f"  Skip {data.get('boe_id')}: status={data.get('status')} "
                f"(detail page is not a pre-auction)"
            )
            return False

        opens_at = data.get('opens_at')
        if opens_at is None:
            self.log_info(
                f"  Skip {data.get('boe_id')}: no opens_at (Fecha de inicio "
                f"missing on detail page) — would never promote"
            )
            return False

        # opens_at is a datetime by the time the detail extractor sets it.
        if not isinstance(opens_at, datetime):
            self.log_warning(
                f"  Skip {data.get('boe_id')}: opens_at not a datetime "
                f"({opens_at!r})"
            )
            return False

        if opens_at <= datetime.now():
            self.log_info(
                f"  Skip {data.get('boe_id')}: opens_at {opens_at} is not in the "
                f"future — promote_pending_auctions would flip it immediately / "
                f"it already opened"
            )
            return False

        return True

    # ------------------------------------------------------------------ #
    # Search: navigate the PA STATE directly (GET), not the date form.    #
    # ------------------------------------------------------------------ #
    def _goto_pa_search(self, page: Any, province: str = None) -> str:
        """
        Navigate to the PA-state search results via a GET URL built by
        build_search_url: SUBASTA.ORIGEN=<ORIGEN_CODE> + SUBASTA.ESTADO=PA +
        mostrar=500 (+ optional province for the too-many-results fallback).

        Returns the URL navigated to (for logging).
        """
        search_url = self.build_search_url(
            origen=self.ORIGEN_CODE,
            boe_status_code='PA',
            province=province,
            mostrar=500,
        )
        self.log_info(f"  PA search: {search_url}")
        random_delay(1, 3)
        page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
        random_delay(2, 4)
        return search_url

    def _scrape_pa_results(self, page: Any) -> tuple:
        """
        Paginate the currently-loaded PA results page, parsing every listing
        with status FORCED to PROXIMA_APERTURA and upserting the valid ones.

        Returns (total_results_found, auctions_saved). Raises a
        TooManyResultsError sentinel (via return value -1) so the caller can fall
        back to per-province pagination — mirrors the parallel scraper's handling
        of BOE's "too many results" error page.
        """
        try:
            page.wait_for_selector(
                '.resultado-busqueda, .sin-resultados, .error, .caja.gris.error',
                timeout=15000,
            )
        except Exception:
            self.log_warning("  Could not find PA results container")

        # BOE "too many results" error -> signal the caller to split by province.
        if page.locator('.caja.gris.error').count() > 0:
            self.log_warning("  BOE returned 'too many results' for PA search")
            return (-1, 0)

        if page.locator('.sin-resultados').count() > 0:
            self.log_info("  No PA auctions found")
            return (0, 0)

        total_found = 0
        saved_count = 0
        current_page = 1

        while current_page <= self.max_pages:
            auction_items = page.locator('.resultado-busqueda').all()
            if len(auction_items) == 0:
                auction_items = page.locator('.resultado-subasta').all()
            if len(auction_items) == 0:
                auction_items = page.locator('.resultado').all()
            if len(auction_items) == 0:
                break

            total_found += len(auction_items)
            self.log_info(f"  PA page {current_page}: {len(auction_items)} items")

            for idx, item in enumerate(auction_items):
                try:
                    if idx > 0 and idx % 10 == 0:
                        random_delay(1, 2)

                    # FORCE PROXIMA_APERTURA — parse_listing defaults to
                    # CELEBRANDOSE when no status text is found in the listing
                    # card, which is exactly the PA case. The override is honored
                    # in parse_listing unless the detail banner says the auction
                    # has concluded/cancelled (then validate drops it).
                    auction_data = self.parse_listing(
                        item, status_override=PA_STATUS
                    )

                    if auction_data and auction_data.get('_split_lotes'):
                        # A declared-split PA umbrella -> N lote rows. Each lote
                        # row inherits opens_at from the umbrella detail; only
                        # those passing the PA gate are kept.
                        for lote in auction_data['_split_lotes']:
                            lote.setdefault('status', PA_STATUS)
                            if self.validate_auction_data(lote):
                                self.db_adapter.upsert_auction(lote)
                                saved_count += 1
                    elif auction_data and self.validate_auction_data(auction_data):
                        self.db_adapter.upsert_auction(auction_data)
                        saved_count += 1
                except Exception as e:
                    self.log_error(f"  Error processing PA item: {e}")

            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            random_delay(1, 2)

            next_links = page.locator('a:has-text("Siguiente")').all()
            if len(next_links) == 0:
                next_links = page.locator('a.siguiente').all()
            if len(next_links) == 0:
                next_links = page.locator(f'a:has-text("{current_page + 1}")').all()

            if len(next_links) > 0 and current_page < self.max_pages:
                try:
                    next_links[0].hover()
                    random_delay(0.5, 1)
                    next_links[0].click()
                    random_delay(BOE_REQUEST_DELAY_SECONDS + 1,
                                 BOE_REQUEST_DELAY_SECONDS + 3)
                    page.wait_for_load_state('domcontentloaded', timeout=30000)
                    random_delay(2, 4)
                    current_page += 1
                except Exception as e:
                    self.log_warning(f"  Could not navigate to next PA page: {e}")
                    break
            else:
                break

        return (total_found, saved_count)

    def discover(self) -> Dict[str, Any]:
        """
        Run one full PA discovery pass (judicial nationwide).

        Returns a progress dict mirroring scrape_date_range's shape
        (total_auctions, errors) so the scheduler logs uniformly.
        """
        self.reset_stats()
        progress = {
            'scraper_id': self.scraper_id,
            'total_auctions': 0,
            'total_found': 0,
            'errors': [],
            'mode': 'preauction_pa',
            'origen': self.ORIGEN_CODE,
        }

        page = None
        try:
            page = self._get_own_page()
            self._goto_pa_search(page)
            found, saved = self._scrape_pa_results(page)

            if found == -1:
                # Too many results nationwide -> fall back to per-province PA
                # searches (same fallback contract as the parallel scraper).
                self.log_info(
                    "  Falling back to per-province PA discovery "
                    "(nationwide search exceeded BOE's result cap)"
                )
                try:
                    page.close()
                except Exception:
                    pass
                page = None
                found, saved = self._discover_by_province(progress)

            progress['total_found'] = max(found, 0)
            progress['total_auctions'] = saved
            self.log_info(
                f"PA discovery complete: found={progress['total_found']}, "
                f"saved(PROXIMA_APERTURA w/ future opensAt)={saved}"
            )
        except Exception as e:
            self.log_error(f"PA discovery failed: {e}")
            import traceback
            self.log_error(traceback.format_exc())
            progress['errors'].append({
                'error': str(e),
                'timestamp': datetime.now().isoformat(),
            })
        finally:
            if page is not None:
                try:
                    page.close()
                except Exception:
                    pass
            # Always tear down the dedicated browser + Playwright (P0 contract).
            self._close_own_browser()

        return progress

    def _discover_by_province(self, progress: Dict[str, Any]) -> tuple:
        """
        Per-province PA discovery used only when the nationwide search trips
        BOE's "too many results" cap. Each province gets a fresh own-browser page
        so a single province failure can't poison the rest.
        """
        total_found = 0
        total_saved = 0
        for province in PROVINCES:
            page = None
            try:
                page = self._get_own_page()
                self._goto_pa_search(page, province=province)
                found, saved = self._scrape_pa_results(page)
                if found == -1:
                    # Even a single province over the cap is implausible for PA,
                    # but log it rather than loop forever.
                    self.log_warning(
                        f"  PA search for province {province} still over cap; "
                        f"skipping"
                    )
                    found = 0
                total_found += max(found, 0)
                total_saved += saved
            except Exception as e:
                self.log_error(f"  PA province {province} failed: {e}")
                progress['errors'].append({
                    'province': province,
                    'error': str(e),
                    'timestamp': datetime.now().isoformat(),
                })
            finally:
                if page is not None:
                    try:
                        page.close()
                    except Exception:
                        pass
            random_delay(5, 10)
        return (total_found, total_saved)


def run_discovery(scraper_id: int = 21) -> Dict[str, Any]:
    """
    Module entrypoint the scheduler calls (and the one-off CLI below). Builds the
    scraper, runs one PA discovery pass, and guarantees browser teardown.

    Returns the progress dict (total_auctions, total_found, errors).
    """
    scraper = BOEPreAuctionScraper(scraper_id=scraper_id)
    logger.info("[preauction] PA discovery pass (ORIGEN=%s)", scraper.ORIGEN_CODE)
    try:
        return scraper.discover()
    finally:
        # discover() already tears down, but belt-and-suspenders in case discover
        # raised before its finally ran.
        scraper._close_own_browser()


if __name__ == '__main__':
    import json
    logging.basicConfig(level=logging.INFO)
    result = run_discovery()
    print(json.dumps(
        {k: v for k, v in (result or {}).items()
         if k in ('total_auctions', 'total_found', 'errors')},
        default=str, indent=2,
    ))
