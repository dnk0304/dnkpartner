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
A dedicated discovery pass that queries the "Próxima apertura" STATE directly
(not a date window) by SUBMITTING the advanced-search FORM: Origen radio =
J (judicial-first scope) + Estado radio = PU ("Prox. apertura") + mostrar=500.

IMPORTANT — BOE estado code is PU, not PA, and a bare GET is rejected:
  * "Próxima apertura" on the form is estado value PU (control id="idEstadoPU").
    There is NO `PA` code. The *internal* DB/API status we force stays
    PROXIMA_APERTURA (BOE_STATUS_MAP['PA']); only the BOE-side SEARCH code is PU.
  * A synthetic GET `subastas_ava.php?campo[]=...&dato[]=...` returns
    302 -> error/error.php even with PU; the advanced search needs the real
    form submit (hidden fields / session). So _goto_pa_search drives the same
    human-like form machinery the working daily / per-category path uses,
    swapping the date fills for the Origen + Estado=PU radio selections.

It reuses ALL of BOEParallelScraper's machinery:

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
2. opens_at is OPTIONAL for PA rows (was MANDATORY — REVERSED 2026-06-03 after
   Ken verified live that BOE publishes NO opening date during the PA phase).
   A "Próxima apertura" auction has not been scheduled to open yet, so its detail
   page has NO "Fecha de inicio"/"Fecha de conclusión" and ZERO date tokens
   (confirmed on 6/6 PA detail pages JA/JC/JV). A mandatory-future-opens_at gate
   is therefore UNSATISFIABLE for any PA row and dropped all 116. So
   validate_auction_data() now ACCEPTS a NULL opens_at (the normal PA state); it
   only rejects an opens_at that is present-but-not-a-future-datetime (a past/now
   value means the row already opened — not a pre-auction). This is SAFE:
   promote_pending_auctions (PROXIMA_APERTURA -> CELEBRANDOSE WHERE opensAt IS NOT
   NULL AND opensAt<=now) NO-OPs on a NULL opensAt, so the row sits harmlessly in
   the Próximas bucket until the normal daily celebration scrape finds it open and
   the idempotent boe_id upsert flips it to CELEBRANDOSE (backfilling opensAt).
   The detail banner (_extract_detail_status) returns None for a healthy
   "Próxima apertura" page, so the forced PROXIMA_APERTURA survives; if the detail
   page genuinely says cancelada/concluida the status override changes it away
   from PROXIMA_APERTURA and the status gate then drops it (no longer a
   pre-auction). Both behaviours are correct.
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
from ..config.provinces import PROVINCES, get_province_code

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
          * opens_at is OPTIONAL. BOE publishes NO opening date during the PA
            phase (verified live 2026-06-03: Fecha de inicio absent on every PA
            detail), so a NULL opens_at is the NORMAL pre-auction state and is
            ACCEPTED. If an opens_at IS present it must be a future datetime (a
            past/now value means the row already opened — not a pre-auction).
            promote_pending_auctions NO-OPs on NULL opensAt, so a NULL-opensAt PA
            row sits harmlessly in the Próximas bucket until a later scrape
            backfills the date (idempotent boe_id upsert), then promotes it.
        """
        if not super().validate_auction_data(data):
            return False

        if data.get('status') != PA_STATUS:
            self.log_info(
                f"  Skip {data.get('boe_id')}: status={data.get('status')} "
                f"(detail page is not a pre-auction)"
            )
            return False

        # PA pages publish NO opening date until BOE schedules the auction
        # (verified live 2026-06-03: Fecha de inicio absent on every PA detail).
        # A NULL opens_at is the NORMAL pre-auction state — ACCEPT it. Only when
        # an opens_at IS present do we require it to be a future datetime.
        opens_at = data.get('opens_at')
        if opens_at is not None:
            if not isinstance(opens_at, datetime):
                self.log_warning(
                    f"  Skip {data.get('boe_id')}: opens_at not a datetime "
                    f"({opens_at!r})"
                )
                return False
            if opens_at <= datetime.now():
                self.log_info(
                    f"  Skip {data.get('boe_id')}: opens_at {opens_at} is not in "
                    f"the future — already opened (not a pre-auction)"
                )
                return False
        # opens_at None -> accept (PA rows have no opening date yet; it will be
        # backfilled by the idempotent boe_id upsert when BOE schedules the
        # apertura and the daily celebration scrape finds it open).

        return True

    # ------------------------------------------------------------------ #
    # Search: SUBMIT the advanced-search FORM for the PA state.           #
    #                                                                     #
    # A bare GET `subastas_ava.php?campo[]=...&dato[]=...` is rejected by  #
    # BOE (302 -> error/error.php) even with the correct estado code; the  #
    # advanced search requires the real form submit (it carries the form's #
    # hidden fields / session). Verified live by Ken 2026-06-03. So we     #
    # drive the SAME human-like form machinery the working daily path uses  #
    # (BOEParallelScraper._submit_search_form_human / the per-category      #
    # CategoryBOEScraper override), swapping the date-field fills for the   #
    # Origen + Estado radio selections.                                    #
    #                                                                     #
    # FORM CONTROLS (Ken read them live off subastas_ava.php 2026-06-03):  #
    #   * Origen radios, name="dato[0]" (hidden campo[0]=SUBASTA.ORIGEN):   #
    #       idOrigenJ (J=Judicial), idOrigenN (N), idOrigenA (A=AEAT), ...  #
    #   * Estado radios, name="dato[2]" (hidden campo[2]=SUBASTA.ESTADO):   #
    #       idEstadoPU (PU="Prox. apertura"), idEstadoEJ (EJ=Celebrándose), #
    #       ...  >>> "Próxima apertura" is BOE estado code PU; there is NO  #
    #       PA code on the form. We force the *internal* status            #
    #       PROXIMA_APERTURA separately (parse_listing status_override).    #
    #   * Province select (too-many-results fallback only): name="dato[3]"  #
    #     paired with hidden campo[3]=SUBASTA.CODPROV, option value = the   #
    #     2-digit BOE province code (get_province_code).                   #
    # ------------------------------------------------------------------ #
    # BOE estado query code for "Próxima apertura". NOT 'PA' (no such code  #
    # on the form). The internal DB/API status stays PROXIMA_APERTURA.     #
    BOE_ESTADO_CODE = 'PU'

    def _goto_pa_search(self, page: Any, province: str = None) -> str:
        """
        Submit the BOE advanced-search FORM for the PA state and land on the
        results page. Mirrors CategoryBOEScraper._submit_search_form_human's
        proven submit/wait machinery, but selects Origen + Estado(=PU) radios
        instead of filling the date window (a PA search is STATE-based, with no
        celebration date range).

        For the per-province too-many-results fallback, additionally selects the
        province in the form's province <select>.

        Returns a short label string (for logging).
        """
        label = (
            f"ORIGEN={self.ORIGEN_CODE}, ESTADO={self.BOE_ESTADO_CODE}"
            + (f", PROV={province}" if province else "")
        )
        self.log_info(f"  PA form search: {label}")

        try:
            page.goto(
                "https://subastas.boe.es/subastas_ava.php",
                wait_until='domcontentloaded',
                timeout=30000,
            )
            random_delay(2, 3)

            # Wait for the form to be interactive (same anchor the working path
            # uses). #desdeFP exists on the form; we don't fill it for PA.
            page.wait_for_selector('#desdeFP', timeout=10000)
            random_delay(1, 2)

            # Select Origen (dato[0]) AND Estado=PU (dato[2]) via JS: the visible
            # <label> intercepts pointer clicks on the radio inputs on this
            # portal, so a plain .check()/.click() fights the label and times out
            # (same reason the category override uses JS).
            origen_hit = page.evaluate(
                """(origen) => {
                    const radios = document.getElementsByName('dato[0]');
                    let hit = false;
                    for (const r of radios) {
                        r.checked = (r.value === origen);
                        if (r.checked) { hit = true; r.dispatchEvent(new Event('change', {bubbles:true})); }
                    }
                    return hit;
                }""",
                self.ORIGEN_CODE,
            )
            if not origen_hit:
                self.log_warning(
                    f"  Could not set Origen radio to {self.ORIGEN_CODE} "
                    f"(dato[0]) — form layout may have changed"
                )
            random_delay(0.5, 1)

            estado_hit = page.evaluate(
                """(estado) => {
                    const radios = document.getElementsByName('dato[2]');
                    let hit = false;
                    for (const r of radios) {
                        r.checked = (r.value === estado);
                        if (r.checked) { hit = true; r.dispatchEvent(new Event('change', {bubbles:true})); }
                    }
                    return hit;
                }""",
                self.BOE_ESTADO_CODE,
            )
            if not estado_hit:
                self.log_warning(
                    f"  Could not set Estado radio to {self.BOE_ESTADO_CODE} "
                    f"(dato[2]) — 'Prox. apertura' control id idEstadoPU may "
                    f"have changed"
                )
            random_delay(0.5, 1)

            # Per-province fallback: set the province <select> (dato[3],
            # campo[3]=SUBASTA.CODPROV) to the 2-digit BOE province code.
            if province:
                province_code = get_province_code(province)
                page.evaluate(
                    """(code) => {
                        const sels = document.getElementsByName('dato[3]');
                        for (const s of sels) {
                            if (s.tagName === 'SELECT') {
                                s.value = code;
                                s.dispatchEvent(new Event('change', {bubbles:true}));
                            }
                        }
                    }""",
                    province_code,
                )
                random_delay(0.5, 1)

            # 500 results per page (if the form exposes the control).
            try:
                page.select_option('#mostrar', '500')
            except Exception:
                pass
            random_delay(0.5, 1)

            page.evaluate("window.scrollTo(0, 600)")
            random_delay(0.5, 1)

            # Human-like submit (same button + hover/click + forced-click
            # fallback as the working category override).
            self.log_info("  Submitting PA search...")
            submit_button = page.locator(
                'input[type="submit"][value="Buscar"]'
            ).first
            try:
                submit_button.hover()
                random_delay(0.5, 1)
                submit_button.click()
            except Exception:
                submit_button.click(force=True)

            random_delay(3, 5)
            page.wait_for_load_state('domcontentloaded', timeout=30000)
            random_delay(2, 3)
            self.log_info("  PA search submitted")
        except Exception as e:
            self.log_error(f"Failed to submit PA search form: {e}")
            raise

        return label

    def _scrape_pa_results(self, page: Any) -> tuple:
        """
        Paginate the currently-loaded PA results page, parsing every listing
        with status FORCED to PROXIMA_APERTURA and upserting the valid ones.

        Returns (total_results_found, auctions_saved). Raises a
        TooManyResultsError sentinel (via return value -1) so the caller can fall
        back to per-province pagination — mirrors the parallel scraper's handling
        of BOE's "too many results" error page.
        """
        # Same results-container wait the WORKING EJ path uses
        # (BOEParallelScraper._scrape_batch L297). The PA results page renders
        # the identical .resultado-busqueda card family (confirmed: the per-
        # category scrapers parse the same containers off the same form), so no
        # PA-specific selector is needed — the earlier .resultado-busqueda /
        # .sin-resultados waits simply never ran because the rejected GET
        # redirected to error.php before any results page loaded.
        try:
            page.wait_for_selector(
                '.resultado-busqueda, .sin-resultados, .error',
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
                f"saved(PROXIMA_APERTURA)={saved}"
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
