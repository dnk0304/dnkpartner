#!/usr/bin/env python3
"""Debug script to capture BOE search results HTML"""

import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from playwright.sync_api import sync_playwright
import time

def capture_results_html():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        
        try:
            # Navigate to search page
            print("Navigating to BOE search...")
            page.goto("https://subastas.boe.es/subastas_ava.php", timeout=30000)
            page.wait_for_load_state('domcontentloaded')
            time.sleep(2)
            
            # Wait for form
            page.wait_for_selector('#desdeFP', timeout=10000)
            
            # Fill form
            print("Filling form...")
            page.fill('#desdeFP', '2020-02-01')
            time.sleep(0.5)
            page.fill('#hastaFP', '2020-02-29')
            time.sleep(0.5)
            page.select_option('#mostrar', '500')
            time.sleep(0.5)
            
            # Submit
            print("Submitting form...")
            submit_button = page.locator('input[type="submit"][value="Buscar"]').first
            submit_button.click()
            
            # Wait for results
            time.sleep(5)
            page.wait_for_load_state('domcontentloaded', timeout=30000)
            time.sleep(3)
            
            # Save HTML
            html = page.content()
            with open(project_root / 'scraper' / 'boe_results.html', 'w', encoding='utf-8') as f:
                f.write(html)
            
            print("Results HTML saved to scraper/boe_results.html")
            
            # Check for result elements
            print("\nLooking for result elements...")
            
            results1 = page.locator('.resultado-busqueda').all()
            print(f"  .resultado-busqueda: {len(results1)}")
            
            results2 = page.locator('.resultado-subasta').all()
            print(f"  .resultado-subasta: {len(results2)}")
            
            results3 = page.locator('.resultado').all()
            print(f"  .resultado: {len(results3)}")
            
            results4 = page.locator('[class*="resultado"]').all()
            print(f"  [class*=\"resultado\"]: {len(results4)}")
            
            # Check for pagination
            print("\nLooking for pagination...")
            next1 = page.locator('a:has-text("Siguiente")').all()
            print(f"  a:has-text(\"Siguiente\"): {len(next1)}")
            
            next2 = page.locator('a.siguiente').all()
            print(f"  a.siguiente: {len(next2)}")
            
            # Get page title
            title = page.title()
            print(f"\nPage title: {title}")
            
            input("Press Enter to close browser...")
            
        finally:
            browser.close()

if __name__ == '__main__':
    capture_results_html()
