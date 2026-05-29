"""
Proxy Manager Module
Handles proxy rotation and configuration for web scrapers
"""
import os
import random
from typing import Optional, Dict
from dotenv import load_dotenv

load_dotenv()

class ProxyManager:
    """Manages proxy rotation and configuration"""
    
    def __init__(self):
        self.proxy_provider = os.getenv('PROXY_PROVIDER', 'none')  # 'brightdata', 'zenrows', or 'none'
        self.brightdata_username = os.getenv('BRIGHTDATA_USERNAME')
        self.brightdata_password = os.getenv('BRIGHTDATA_PASSWORD')
        self.brightdata_host = os.getenv('BRIGHTDATA_HOST', 'brd.superproxy.io:22225')
        
        self.zenrows_api_key = os.getenv('ZENROWS_API_KEY')
        
        # Fallback to free proxy lists (less reliable, for dev/testing only)
        self.fallback_proxies = [
            # Add free proxies here if needed for testing
            # Format: 'http://proxy1.example.com:8080'
        ]
        
    def get_proxy_config(self) -> Optional[Dict[str, str]]:
        """
        Get proxy configuration for Playwright
        Returns: Dict with proxy settings or None
        """
        if self.proxy_provider == 'brightdata' and self.brightdata_username:
            return self._get_brightdata_proxy()
        elif self.proxy_provider == 'zenrows' and self.zenrows_api_key:
            # ZenRows uses API approach, not direct proxy
            return None
        elif self.fallback_proxies:
            return self._get_fallback_proxy()
        
        return None
    
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
        """Check if proxy should be used"""
        return self.proxy_provider != 'none' and (
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
