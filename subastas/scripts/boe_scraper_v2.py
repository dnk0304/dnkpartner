#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOE Scraper V2 - Works with actual BOE portal search form
"""

import sys
import sqlite3
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

DB_PATH = Path(__file__).parent.parent / "data" / "database" / "prod.db"
BASE_URL = "https://subastas.boe.es"

def extract_boe_id(url: str) -> Optional[str]:
    """Extract BOE ID from URL"""
    match = re.search(r'idSub=([^&]+)', url)
    return match.group(1) if match else None

def extract_currency(text: str) -> Optional[float]:
    """Extract currency value from text"""
    match = re.search(r'([\d.]+(?:,\d{2})?)\s*€', text.replace('\n', ' '))
    if match:
        value_str = match.group(1).replace('.', '').replace(',', '.')
        try:
            return float(value_str)
        except:
            return None
    return None

def categorize_auction(title: str) -> str:
    """Categorize auction based on title"""
    text = title.lower()
    
    if any(word in text for word in ['piso', 'vivienda', 'apartamento', 'ático', 'casa']):
        return 'Viviendas'
    elif any(word in text for word in ['local', 'oficina', 'nave']):
        return 'Locales'
    elif any(word in text for word in ['garaje', 'parking', 'plaza']):
        return 'Garajes'
    elif any(word in text for word in ['terreno', 'parcela', 'solar', 'finca']):
        return 'Terrenos'
    elif any(word in text for word in ['turismo', 'vehículo', 'coche']):
        return 'Turismos'
    elif any(word in text for word in ['moto']):
        return 'Motocicletas'
    elif any(word in text for word in ['barco', 'embarcación']):
        return 'Barcos'
    else:
        return 'Otros inmuebles'

def scrape_boe_all_active(page, max_results: int = 100) -> List[Dict]:
    """Scrape all active auctions from BOE"""
    
    print("  🔍 Navigating to BOE search page...")
    page.goto(f"{BASE_URL}/subastas_ava.php", timeout=30000)
    time.sleep(2)
    
    print("  📝 Filling search form...")
    
    # Select "Celebrándose" (Active) status
    try:
        celebrating_radio = page.locator('input[type="radio"][value*="celebr"], input[type="radio"] + label:has-text("Celebrándose")')
        if celebrating_radio.count() > 0:
            page.click('input[type="radio"] + label:has-text("Celebrándose")')
            print("    ✓ Selected 'Celebrándose' status")
        else:
            # Try alternative: check radio by value
            page.check('input[type="radio"][value="CE"]')  # CE = Celebrándose
            print("    ✓ Selected active auctions")
    except Exception as e:
        print(f"    ⚠️  Could not select status: {e}")
    
    time.sleep(1)
    
    # Submit the form
    try:
        submit_button = page.locator('button[type="submit"], input[type="submit"], button:has-text("Buscar")')
        if submit_button.count() > 0:
            submit_button.first.click()
            print("    ✓ Submitted search form")
            time.sleep(4)
        else:
            print("    ⚠️  No submit button found")
            return []
    except Exception as e:
        print(f"    ❌ Error submitting form: {e}")
        return []
    
    # Now we should be on the results page
    print("  📊 Parsing results...")
    
    # Wait for results
    try:
        page.wait_for_selector('.resultado-busqueda, table, .sin-resultados', timeout=10000)
    except:
        print("    ⚠️  Timeout waiting for results")
    
    # Check for no results
    if page.locator('text=/sin resultados/i, text=/no se han encontrado/i').count() > 0:
        print("  📭 No active auctions found")
        return []
    
    auctions = []
    
    # Try to find auction items - try multiple selectors
    selectors_to_try = [
        '.resultado-busqueda',
        'tr[id^="idSub"]',
        'table tbody tr',
        '.resultado'
    ]
    
    items = []
    for selector in selectors_to_try:
        items = page.locator(selector).all()
        if items:
            print(f"    ✓ Found {len(items)} items using selector: {selector}")
            break
    
    if not items:
        print(f"    ⚠️  No items found with any selector")
        page.screenshot(path="boe_results_debug.png")
        print(f"    📸 Screenshot saved: boe_results_debug.png")
        body_text = page.locator('body').inner_text()[:1000]
        print(f"    Page content:\n{body_text}")
        return []
    
    for idx, item in enumerate(items[:max_results]):
        try:
            text = item.inner_text()
            
            # Get link to auction detail
            link_elem = item.locator('a').first
            if link_elem.count() == 0:
                continue
            
            href = link_elem.get_attribute('href')
            boe_id = extract_boe_id(href)
            
            if not boe_id:
                continue
            
            # Get title
            title = link_elem.inner_text().strip() if link_elem.inner_text() else f"Subasta {boe_id}"
            
            # Extract value
            appraisal_value = extract_currency(text) or 100000
            
            # Categorize
            category = categorize_auction(title)
            
            auction = {
                'boe_id': boe_id,
                'title': title[:200],
                'category': category,
                'province': 'España',  # Will be updated from detail page
                'status': 'ACTIVE',
                'source': 'BOE',
                'appraisal_value': appraisal_value,
                'current_bid': None,
                'minimum_bid': appraisal_value * 0.5,
                'boe_link': f"{BASE_URL}/detalleSubasta.php?idSub={boe_id}",
                'published_at': datetime.now() - timedelta(days=10),
                'ends_at': datetime.now() + timedelta(days=30),
            }
            
            auctions.append(auction)
            
            if (idx + 1) % 10 == 0:
                print(f"    ... parsed {idx + 1} auctions")
            
        except Exception as e:
            print(f"      ⚠️  Error parsing item: {e}")
            continue
    
    print(f"  ✅ Found {len(auctions)} active auctions")
    return auctions

def save_to_database(auctions: List[Dict]):
    """Save auctions to database"""
    
    if not auctions:
        return 0, 0
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    new_count = 0
    updated_count = 0
    
    for auction in auctions:
        cursor.execute("SELECT id FROM Auction WHERE boeId = ?", (auction['boe_id'],))
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute("""
                UPDATE Auction SET
                    title = ?, category = ?, status = ?,
                    appraisalValue = ?, minimumBid = ?,
                    boeLink = ?, updatedAt = ?
                WHERE boeId = ?
            """, (
                auction['title'], auction['category'], auction['status'],
                auction['appraisal_value'], auction['minimum_bid'],
                auction['boe_link'], datetime.now().isoformat(),
                auction['boe_id']
            ))
            updated_count += 1
        else:
            cursor.execute("""
                INSERT INTO Auction (
                    boeId, title, category, province, municipality, status, source,
                    appraisalValue, currentBid, minimumBid, boeLink,
                    publishedAt, endsAt, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                auction['boe_id'], auction['title'], auction['category'], auction['province'],
                auction['province'], auction['status'], auction['source'],
                auction['appraisal_value'], auction['current_bid'], auction['minimum_bid'],
                auction['boe_link'], auction['published_at'].isoformat(), auction['ends_at'].isoformat(),
                datetime.now().isoformat(), datetime.now().isoformat()
            ))
            new_count += 1
    
    conn.commit()
    conn.close()
    
    return new_count, updated_count

def main():
    print("=" * 70)
    print("🚀 BOE SCRAPER V2 - ACTIVE AUCTIONS")
    print("=" * 70)
    
    max_results = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    
    print(f"\n📊 Max results: {max_results}\n")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = context.new_page()
        
        try:
            auctions = scrape_boe_all_active(page, max_results)
            
            if auctions:
                print("\n💾 Saving to database...")
                new, updated = save_to_database(auctions)
                print(f"  ✅ Saved: {new} new, {updated} updated")
            
        finally:
            browser.close()
    
    print("\n" + "=" * 70)
    print("✅ SCRAPING COMPLETE")
    print("=" * 70)

if __name__ == '__main__':
    main()
