"""
Otras administraciones tributarias BOE scraper (ORIGEN=R).

PHASE 2 per-category scraper. Family: SUB-RC (recaudación tributaria — regional
and local tax bodies: Comunidades Autónomas, Diputaciones, Ayuntamientos).
Built from the proven notarial_scraper.py template.
"""

from datetime import datetime, timedelta
import logging

from .category_scraper_base import CategoryBOEScraper

logger = logging.getLogger(__name__)


class OtrasTributariasScraper(CategoryBOEScraper):
    ORIGEN_CODE = 'R'  # Otras administraciones tributarias -> OTRAS_TRIBUTARIAS (SUB-RC)


def run_daily_update(days_back: int = 7, days_forward: int = 120, scraper_id: int = 13):
    today = datetime.now()
    start = today - timedelta(days=days_back)
    end = today + timedelta(days=days_forward)
    scraper = OtrasTributariasScraper(scraper_id=scraper_id)
    logger.info("[otras_tributarias] daily update %s -> %s (ORIGEN=%s)",
                start.date(), end.date(), scraper.ORIGEN_CODE)
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
    print(json.dumps({k: v for k, v in (result or {}).items()
                      if k in ('total_auctions', 'errors')}, default=str, indent=2))
