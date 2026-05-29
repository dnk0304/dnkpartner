"""
Core Module
Base classes and infrastructure for all scrapers
"""

from .base_scraper import BaseScraper
from .browser import BrowserManager
from .stealth import apply_stealth_to_page, random_delay, StealthSession
from .proxy_manager import ProxyManager, get_browser_context_config

__all__ = [
    'BaseScraper',
    'BrowserManager',
    'apply_stealth_to_page',
    'random_delay',
    'StealthSession',
    'ProxyManager',
    'get_browser_context_config',
]
