# Quick check script
import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    page.goto("https://subastas.boe.es/")
    print("✅ Browser opened. Please manually:")
    print("  1. Click 'Buscar' (Search)")
    print("  2. Select 'Celebrándose' (Active)")
    print("  3. Click submit")
    print("  4. Check how many results you see")
    print("\nWaiting... (Press Ctrl+C to close)")
    try:
        time.sleep(120)  # Wait 2 minutes
    except KeyboardInterrupt:
        pass
    browser.close()
