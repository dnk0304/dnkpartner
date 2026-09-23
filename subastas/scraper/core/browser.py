"""
Browser Manager Module
Centralized Playwright browser management with connection pooling
"""

from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page
from typing import Optional, Dict, Any
import logging
import atexit
import os
import signal
import threading

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
        # SN-5: which thread started the CURRENT sync-Playwright driver. See
        # _ensure_browser.
        self._owner_thread: Optional[threading.Thread] = None

        # Register cleanup on exit
        atexit.register(self.close_all)

        logger.info("BrowserManager initialized")

    # -----------------------------------------------------------------------
    # SN-5 (2026-09-23) — THREAD AFFINITY. This is the root of the greenlet
    # storm that stalled the scheduler for ~8h on 2026-09-23.
    #
    # `sync_playwright().start()` binds a greenlet/event loop to the CALLING
    # thread. This class is a process-wide singleton (`__new__` + the module
    # `_browser_manager`), but `scheduler._run_sync_scrape` deliberately runs
    # every scrape on a FRESH thread. So scrape #1 started the driver on thread
    # A, thread A exited, and scrape #2 on thread B reused the very same
    # singleton — driving a driver whose loop lives on a dead thread. Playwright
    # then raises, forever:
    #     greenlet.error: cannot switch to a different thread
    #                     (which happens to have exited)
    # 618 of those since 09-19 — and one call wedged instead of raising, which
    # is what hung the single scheduler loop. The `node .../cli.js run-driver`
    # PID was 20 days old (= container age): ONE driver, never stopped, because
    # nothing but `atexit` ever calls close_all().
    #
    # The fix: the driver is owned by the thread that started it. A different
    # (or dead) thread never touches it — we ABANDON the handles, best-effort
    # kill the orphaned driver process so it cannot accumulate, and start a
    # clean driver on the current thread.
    #
    # We do NOT call close_all() from the wrong thread: that call is itself the
    # cross-thread switch that raises/hangs.
    # -----------------------------------------------------------------------
    def _abandon_foreign_driver(self):
        """Drop a driver owned by another (usually dead) thread, killing its process."""
        owner = self._owner_thread
        logger.warning(
            "BrowserManager: Playwright driver was started on thread %r "
            "(alive=%s) but is being used from %r — abandoning it and starting "
            "a clean driver on this thread (SN-5 greenlet-storm guard)",
            getattr(owner, 'name', owner),
            getattr(owner, 'is_alive', lambda: False)(),
            threading.current_thread().name,
        )
        self._kill_driver_process(self._playwright)
        self._playwright = None
        self._browser = None
        self._contexts = []
        self._owner_thread = None

    @staticmethod
    def _kill_driver_process(pw) -> None:
        """
        Best-effort SIGKILL of the `node ... cli.js run-driver` process behind a
        sync-Playwright handle we can no longer talk to.

        Reaches through private attributes on purpose: the public `.stop()` is
        exactly the cross-thread call that hangs. Every step is guarded — a
        failure here must never break a scrape, it only means one orphan lives
        until the process exits.
        """
        if pw is None:
            return
        try:
            proc = getattr(getattr(getattr(pw, '_connection', None),
                                   '_transport', None), '_proc', None)
            pid = getattr(proc, 'pid', None)
            if not pid:
                return
            if os.name == 'nt':
                import subprocess
                subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'],
                               capture_output=True, timeout=30)
            else:
                os.kill(pid, signal.SIGKILL)
            logger.warning("BrowserManager: killed orphaned Playwright driver pid=%s", pid)
        except Exception as e:  # noqa: BLE001
            logger.warning("BrowserManager: could not kill orphaned driver: %s", e)

    def _ensure_browser(self):
        """Ensure browser is launched (on THIS thread — see thread-affinity note)."""
        if self._playwright is not None and self._owner_thread is not threading.current_thread():
            self._abandon_foreign_driver()

        if self._browser is None or not self._browser.is_connected():
            if self._playwright is None:
                self._playwright = sync_playwright().start()
                self._owner_thread = threading.current_thread()

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
        """Close all contexts and browser.

        SN-5: refuses to do a graceful close from a thread that does not own the
        driver — that call is the cross-thread greenlet switch that hangs. From
        a foreign thread (including the `atexit` hook when the owning scrape
        thread is already gone) we abandon + kill instead, which is bounded.
        """
        if self._playwright is not None and self._owner_thread is not None \
                and self._owner_thread is not threading.current_thread():
            self._abandon_foreign_driver()
            return

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
        
        # Stop playwright. SN-5: if the graceful stop fails we must NOT leave a
        # started-but-unstopped driver behind (that is the 20-day-old PID 750) —
        # kill its process so the handle cannot outlive this call.
        if self._playwright:
            try:
                self._playwright.stop()
            except Exception as e:
                logger.warning(f"Error stopping playwright: {e}")
                self._kill_driver_process(self._playwright)
            self._playwright = None
        self._owner_thread = None

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
