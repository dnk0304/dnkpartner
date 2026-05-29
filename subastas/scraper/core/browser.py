"""
Browser Manager Module
Centralized Playwright browser management with connection pooling
"""

from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page
from typing import Optional, Dict, Any
import logging
import atexit

from ..config.settings import HEADLESS_BROWSER, USE_STEALTH
from .stealth import apply_stealth_to_page

logger = logging.getLogger(__name__)


class BrowserManager:
    """
    Singleton browser manager for Playwright
    Manages browser instances with connection pooling and proper cleanup
    """
    
    _instance = None
    _playwright = None
    _browser: Optional[Browser] = None
    _contexts: list = []
    
    def __new__(cls):
        """Singleton pattern - only one instance"""
        if cls._instance is None:
            cls._instance = super(BrowserManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """Initialize browser manager"""
        if self._initialized:
            return
        
        self._initialized = True
        self._playwright = None
        self._browser = None
        self._contexts = []
        
        # Register cleanup on exit
        atexit.register(self.close_all)
        
        logger.info("BrowserManager initialized")
    
    def _ensure_browser(self):
        """Ensure browser is launched"""
        if self._browser is None or not self._browser.is_connected():
            if self._playwright is None:
                self._playwright = sync_playwright().start()
            
            logger.info("Launching browser...")
            self._browser = self._playwright.chromium.launch(
                headless=HEADLESS_BROWSER,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                ]
            )
            logger.info("Browser launched successfully")
    
    def get_context(self, proxy: Optional[Dict[str, str]] = None, **kwargs) -> BrowserContext:
        """
        Get a new browser context (isolated session)
        
        Args:
            proxy: Optional proxy configuration
            **kwargs: Additional context options
        
        Returns:
            BrowserContext instance
        """
        self._ensure_browser()
        
        context_options = {
            'viewport': {'width': 1920, 'height': 1080},
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'locale': 'es-ES',
            'timezone_id': 'Europe/Madrid',
            **kwargs,
        }
        
        if proxy:
            context_options['proxy'] = proxy
        
        context = self._browser.new_context(**context_options)
        self._contexts.append(context)
        
        logger.debug(f"Created new context (total: {len(self._contexts)})")
        return context
    
    def get_page(self, stealth: bool = True, proxy: Optional[Dict[str, str]] = None, **kwargs) -> Page:
        """
        Get a configured page ready for scraping
        
        Args:
            stealth: Whether to apply stealth measures
            proxy: Optional proxy configuration
            **kwargs: Additional context options
        
        Returns:
            Page instance with optional stealth applied
        """
        context = self.get_context(proxy=proxy, **kwargs)
        page = context.new_page()
        
        if stealth and USE_STEALTH:
            apply_stealth_to_page(page)
            logger.debug("Applied stealth measures to page")
        
        return page
    
    def close_context(self, context: BrowserContext):
        """
        Close a specific browser context
        
        Args:
            context: Context to close
        """
        try:
            context.close()
            if context in self._contexts:
                self._contexts.remove(context)
            logger.debug(f"Closed context (remaining: {len(self._contexts)})")
        except Exception as e:
            logger.warning(f"Error closing context: {e}")
    
    def close_page(self, page: Page):
        """
        Close a page and its context
        
        Args:
            page: Page to close
        """
        try:
            context = page.context
            page.close()
            self.close_context(context)
        except Exception as e:
            logger.warning(f"Error closing page: {e}")
    
    def close_all(self):
        """Close all contexts and browser"""
        logger.info("Closing all browser resources...")
        
        # Close all contexts
        for context in self._contexts[:]:
            try:
                context.close()
            except Exception as e:
                logger.warning(f"Error closing context: {e}")
        
        self._contexts = []
        
        # Close browser
        if self._browser:
            try:
                self._browser.close()
            except Exception as e:
                logger.warning(f"Error closing browser: {e}")
            self._browser = None
        
        # Stop playwright
        if self._playwright:
            try:
                self._playwright.stop()
            except Exception as e:
                logger.warning(f"Error stopping playwright: {e}")
            self._playwright = None
        
        logger.info("All browser resources closed")
    
    def restart(self):
        """Restart the browser (useful for memory cleanup)"""
        logger.info("Restarting browser...")
        self.close_all()
        self._ensure_browser()
    
    @property
    def is_connected(self) -> bool:
        """Check if browser is connected"""
        return self._browser is not None and self._browser.is_connected()
    
    @property
    def context_count(self) -> int:
        """Get number of active contexts"""
        return len(self._contexts)


# Global instance
_browser_manager = None


def get_browser_manager() -> BrowserManager:
    """Get the global browser manager instance"""
    global _browser_manager
    if _browser_manager is None:
        _browser_manager = BrowserManager()
    return _browser_manager
