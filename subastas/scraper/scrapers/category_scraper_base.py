"""
Category BOE Scraper — shared base for the per-category scrapers.

PHASE 2 (2026-06-01): BOE publishes five "Tipo de subasta" families, not just
judicial. Dennis's directive is ONE scraper script per category (notarial,
aeat, otras_tributarias, administrativas) rather than one combined
parameterised scraper. To honour that WITHOUT copy-pasting the proven extraction
guts, every per-category script imports this single shared base and only
declares its own ORIGEN code + auctionType. The detail-page extraction, the
listing parse, the endsAt parsing, the valor-subasta appraisal fallback, the
domcontentloaded navigation and the date-range sweep are all inherited
unchanged from BOEParallelScraper / BOEScraper.

RECON EVIDENCE (subastas.boe.es, 2026-06-01) — why the parse guts are shared:
  The detail-page field LABELS are byte-for-byte IDENTICAL across all five
  families: Identificador, Tipo de subasta, Estado, Fecha de inicio,
  Fecha de conclusión, Cantidad reclamada, Valor subasta, Tasación,
  Puja mínima, Importe del depósito, Tramos entre pujas. The ONLY per-family
  differences are:
    - the idSub prefix (SUB-JA/JV/JC, SUB-NH/NN, SUB-AT, SUB-RC, SUB-GA), and
    - the "Tipo de subasta" *value* string.
  Multi-lot auctions (common in Notarial-NH and Administrativas-GA) render
  "Ver valor de subasta en cada lote" at the top instead of a single price;
  that is a multi-lot vs single-lot difference (also present in judicial), not
  a per-category layout difference, and is already handled by the existing
  valor-subasta / per-lot fallbacks.

So: same parser, the family is selected purely by the search-form ORIGEN radio.

The ORIGEN radio (name="dato[0]", hidden campo[0]=SUBASTA.ORIGEN) values:
  J Judicial · N Notarial · A AEAT · R Otras administraciones tributarias ·
  G Subastas administrativas generales.
"""

from typing import Any
import logging

from .boe_parallel_scraper import BOEParallelScraper
from .boe_scraper import ORIGEN_TO_AUCTION_TYPE
from ..core.stealth import random_delay
from ..config.settings import SCRAPER_ROOT

logger = logging.getLogger(__name__)


class CategoryBOEScraper(BOEParallelScraper):
    """
    A BOE date-range scraper constrained to ONE "Tipo de subasta" family.

    Subclasses (notarial_scraper, aeat_scraper, ...) set ORIGEN_CODE; everything
    else is inherited. auctionType for every row is forced from the idSub prefix
    (via the inherited detect_auction_type, which is prefix-authoritative), with
    the ORIGEN code as the declared expectation for logging/validation.
    """

    # Subclasses MUST override this with one of J / N / A / R / G.
    ORIGEN_CODE: str = ''

    def __init__(self, scraper_id: int = 1):
        super().__init__(scraper_id=scraper_id)
        if self.ORIGEN_CODE not in ORIGEN_TO_AUCTION_TYPE:
            raise ValueError(
                f"{type(self).__name__}.ORIGEN_CODE must be one of "
                f"{list(ORIGEN_TO_AUCTION_TYPE)}; got {self.ORIGEN_CODE!r}"
            )
        self.expected_auction_type = ORIGEN_TO_AUCTION_TYPE[self.ORIGEN_CODE]
        # Per-category progress file so categories never collide on the shared
        # parallel_backfill_<id>_progress.json the base uses for backfills.
        self.progress_file = SCRAPER_ROOT / (
            f'category_{self.expected_auction_type.lower()}_progress.json'
        )

    def get_source_name(self) -> str:
        return f"BOE_{self.expected_auction_type}"

    # NOTE: the own-browser _fetch_detail_info override lives in
    # BOEParallelScraper (our parent) so judicial daily-update gets the same fix.
    # We inherit it unchanged here.

    def _submit_search_form_human(self, page: Any, start_date: str, end_date: str):
        """
        Same human-like form submission as the base, but additionally selects the
        "Tipo de subasta" ORIGEN radio so only this family is enumerated.

        The radio is set BEFORE the dates so the value is in place when the form
        is submitted. We set it via JS (checked + change event) because the
        visible <label> intercepts pointer clicks on the radio input on this
        portal — a plain Playwright .check() times out fighting the label.
        """
        try:
            self.log_info(f"  Navigating to BOE search page (ORIGEN={self.ORIGEN_CODE})...")
            page.goto(
                "https://subastas.boe.es/subastas_ava.php",
                wait_until='domcontentloaded',
                timeout=30000,
            )
            random_delay(2, 3)

            page.wait_for_selector('#desdeFP', timeout=10000)

            # Select the Tipo de subasta family (ORIGEN radio).
            page.evaluate(
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
            random_delay(0.5, 1)

            # Dates (type="date" inputs -> ISO yyyy-mm-dd). The caller passes
            # %Y-%m-%d already (see BOEParallelScraper.scrape_date_range), so fill
            # directly.
            self.log_info(f"  Filling dates: {start_date} to {end_date}")
            page.fill('#desdeFP', start_date)
            random_delay(0.3, 0.7)
            page.fill('#hastaFP', end_date)
            random_delay(0.5, 1)

            # 500 results per page.
            try:
                page.select_option('#mostrar', '500')
            except Exception:
                pass
            random_delay(0.5, 1)

            page.evaluate("window.scrollTo(0, 600)")
            random_delay(0.5, 1)

            self.log_info("  Submitting search...")
            submit_button = page.locator('input[type="submit"][value="Buscar"]').first
            try:
                submit_button.hover()
                random_delay(0.5, 1)
                submit_button.click()
            except Exception:
                # Fall back to a forced click if the button is overlapped.
                submit_button.click(force=True)

            random_delay(3, 5)
            page.wait_for_load_state('domcontentloaded', timeout=30000)
            random_delay(2, 3)
            self.log_info("  Search submitted successfully")

        except Exception as e:
            self.log_error(f"Failed to submit search form: {e}")
            raise
