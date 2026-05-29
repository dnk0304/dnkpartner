#!/usr/bin/env python3
"""Quick test to capture BOE search page HTML"""

import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from playwright.sync_api import sync_playwright

def test_boe():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        
        page.goto("https://subastas.boe.es/subastas_ava.php", timeout=30000)
        page.wait_for_load_state('domcontentloaded')
        
        # Save HTML
        html = page.content()
        with open(project_root / 'scraper' / 'boe_form.html', 'w', encoding='utf-8') as f:
            f.write(html)
        
        print("✓ HTML saved to scraper/boe_form.html")
        
        # Find date input fields
        date_inputs = page.locator('input[type="text"]').all()
        print(f"\nFound {len(date_inputs)} text inputs")
        
        for i, inp in enumerate(date_inputs):
            try:
                name = inp.get_attribute('name')
                placeholder = inp.get_attribute('placeholder')
                print(f"  Input {i}: name='{name}', placeholder='{placeholder}'")
            except:
                pass
        
        input("Press Enter to close browser...")
        browser.close()

if __name__ == '__main__':
    test_boe()
