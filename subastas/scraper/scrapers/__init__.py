"""
Scrapers Module
All source-specific scraper implementations
"""

from .boe_scraper import BOEScraper
from .boe_backfill_scraper import BOEBackfillScraper
from .teju_scraper import TEJUScraper
from .sede_scraper import SedeJudicialScraper
from .registro_scraper import RegistroScraper
from .borme_scraper import BORMEScraper

__all__ = [
    'BOEScraper',
    'BOEBackfillScraper',
    'TEJUScraper',
    'SedeJudicialScraper',
    'RegistroScraper',
    'BORMEScraper',
]
