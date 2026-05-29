#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quick test to debug the BOE form selection
"""
import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright
import time

BASE_URL = "https://subastas.boe.es"
SEARCH_URL = f"{BASE_URL}/subastas_ava.php"

def test_form():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()
        
        print("\n🌐 Navigating to BOE search page...")
        page.goto(SEARCH_URL, wait_until='networkidle', timeout=30000)
        time.sleep(3)
        
        # Take a screenshot to see the page
        page.screenshot(path='boe_form_test.png')
        print("📸 Screenshot saved to boe_form_test.png")
        
        # Test selecting Tipo de subasta
        print("\n🎯 Testing Tipo de subasta selection...")
        try:
            page.click('text=Judicial', timeout=5000)
            print("✓ Judicial selected")
            time.sleep(1)
        except Exception as e:
            print(f"❌ Failed to select Judicial: {e}")
        
        # Test selecting Estado
        print("\n🎯 Testing Estado selection...")
        try:
            page.click('text=Celebrándose', timeout=5000)
            print("✓ Celebrándose selected")
            time.sleep(1)
        except Exception as e:
            print(f"❌ Failed to select Celebrándose: {e}")
        
        # Test selecting Tipo de bien
        print("\n🎯 Testing Tipo de bien selection...")
        try:
            page.click('text=Inmuebles', timeout=5000)
            print("✓ Inmuebles selected")
            time.sleep(1)
        except Exception as e:
            print(f"❌ Failed to select Inmuebles: {e}")
        
        # Check for province selector
        print("\n🎯 Checking province selector...")
        try:
            # Try different possible selectors
            selectors_to_try = [
                'select#id_subasta_ava\\.bien\\.codProvincia',
                'select[name="dato[IDL][CP]"]',
                'select[name*="Provincia"]',
                'select[name*="provincia"]'
            ]
            
            for selector in selectors_to_try:
                print(f"  Trying selector: {selector}")
                try:
                    if page.locator(selector).count() > 0:
                        print(f"  ✓ Found with selector: {selector}")
                        # Get options
                        options = page.locator(f"{selector} option").all()
                        print(f"  Found {len(options)} province options")
                        for i, opt in enumerate(options[:5]):  # Show first 5
                            print(f"    - {opt.inner_text()}")
                        break
                except:
                    print(f"  ✗ Not found with: {selector}")
        except Exception as e:
            print(f"❌ Error checking province selector: {e}")
        
        # Try selecting 500 results per page
        print("\n🎯 Testing results per page selector...")
        try:
            page.select_option('select[name="dato[pager][R]"]', '500')
            print("✓ Set to 500 results per page")
        except Exception as e:
            print(f"❌ Failed to set results per page: {e}")
        
        # Take another screenshot
        page.screenshot(path='boe_form_test_after_selections.png')
        print("\n📸 Screenshot after selections saved")
        
        # Submit form
        print("\n🎯 Testing form submission...")
        try:
            page.click('button:has-text("Buscar")', timeout=5000)
            page.wait_for_load_state('networkidle', timeout=30000)
            print("✓ Form submitted")
            time.sleep(2)
            
            # Check for results
            items = page.locator('.resultado-busqueda').all()
            if not items:
                items = page.locator('tr[id^="idSub"]').all()
            
            print(f"\n📊 Found {len(items)} result items on page")
            
            page.screenshot(path='boe_form_test_results.png')
            print("📸 Results screenshot saved")
            
        except Exception as e:
            print(f"❌ Form submission failed: {e}")
        
        print("\n⏸️  Pausing for 10 seconds to inspect...")
        time.sleep(10)
        
        browser.close()
        print("\n✅ Test complete!")

if __name__ == '__main__':
    test_form()
