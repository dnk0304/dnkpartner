#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOE Scraper V3 - Province-by-province to avoid "too many results" error
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

# Province codes
PROVINCE_CODES = {
    'Madrid': '28', 'Barcelona': '08', 'Valencia': '46', 'Sevilla': '41',
    'Málaga': '29', 'Alicante': '03', 'Murcia': '30', 'Cádiz': '11',
    'Zaragoza': '50', 'Las Palmas': '35', 'Vizcaya': '48', 'Córdoba': '14',
    'Valladolid': '47', 'Granada': '18', 'A Coruña': '15', 'Asturias': '33',
    'Santa Cruz de Tenerife': '38', 'Pontevedra': '36', 'Toledo': '45',
    'Illes Balears': '07'
}

def extract_boe_id(url: str) -> Optional[str]:
    match = re.search(r'idSub=([^&]+)', url)
    return match.group(1) if match else None

def extract_currency(text: str) -> Optional[float]:
    match = re.search(r'([\d.]+(?:,\d{2})?)\s*€', text.replace('\n', ' '))
    if match:
        value_str = match.group(1).replace('.', '').replace(',', '.')
        try:
            return float(value_str)
        except:
            return None
    return None

def categorize_auction(title: str) -> str:
    text = title.lower()
    if any(w in text for w in ['piso', 'vivienda', 'apartamento', 'ático', 'casa']):
        return 'Viviendas'
    elif any(w in text for w in ['local', 'oficina', 'nave']):
        return 'Locales'
    elif any(w in text for w in ['garaje', 'parking']):
        return 'Garajes'
    elif any(w in text for w in ['terreno', 'parcela', 'solar']):
        return 'Terrenos'
    elif any(w in text for w in ['turismo', 'vehículo', 'coche']):
        return 'Turismos'
    elif any(w in text for w in ['moto']):
        return 'Motocicletas'
    elif any(w in text for w in ['barco']):
        return 'Barcos'
    return 'Otros inmuebles'

def scrape_province(page, province: str, province_code: str) -> List[Dict]:
    """Scrape active auctions for one province"""
    
    print(f"\n  [{province}] 🔍 Searching...")
    
    # Navigate to search page
    page.goto(f"{BASE_URL}/subastas_ava.php", timeout=30000)
    time.sleep(1)
    
    # Fill province in search form
    try:
        # Look for province dropdown/input
        province_input = page.locator('select[name*="provincia"], select[name*="PROV"], input[name*="provincia"]')
        if province_input.count() > 0:
            province_input.first.select_option(value=province_code)
            print(f"    ✓ Selected province: {province}")
        time.sleep(0.5)
    except Exception as e:
        print(f"    ⚠️  Could not select province: {e}")
    
    # Select "Celebrándose" status
    try:
        celebrating_option = page.locator('input[type="radio"] + label:has-text("Celebrándose")')
        if celebrating_option.count() > 0:
            celebrating_option.first.click()
        time.sleep(0.5)
    except:
        pass
    
    # Submit
    try:
        submit_btn = page.locator('button[type="submit"], input[type="submit"]')
        if submit_btn.count() > 0:
            submit_btn.first.click()
            time.sleep(3)
    except Exception as e:
        print(f"    ❌ Error submitting: {e}")
        return []
    
    # Check for results
    if page.locator('text=/sin resultados/i, text=/no se han encontrado/i').count() > 0:
        print(f"    📭 No auctions")
        return []
    
    if page.locator('text=/error/i, text=/excesivo/i').count() > 0:
        print(f"    ⚠️  Too many results error")
        return []
    
    # Find auction items
    auctions = []
    selectors = ['.resultado-busqueda', 'tr[id^="idSub"]', 'table tbody tr']
    
    items = []
    for sel in selectors:
        items = page.locator(sel).all()
        if items:
            break
    
    if not items:
        print(f"    📭 No items found")
        return []
    
    print(f"    ✓ Found {len(items)} auctions")
    
    for item in items[:50]:  # Limit per province
        try:
            text = item.inner_text()
            link = item.locator('a').first
            if link.count() == 0:
                continue
            
            href = link.get_attribute('href')
            boe_id = extract_boe_id(href)
            if not boe_id:
                continue
            
            title = link.inner_text().strip()[:200] or f"Subasta {boe_id}"
            appraisal = extract_currency(text) or 100000
            
            auctions.append({
                'boe_id': boe_id,
                'title': title,
                'category': categorize_auction(title),
                'province': province,
                'status': 'ACTIVE',
                'source': 'BOE',
                'appraisal_value': appraisal,
                'current_bid': None,
                'minimum_bid': appraisal * 0.5,
                'boe_link': f"{BASE_URL}/detalleSubasta.php?idSub={boe_id}",
                'published_at': datetime.now() - timedelta(days=10),
                'ends_at': datetime.now() + timedelta(days=30),
            })
        except:
            continue
    
    return auctions

def save_to_db(auctions: List[Dict]):
    if not auctions:
        return 0, 0
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    new, updated = 0, 0
    
    for a in auctions:
        cursor.execute("SELECT id FROM Auction WHERE boeId = ?", (a['boe_id'],))
        if cursor.fetchone():
            cursor.execute("""
                UPDATE Auction SET title = ?, category = ?, status = ?,
                appraisalValue = ?, minimumBid = ?, boeLink = ?, updatedAt = ?
                WHERE boeId = ?
            """, (a['title'], a['category'], a['status'], a['appraisal_value'],
                  a['minimum_bid'], a['boe_link'], datetime.now().isoformat(), a['boe_id']))
            updated += 1
        else:
            cursor.execute("""
                INSERT INTO Auction (boeId, title, category, province, municipality,
                status, source, appraisalValue, currentBid, minimumBid, boeLink,
                publishedAt, endsAt, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (a['boe_id'], a['title'], a['category'], a['province'], a['province'],
                  a['status'], a['source'], a['appraisal_value'], a['current_bid'],
                  a['minimum_bid'], a['boe_link'], a['published_at'].isoformat(),
                  a['ends_at'].isoformat(), datetime.now().isoformat(),
                  datetime.now().isoformat()))
            new += 1
    
    conn.commit()
    conn.close()
    return new, updated

def main():
    print("=" * 70)
    print("🚀 BOE SCRAPER V3 - PROVINCE BY PROVINCE")
    print("=" * 70)
    
    provinces = list(PROVINCE_CODES.items())
    if len(sys.argv) > 1:
        limit = int(sys.argv[1])
        provinces = provinces[:limit]
    
    print(f"\n📍 Scraping {len(provinces)} provinces\n")
    
    total_found = 0
    all_auctions = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = context.new_page()
        
        for i, (province, code) in enumerate(provinces, 1):
            print(f"[{i}/{len(provinces)}]", end="")
            try:
                auctions = scrape_province(page, province, code)
                all_auctions.extend(auctions)
                total_found += len(auctions)
                if auctions:
                    print(f"    💾 {len(auctions)} auctions")
                time.sleep(2)  # Be nice to server
            except Exception as e:
                print(f"    ❌ Error: {e}")
        
        browser.close()
    
    print("\n" + "=" * 70)
    print(f"📊 Total found: {total_found} auctions")
    
    if all_auctions:
        print("💾 Saving to database...")
        new, updated = save_to_db(all_auctions)
        print(f"✅ Saved: {new} new, {updated} updated")
    
    print("=" * 70)

if __name__ == '__main__':
    main()
