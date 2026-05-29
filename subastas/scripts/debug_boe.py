#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Debug BOE Portal - Check actual HTML structure
"""

import sys
from playwright.sync_api import sync_playwright
import time

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def debug_boe():
    print("🔍 Debugging BOE Portal Structure...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # Show browser
        page = browser.new_page()
        
        # Go to BOE search page
        url = "https://subastas.boe.es/subastas_ava.php"
        print(f"\n📍 Navigating to: {url}")
        page.goto(url, timeout=30000)
        time.sleep(3)
        
        # Try to find any auction listings
        print("\n🔎 Looking for auction elements...")
        
        # Save screenshot
        page.screenshot(path="boe_debug.png")
        print("📸 Screenshot saved as boe_debug.png")
        
        # Get page title
        title = page.title()
        print(f"📄 Page title: {title}")
        
        # Try different selectors
        selectors = [
            'tr[id^="idSub"]',
            '.resultado',
            '.resultado-busqueda',
            'table tr',
            '[class*="subasta"]',
            '[id*="Sub"]'
        ]
        
        for selector in selectors:
            count = page.locator(selector).count()
            print(f"  {selector}: {count} elements")
        
        # Get page HTML (first 5000 chars)
        html = page.content()[:5000]
        print(f"\n📝 HTML Preview:\n{html}\n")
        
        input("\nPress Enter to close browser...")
        browser.close()

if __name__ == '__main__':
    debug_boe()
