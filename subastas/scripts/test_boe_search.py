#!/usr/bin/env python3
"""Debug script to check BOE search results"""

import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from scraper.core.browser_manager import BrowserManager
from scraper.core.stealth import random_delay

def test_boe_search():
    """Test different BOE search URL formats"""
    
    bm = BrowserManager()
    page = bm.get_page(stealth=True)
    
    # Test URL 1: Simple status filter for finished auctions
    test_url = "https://subastas.boe.es/subastas_ava.php?campo[0]=SUBASTA.ESTADO&dato[0]=CE"
    
    print(f"\nTesting URL: {test_url}")
    print("=" * 80)
    
    try:
        page.goto(test_url, wait_until='domcontentloaded', timeout=30000)
        random_delay(3, 5)
        
        # Try to find any results
        html = page.content()
        
        # Save HTML for inspection
        with open(project_root / 'scraper' / 'boe_test_results.html', 'w', encoding='utf-8') as f:
            f.write(html)
        
        print("✓ HTML saved to scraper/boe_test_results.html")
        
        # Check for results
        results = page.locator('.resultado-busqueda').all()
        print(f"Found {len(results)} results with '.resultado-busqueda'")
        
        results_alt = page.locator('.resultado-subasta').all()
        print(f"Found {len(results_alt)} results with '.resultado-subasta'")
        
        results_alt2 = page.locator('.resultado').all()
        print(f"Found {len(results_alt2)} results with '.resultado'")
        
        # Check for no results message
        no_results = page.locator('.sin-resultados').count()
        print(f"No results message: {no_results > 0}")
        
        # Try to extract first result BOE ID if any
        if len(results) > 0:
            first_item = results[0]
            print("\nFirst result HTML:")
            print(first_item.inner_html()[:500])
        
    finally:
        bm.close_page(page)
        bm.cleanup()

if __name__ == '__main__':
    test_boe_search()
