"""
Notarial BOE scraper (Tipo de subasta = Notarial, ORIGEN=N).

PHASE 2 per-category scraper. Families: SUB-NH (notarial hipotecaria),
SUB-NN (notarial). Inherits ALL extraction logic from CategoryBOEScraper /
BOEParallelScraper / BOEScraper — this file only declares the ORIGEN code and
exposes a `run_daily_update()` entrypoint the scheduler calls 4x/day.

This is the PROVEN TEMPLATE for the other per-category scrapers
(aeat_scraper.py, otras_tributarias_scraper.py, administrativas_scraper.py):
copy this file, change ORIGEN_CODE, the class name and the module docstring.
"""

from datetime import datetime, timedelta
import logging

from .category_scraper_base import CategoryBOEScraper

logger = logging.getLogger(__name__)


class NotarialScraper(CategoryBOEScraper):
    ORIGEN_CODE = 'N'  # Notarial  -> auctionType NOTARIAL  (SUB-NH / SUB-NN)


def run_daily_update(days_back: int = 7, days_forward: int = 120, scraper_id: int = 11):
    """
    Refresh notarial auctions whose conclusion date falls in the window
    [today - days_back, today + days_forward]. Active notarial auctions all
    conclude within ~3-4 weeks, so the forward window comfortably captures the
    live pool; the small backward window re-touches just-concluded rows so the
    status sweep can retire them.

    Returns the BOEParallelScraper progress dict (total_auctions, errors, ...).
    """
    today = datetime.now()
    start = today - timedelta(days=days_back)
    end = today + timedelta(days=days_forward)

    scraper = NotarialScraper(scraper_id=scraper_id)
    logger.info(
        "[notarial] daily update %s -> %s (ORIGEN=%s)",
        start.date(), end.date(), scraper.ORIGEN_CODE,
    )
    try:
        return scraper.scrape_date_range(
            start_year=start.year, start_month=start.month, start_day=start.day,
            end_year=end.year, end_month=end.month, end_day=end.day,
            resume=False,
        )
    finally:
        scraper._close_own_browser()


if __name__ == '__main__':
    import json
    logging.basicConfig(level=logging.INFO)
    result = run_daily_update()
    print(json.dumps(
        {k: v for k, v in (result or {}).items() if k in ('total_auctions', 'errors')},
        default=str, indent=2,
    ))
