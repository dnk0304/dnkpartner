"""
Settings Module
Environment detection and configuration management
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Project paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
SCRAPER_ROOT = Path(__file__).parent.parent
TEMP_DIR = SCRAPER_ROOT / 'temp_pdfs'
TEMP_DIR.mkdir(exist_ok=True)

# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'file:./prisma/dev.db')
DATABASE_TYPE = 'sqlite' if ('file:' in DATABASE_URL or '.db' in DATABASE_URL) else 'postgresql'

# Redis configuration (for Celery)
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# Scraper rate limiting
SCRAPE_DELAY_SECONDS = int(os.getenv('SCRAPE_DELAY_SECONDS', '120'))
SCRAPE_MAX_PAGES = int(os.getenv('SCRAPE_MAX_PAGES', '10'))
SCRAPE_MAX_ITEMS_PER_PAGE = int(os.getenv('SCRAPE_MAX_ITEMS_PER_PAGE', '20'))

# BOE rate limiting (30 min cooldown with safety margin)
BOE_COOLDOWN_MINUTES = int(os.getenv('BOE_COOLDOWN_MINUTES', '60'))
BOE_REQUEST_DELAY_SECONDS = float(os.getenv('BOE_REQUEST_DELAY_SECONDS', '2.0'))

# Proxy configuration
PROXY_PROVIDER = os.getenv('PROXY_PROVIDER', 'none')  # none, brightdata, zenrows
BRIGHTDATA_USERNAME = os.getenv('BRIGHTDATA_USERNAME', '')
BRIGHTDATA_PASSWORD = os.getenv('BRIGHTDATA_PASSWORD', '')
BRIGHTDATA_HOST = os.getenv('BRIGHTDATA_HOST', 'brd.superproxy.io:22225')

# Geocoding configuration
GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY', '')
NOMINATIM_USER_AGENT = os.getenv('NOMINATIM_USER_AGENT', 'SubastaPro/2.0')

# Stealth configuration
USE_STEALTH = os.getenv('USE_STEALTH', 'true').lower() == 'true'
HEADLESS_BROWSER = os.getenv('HEADLESS_BROWSER', 'true').lower() == 'true'

# OCR configuration
OCR_ENABLED = os.getenv('OCR_ENABLED', 'true').lower() == 'true'
TESSERACT_PATH = os.getenv('TESSERACT_PATH', '')  # Optional custom path

# Logging configuration
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
LOG_FILE = os.getenv('LOG_FILE', '')  # Empty means console only

# Development flags
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
DRY_RUN = os.getenv('DRY_RUN', 'false').lower() == 'true'

# Print configuration summary
def print_config():
    """Print current configuration"""
    print("=" * 60)
    print("SubastaPro Scraper Configuration")
    print("=" * 60)
    print(f"Database Type: {DATABASE_TYPE}")
    print(f"Database URL: {DATABASE_URL[:50]}...")
    print(f"Redis URL: {REDIS_URL}")
    print(f"Proxy Provider: {PROXY_PROVIDER}")
    print(f"Scrape Delay: {SCRAPE_DELAY_SECONDS}s")
    print(f"BOE Cooldown: {BOE_COOLDOWN_MINUTES} minutes")
    print(f"Stealth Mode: {USE_STEALTH}")
    print(f"Headless: {HEADLESS_BROWSER}")
    print(f"OCR Enabled: {OCR_ENABLED}")
    print(f"Debug Mode: {DEBUG}")
    print(f"Dry Run: {DRY_RUN}")
    print("=" * 60)
