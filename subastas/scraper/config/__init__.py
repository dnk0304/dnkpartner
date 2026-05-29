"""
Configuration Module
Centralized configuration for scraper system
"""

from .settings import *
from .provinces import PROVINCES, get_province_code
from .categories import CATEGORIES, get_category_type
from .schedules import SCRAPE_SCHEDULES

__all__ = [
    'PROVINCES',
    'get_province_code',
    'CATEGORIES',
    'get_category_type',
    'SCRAPE_SCHEDULES',
]
