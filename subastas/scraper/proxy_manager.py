"""
Proxy Manager Module
Handles proxy rotation and configuration for web scrapers
"""
import os
import random
from typing import Optional, Dict
from urllib.parse import urlparse, unquote
from dotenv import load_dotenv

load_dotenv()

class ProxyManager:
    """Manages proxy rotation and configuration"""

    def __init__(self):
        # 'webshare' | 'iproyal' | 'brightdata' | 'zenrows' | 'none'
        self.proxy_provider = os.getenv('PROXY_PROVIDER', 'none')

        # Generic, provider-agnostic single-URL path (highest priority).
        # e.g. PROXY_URL=http://user:pass@p.webshare.io:80
        # Works for Webshare / IPRoyal / any HTTP(S) proxy with one env var.
        self.proxy_url = os.getenv('PROXY_URL')

        # BOE (a government gazette) is NOT anti-bot — Webshare datacenter is
        # enough. Residential (IPRoyal) is overkill here; reserve residential
        # for the anti-bot Trends sources (separate repo). Default for BOE is
        # PROXY_URL or the 'webshare' branch.

        # Bright Data (legacy, kept as-is)
        self.brightdata_username = os.getenv('BRIGHTDATA_USERNAME')
        self.brightdata_password = os.getenv('BRIGHTDATA_PASSWORD')
        self.brightdata_host = os.getenv('BRIGHTDATA_HOST', 'brd.superproxy.io:22225')

        self.zenrows_api_key = os.getenv('ZENROWS_API_KEY')

        # Webshare (datacenter — planned for BOE)
        self.webshare_host = os.getenv('WEBSHARE_HOST', 'p.webshare.io:80')
        self.webshare_username = os.getenv('WEBSHARE_USERNAME')
        self.webshare_password = os.getenv('WEBSHARE_PASSWORD')

        # IPRoyal (rotating residential)
        self.iproyal_host = os.getenv('IPROYAL_HOST', 'geo.iproyal.com:12321')
        self.iproyal_username = os.getenv('IPROYAL_USERNAME')
        self.iproyal_password = os.getenv('IPROYAL_PASSWORD')

        # Fallback to free proxy lists (less reliable, for dev/testing only)
        self.fallback_proxies = [
            # Add free proxies here if needed for testing
            # Format: 'http://proxy1.example.com:8080'
        ]

    def get_proxy_config(self) -> Optional[Dict[str, str]]:
        """
        Get proxy configuration for Playwright
        Returns: Dict with proxy settings or None (None == direct, no proxy)
        """
        # 1) Generic PROXY_URL wins — provider-neutral, one env var.
        if self.proxy_url:
            parsed = self._parse_proxy_url(self.proxy_url)
            if parsed:
                return parsed

        # 2) Named provider branches.
        if self.proxy_provider == 'webshare' and self.webshare_username:
            return self._build_proxy(self.webshare_host, self.webshare_username, self.webshare_password)
        elif self.proxy_provider == 'iproyal' and self.iproyal_username:
            return self._build_proxy(self.iproyal_host, self.iproyal_username, self.iproyal_password)
        elif self.proxy_provider == 'brightdata' and self.brightdata_username:
            return self._get_brightdata_proxy()
        elif self.proxy_provider == 'zenrows' and self.zenrows_api_key:
            # ZenRows uses API approach, not direct proxy
            return None
        elif self.fallback_proxies:
            return self._get_fallback_proxy()

        # 3) Nothing configured -> direct (no proxy). Preserves today's behavior.
        return None

    def _build_proxy(self, host: str, username: Optional[str], password: Optional[str]) -> Dict[str, str]:
        """Build a Playwright proxy dict from host[:port] + creds.

        `host` may already include a scheme; if not, default to http://.
        """
        server = host if '://' in host else f'http://{host}'
        cfg: Dict[str, str] = {'server': server}
        if username:
            cfg['username'] = username
        if password:
            cfg['password'] = password
        return cfg

    def _parse_proxy_url(self, url: str) -> Optional[Dict[str, str]]:
        """Parse a full proxy URL (http://user:pass@host:port) into the
        Playwright dict {server, [username], [password]}.

        Playwright wants the server WITHOUT embedded credentials; the user/pass
        go in their own fields. Returns None if the URL has no host.
        """
        if '://' not in url:
            url = f'http://{url}'
        parsed = urlparse(url)
        if not parsed.hostname:
            return None
        port = f':{parsed.port}' if parsed.port else ''
        server = f'{parsed.scheme}://{parsed.hostname}{port}'
        cfg: Dict[str, str] = {'server': server}
        if parsed.username:
            cfg['username'] = unquote(parsed.username)
        if parsed.password:
            cfg['password'] = unquote(parsed.password)
        return cfg

    def _get_brightdata_proxy(self) -> Dict[str, str]:
        """Configure Bright Data proxy"""
        return {
            'server': f'http://{self.brightdata_host}',
            'username': self.brightdata_username,
            'password': self.brightdata_password
        }

    def _get_fallback_proxy(self) -> Dict[str, str]:
        """Get random fallback proxy"""
        if not self.fallback_proxies:
            return None
        
        proxy_url = random.choice(self.fallback_proxies)
        
        # Parse proxy URL
        # Format: http://user:pass@host:port or http://host:port
        return {
            'server': proxy_url
        }
    
    def should_use_proxy(self) -> bool:
        """Check if proxy should be used.

        Generic PROXY_URL alone is enough to enable a proxy (provider-neutral).
        Otherwise a named provider must be selected AND have its creds present.
        With nothing set -> False -> direct scraping (no behavior change).
        """
        if self.proxy_url:
            return True
        return self.proxy_provider != 'none' and (
            (self.proxy_provider == 'webshare' and self.webshare_username is not None) or
            (self.proxy_provider == 'iproyal' and self.iproyal_username is not None) or
            self.brightdata_username is not None or
            self.zenrows_api_key is not None or
            len(self.fallback_proxies) > 0
        )


def get_random_user_agent() -> str:
    """
    Return a random realistic user agent
    """
    user_agents = [
        # Chrome on Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        
        # Chrome on macOS
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        
        # Firefox on Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        
        # Safari on macOS
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        
        # Edge on Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    ]
    
    return random.choice(user_agents)


def get_browser_context_config(proxy_manager: ProxyManager) -> Dict:
    """
    Get browser context configuration with stealth settings
    """
    config = {
        'user_agent': get_random_user_agent(),
        'viewport': {
            'width': 1920,
            'height': 1080
        },
        'locale': 'es-ES',
        'timezone_id': 'Europe/Madrid',
        'permissions': ['geolocation'],
        'geolocation': {
            'latitude': 28.1235,
            'longitude': -15.4362
        },
        'extra_http_headers': {
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
    }
    
    # Add proxy if available
    if proxy_manager.should_use_proxy():
        proxy_config = proxy_manager.get_proxy_config()
        if proxy_config:
            config['proxy'] = proxy_config
    
    return config
