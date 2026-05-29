"""
Stealth Module
Anti-bot detection measures for web scraping
"""
import random
from playwright.sync_api import Page, BrowserContext
from typing import Optional


def apply_stealth_to_page(page: Page) -> None:
    """
    Apply stealth measures to a Playwright page
    Includes JavaScript injections to avoid detection
    """
    
    # Override navigator properties
    page.add_init_script("""
        // Override the navigator.webdriver property
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
        
        // Override navigator.plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });
        
        // Override navigator.languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['es-ES', 'es', 'en-US', 'en']
        });
        
        // Override chrome property
        window.chrome = {
            runtime: {}
        };
        
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        
        // Add realistic plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                return [
                    {
                        0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
                        description: "Portable Document Format",
                        filename: "internal-pdf-viewer",
                        length: 1,
                        name: "Chrome PDF Plugin"
                    },
                    {
                        0: {type: "application/pdf", suffixes: "pdf", description: "Portable Document Format"},
                        description: "Portable Document Format",
                        filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                        length: 1,
                        name: "Chrome PDF Viewer"
                    }
                ];
            }
        });
    """)


def add_human_behavior(page: Page) -> None:
    """
    Add random human-like behaviors to avoid detection
    """
    # Random mouse movements (simplified version)
    page.evaluate("""
        () => {
            // Simulate random mouse movements
            let lastX = 0;
            let lastY = 0;
            
            setInterval(() => {
                const x = Math.random() * window.innerWidth;
                const y = Math.random() * window.innerHeight;
                
                const event = new MouseEvent('mousemove', {
                    clientX: x,
                    clientY: y,
                    bubbles: true
                });
                
                document.dispatchEvent(event);
                lastX = x;
                lastY = y;
            }, Math.random() * 5000 + 3000);
        }
    """)


def random_delay(min_seconds: float = 1.0, max_seconds: float = 3.0) -> None:
    """
    Add random delay to mimic human behavior
    """
    import time
    delay = random.uniform(min_seconds, max_seconds)
    time.sleep(delay)


def human_type(page: Page, selector: str, text: str, typing_delay: Optional[int] = None) -> None:
    """
    Type text with human-like delays
    """
    if typing_delay is None:
        typing_delay = random.randint(50, 150)
    
    element = page.locator(selector)
    element.click()
    
    for char in text:
        element.type(char, delay=typing_delay)
        if random.random() < 0.1:  # 10% chance of pause
            random_delay(0.1, 0.5)


def human_scroll(page: Page, distance: Optional[int] = None) -> None:
    """
    Scroll page with human-like behavior
    """
    if distance is None:
        distance = random.randint(300, 800)
    
    # Smooth scroll
    page.evaluate(f"""
        window.scrollBy({{
            top: {distance},
            behavior: 'smooth'
        }});
    """)
    
    random_delay(0.5, 1.5)


def setup_stealth_context(context: BrowserContext) -> None:
    """
    Configure browser context with stealth settings
    This is called once per browser context
    """
    # Set extra HTTP headers
    context.set_extra_http_headers({
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
    })


class StealthSession:
    """
    Context manager for stealth browsing sessions
    """
    def __init__(self, page: Page):
        self.page = page
    
    def __enter__(self):
        apply_stealth_to_page(self.page)
        add_human_behavior(self.page)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass
    
    def navigate(self, url: str, wait_until: str = 'networkidle') -> None:
        """Navigate with random delay"""
        random_delay(0.5, 2.0)
        self.page.goto(url, wait_until=wait_until)
        random_delay(1.0, 2.5)
    
    def click(self, selector: str) -> None:
        """Click with human-like delay"""
        random_delay(0.3, 1.0)
        self.page.locator(selector).click()
        random_delay(0.5, 1.5)
    
    def type_text(self, selector: str, text: str) -> None:
        """Type with human-like behavior"""
        human_type(self.page, selector, text)
    
    def scroll(self, distance: Optional[int] = None) -> None:
        """Scroll with human-like behavior"""
        human_scroll(self.page, distance)
