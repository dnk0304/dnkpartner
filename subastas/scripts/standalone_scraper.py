#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Standalone BOE Scraper - No complex dependencies
Scrapes live auctions directly from BOE portal
"""

import sys
import os
import sqlite3
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("❌ Playwright not installed. Installing...")
    os.system("pip install playwright")
    os.system("playwright install chromium")
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# Database path
DB_PATH = Path(__file__).parent.parent / "data" / "database" / "prod.db"

# BOE URLs
BASE_URL = "https://subastas.boe.es"
SEARCH_URL = f"{BASE_URL}/subastas_ava.php"

# Province codes (official BOE codes)
PROVINCE_CODES = {
    'Madrid': '28', 'Barcelona': '08', 'Valencia': '46', 'Sevilla': '41',
    'Málaga': '29', 'Alicante': '03', 'Murcia': '30', 'Cádiz': '11',
    'Zaragoza': '50', 'Las Palmas': '35', 'Vizcaya': '48', 'Córdoba': '14',
    'Valladolid': '47', 'Granada': '18', 'A Coruña': '15', 'Asturias': '33',
    'Santa Cruz de Tenerife': '38', 'Pontevedra': '36', 'Toledo': '45',
    'Illes Balears': '07', 'Tarragona': '43', 'Jaén': '23', 'Girona': '17',
    'Cantabria': '39', 'Castellón': '12', 'Badajoz': '06', 'Almería': '04',
    'Huelva': '21', 'Lleida': '25', 'León': '24', 'Burgos': '09',
    'Navarra': '31', 'Albacete': '02', 'Salamanca': '37', 'La Rioja': '26',
    'Cáceres': '10', 'Lugo': '27', 'Ourense': '32', 'Guipúzcoa': '20',
    'Guadalajara': '19', 'Huesca': '22', 'Ciudad Real': '13', 'Ávila': '05',
    'Cuenca': '16', 'Teruel': '44', 'Segovia': '40', 'Zamora': '49',
    'Palencia': '34', 'Álava': '01', 'Soria': '42'
}

def extract_boe_id(url: str) -> Optional[str]:
    """Extract BOE ID from URL"""
    match = re.search(r'idSub=([^&]+)', url)
    return match.group(1) if match else None

def extract_currency(text: str) -> Optional[float]:
    """Extract currency value from text"""
    # Look for patterns like: 123.456,78 € or 123.456 €
    match = re.search(r'([\d.]+(?:,\d{2})?)\s*€', text.replace('\n', ' '))
    if match:
        value_str = match.group(1).replace('.', '').replace(',', '.')
        try:
            return float(value_str)
        except:
            return None
    return None

def extract_date(text: str) -> Optional[datetime]:
    """Extract date from text"""
    # Look for date patterns like: 31/12/2025 14:30
    match = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})', text)
    if match:
        day, month, year, hour, minute = match.groups()
        try:
            return datetime(int(year), int(month), int(day), int(hour), int(minute))
        except:
            return None
    return None

def categorize_auction(title: str, description: str) -> str:
    """Categorize auction based on title and description"""
    text = (title + " " + description).lower()
    
    if any(word in text for word in ['piso', 'vivienda', 'apartamento', 'ático', 'casa', 'duplex']):
        return 'Viviendas'
    elif any(word in text for word in ['local', 'oficina', 'nave']):
        return 'Locales'
    elif any(word in text for word in ['garaje', 'parking', 'plaza de garaje']):
        return 'Garajes'
    elif any(word in text for word in ['terreno', 'parcela', 'solar', 'finca rústica']):
        return 'Terrenos'
    elif any(word in text for word in ['turismo', 'vehículo', 'coche', 'automóvil']):
        return 'Turismos'
    elif any(word in text for word in ['moto', 'motocicleta', 'scooter']):
        return 'Motocicletas'
    elif any(word in text for word in ['barco', 'embarcación', 'yate']):
        return 'Barcos'
    else:
        return 'Otros inmuebles'

def scrape_boe_province(page, province: str, max_pages: int = 5) -> List[Dict]:
    """Scrape BOE auctions for a specific province or all"""
    
    # Handle "all" provinces case
    if province.lower() == 'all' or not province:
        province_code = None
        province = 'Todas las provincias'
    else:
        province_code = PROVINCE_CODES.get(province)
        if not province_code:
            print(f"  ⚠️  Unknown province: {province}")
            return []
    
    auctions = []
    
    try:
        # Build search URL for active auctions in this province
        # Try without filters first to see if there are any auctions at all
        if province_code:
            search_url = f"{SEARCH_URL}?campo[0]=SUBASTA.CODPROV&dato[0]={province_code}"
        else:
            search_url = SEARCH_URL  # All provinces
        
        print(f"  🔗 {search_url}")
        
        # Set user agent to avoid blocking
        page.set_extra_http_headers({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        page.goto(search_url, timeout=30000, wait_until='networkidle')
        time.sleep(3)
        
        # Wait for results to load
        try:
            page.wait_for_selector('.resultado-busqueda, .sin-resultados, .no-results', timeout=10000)
        except:
            pass
        
        # Check if there are any results
        no_results_selectors = ['.sin-resultados', '.no-results', 'text=/No se han encontrado/i', 'text=/Sin resultados/i']
        has_no_results = any(page.locator(selector).count() > 0 for selector in no_results_selectors)
        
        if has_no_results:
            print(f"  📭 No auctions found")
            return []
        
        pages_scraped = 0
        
        while pages_scraped < max_pages:
            pages_scraped += 1
            
            # Find all auction items on current page - try multiple selectors
            items = page.locator('.resultado-busqueda').all()
            if not items:
                items = page.locator('.resultado-subasta').all()
            if not items:
                items = page.locator('tr[id^="idSub"]').all()
            if not items:
                items = page.locator('.resultado').all()
            
            # Debug: save screenshot and HTML if no items found
            if not items:
                screenshot_path = f"boe_debug_{province}_{pages_scraped}.png"
                page.screenshot(path=screenshot_path)
                print(f"    ⚠️  No items found. Screenshot saved: {screenshot_path}")
                
                # Try to get page text
                body_text = page.locator('body').inner_text()[:500]
                print(f"    Page text preview: {body_text}")
                break
            
            if not items:
                print(f"    No items found on page {pages_scraped}")
                break
            
            print(f"    Page {pages_scraped}: Found {len(items)} items")
            
            for item in items:
                try:
                    # Get the full text content
                    text = item.inner_text()
                    
                    # Extract BOE ID from link
                    link = item.locator('a').first.get_attribute('href') if item.locator('a').count() > 0 else ''
                    boe_id = extract_boe_id(link)
                    
                    if not boe_id:
                        continue
                    
                    # Extract title
                    title_elem = item.locator('.resultado-titulo, .titulo, strong').first
                    title = title_elem.inner_text().strip() if title_elem.count() > 0 else 'Subasta'
                    
                    # Extract values
                    appraisal_value = extract_currency(text)
                    
                    # Extract end date
                    ends_at = extract_date(text)
                    if not ends_at:
                        ends_at = datetime.now() + timedelta(days=30)
                    
                    # Categorize
                    category = categorize_auction(title, text)
                    
                    auction = {
                        'boe_id': boe_id,
                        'title': title[:200],
                        'category': category,
                        'province': province,
                        'status': 'ACTIVE',
                        'source': 'BOE',
                        'appraisal_value': appraisal_value or 100000,
                        'current_bid': None,
                        'minimum_bid': appraisal_value * 0.5 if appraisal_value else 50000,
                        'boe_link': f"{BASE_URL}/detalleSubasta.php?idSub={boe_id}",
                        'published_at': datetime.now() - timedelta(days=10),
                        'ends_at': ends_at,
                    }
                    
                    auctions.append(auction)
                    
                except Exception as e:
                    print(f"      ⚠️  Error parsing item: {e}")
                    continue
            
            # Check for next page
            next_button = page.locator('a:has-text("Siguiente"), a:has-text(">")').first
            if next_button.count() == 0:
                break
            
            try:
                next_button.click(timeout=5000)
                time.sleep(2)
            except:
                break
        
        print(f"  ✅ Found {len(auctions)} auctions")
        return auctions
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return auctions

def save_to_database(auctions: List[Dict]):
    """Save auctions to SQLite database"""
    
    if not auctions:
        return 0, 0
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    new_count = 0
    updated_count = 0
    
    for auction in auctions:
        # Check if exists
        cursor.execute("SELECT id FROM Auction WHERE boeId = ?", (auction['boe_id'],))
        existing = cursor.fetchone()
        
        if existing:
            # Update
            cursor.execute("""
                UPDATE Auction SET
                    title = ?, category = ?, province = ?, status = ?,
                    appraisalValue = ?, currentBid = ?, minimumBid = ?,
                    boeLink = ?, endsAt = ?, updatedAt = ?
                WHERE boeId = ?
            """, (
                auction['title'], auction['category'], auction['province'], auction['status'],
                auction['appraisal_value'], auction['current_bid'], auction['minimum_bid'],
                auction['boe_link'], auction['ends_at'].isoformat(), datetime.now().isoformat(),
                auction['boe_id']
            ))
            updated_count += 1
        else:
            # Insert
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
    print("🚀 STANDALONE BOE SCRAPER - LIVE AUCTIONS")
    print("=" * 70)
    
    # Parse arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == 'all':
            provinces = ['all']  # Special case: search all provinces
        elif sys.argv[1] == 'test':
            provinces = ['Madrid', 'Barcelona', 'Valencia']
        else:
            provinces = sys.argv[1].split(',')
    else:
        provinces = ['all']  # Default to all provinces
    
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    
    print(f"\n📍 Provinces: {len(provinces)}")
    print(f"📄 Max pages per province: {max_pages}")
    print()
    
    total_new = 0
    total_updated = 0
    total_found = 0
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        for i, province in enumerate(provinces, 1):
            print(f"\n[{i}/{len(provinces)}] 🔍 {province}")
            
            try:
                auctions = scrape_boe_province(page, province, max_pages)
                total_found += len(auctions)
                
                if auctions:
                    new, updated = save_to_database(auctions)
                    total_new += new
                    total_updated += updated
                    print(f"  💾 Saved: {new} new, {updated} updated")
                
                time.sleep(1)  # Be nice to the server
                
            except Exception as e:
                print(f"  ❌ Error: {e}")
                continue
        
        browser.close()
    
    print("\n" + "=" * 70)
    print("📊 SCRAPING COMPLETE")
    print("=" * 70)
    print(f"  Found: {total_found} auctions")
    print(f"  New: {total_new}")
    print(f"  Updated: {total_updated}")
    print("=" * 70)

if __name__ == '__main__':
    main()
