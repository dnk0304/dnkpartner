#!/usr/bin/env python3
"""
Standalone Vehicle Scraper
Scrapes vehicle auctions from BOE without relative imports
"""
import sys
import os
import re
import time
import random
import string
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

# Import CAPTCHA solver
try:
    from captcha_solver import handle_boe_captcha, check_tesseract_installation
    CAPTCHA_SOLVER_AVAILABLE = True
except ImportError:
    CAPTCHA_SOLVER_AVAILABLE = False
    print("⚠️ CAPTCHA solver not available")

SCRIPT_DIR = Path(__file__).parent
DB_PATH = SCRIPT_DIR.parent / "data" / "database" / "prod.db"

BASE_URL = "https://subastas.boe.es"
SEARCH_URL = f"{BASE_URL}/subastas_ava.php"

# Vehicle category codes
VEHICLE_CATEGORIES = {
    'turismos': {'code': 'V', 'category': 'Turismos', 'label': 'Vehículos'},
    'motocicletas': {'code': 'M', 'category': 'Motocicletas', 'label': 'Motocicletas'},
    'industriales': {'code': 'I', 'category': 'Vehículos Industriales', 'label': 'Vehículos Industriales'},
    'barcos': {'code': 'E', 'category': 'Embarcaciones', 'label': 'Embarcaciones'},
}

def generate_cuid() -> str:
    return 'c' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=24))

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

def extract_location(text: str) -> tuple:
    """Extract province and municipality from text"""
    province = 'Desconocida'
    municipality = None
    
    # Try to extract province
    province_patterns = [
        r'Provincia:\s*([^\n]+)',
        r'(\w+(?:\s+\w+)?)\s*\(provincia\)',
    ]
    
    for pattern in province_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            province = match.group(1).strip()
            break
    
    # Try to extract municipality
    municipality_patterns = [
        r'Localidad:\s*([^\n]+)',
        r'Municipio:\s*([^\n]+)',
    ]
    
    for pattern in municipality_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            municipality = match.group(1).strip()
            break
    
    return province, municipality

def scrape_vehicle_category(page, vehicle_type: str, max_pages: int = 10) -> List[Dict]:
    """Scrape a specific vehicle category using form-based navigation"""
    config = VEHICLE_CATEGORIES.get(vehicle_type)
    if not config:
        return []
    
    print(f"\n🚗 Scraping {config['label']}...")
    
    vehicles = []
    
    try:
        # Go to search page (form-based, not URL parameters)
        page.goto(SEARCH_URL, wait_until='networkidle', timeout=30000)
        time.sleep(2)
        
        # Select "Vehículos" radio button
        try:
            # Click the label for Vehículos
            page.click('text=Vehículos', timeout=5000)
            print(f"  ✓ Selected Vehículos")
            time.sleep(1)
        except Exception as e:
            print(f"  ⚠️ Could not select Vehículos: {e}")
        
        # Select vehicle subcategory if not "all"
        if vehicle_type != 'turismos':  # turismos is the default "Todos"
            subcategory_map = {
                'motocicletas': 'Motocicletas',
                'industriales': 'Industriales',
                'barcos': 'Otros',  # Embarcaciones are under "Otros"
            }
            if vehicle_type in subcategory_map:
                try:
                    page.click(f'text={subcategory_map[vehicle_type]}', timeout=3000)
                    print(f"  ✓ Selected {subcategory_map[vehicle_type]}")
                    time.sleep(0.5)
                except:
                    pass
        
        # Select "Celebrándose" (active auctions)
        try:
            page.click('text=Celebrándose', timeout=5000)
            print(f"  ✓ Selected Celebrándose status")
            time.sleep(0.5)
        except Exception as e:
            print(f"  ⚠️ Could not select status: {e}")
        
        # Submit form
        try:
            page.click('button:has-text("Buscar"), input[value="Buscar"]', timeout=5000)
            print(f"  ✓ Submitted search")
            page.wait_for_load_state('networkidle', timeout=30000)
            time.sleep(2)
        except Exception as e:
            print(f"  ⚠️ Form submission error: {e}")
        
        # Handle CAPTCHA if present
        if CAPTCHA_SOLVER_AVAILABLE:
            if not handle_boe_captcha(page):
                print(f"  ⚠️ CAPTCHA solving failed")
        
        for page_num in range(1, max_pages + 1):
            print(f"  📄 Page {page_num}...")
            
            # Find auction items
            items = page.locator('.resultado-busqueda, .auction-item, table.resultado tbody tr').all()
            
            if not items:
                # Try alternative selectors
                items = page.locator('a[href*="detalleSubasta"]').all()
            
            if not items:
                print(f"    📭 No more vehicles found")
                break
            
            for item in items:
                try:
                    # Get text content
                    text = item.inner_text()
                    
                    # Get link
                    link = item.locator('a').first
                    href = link.get_attribute('href') if link.count() > 0 else ''
                    
                    boe_id = extract_boe_id(href)
                    if not boe_id:
                        continue
                    
                    # Extract title
                    title_elem = item.locator('.titulo-subasta, h3, td:first-child').first
                    title = title_elem.inner_text().strip() if title_elem.count() > 0 else f"Vehículo {boe_id}"
                    
                    # Extract values
                    appraisal = extract_currency(text) or 0
                    province, municipality = extract_location(text)
                    
                    vehicle = {
                        'id': generate_cuid(),
                        'boeId': boe_id,
                        'title': title,
                        'category': config['category'],
                        'province': province,
                        'municipality': municipality,
                        'status': 'CELEBRANDOSE',
                        'auctionType': 'JUDICIAL',
                        'appraisalValue': appraisal,
                        'source': f"BOE_{config['label'].upper().replace(' ', '_')}",
                        'boeLink': f"{BASE_URL}/detalleSubasta.php?idSub={boe_id}",
                    }
                    
                    vehicles.append(vehicle)
                
                except Exception as e:
                    print(f"    ⚠️ Error parsing vehicle: {e}")
            
            # Try to go to next page
            next_btn = page.locator('a:has-text("Siguiente"), .pagination a.next, a[rel="next"]').first
            if next_btn.count() > 0:
                next_btn.click()
                time.sleep(2)
            else:
                break
        
        print(f"  ✅ Found {len(vehicles)} {config['label']}")
    
    except Exception as e:
        print(f"  ❌ Error scraping {config['label']}: {e}")
    
    return vehicles

def save_vehicles(vehicles: List[Dict]) -> tuple:
    """Save vehicles to database"""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    inserted = 0
    updated = 0
    
    for vehicle in vehicles:
        try:
            # Check if exists
            cur.execute("SELECT id FROM Auction WHERE boeId = ?", (vehicle['boeId'],))
            existing = cur.fetchone()
            
            now = datetime.now().isoformat()
            
            if existing:
                # Update
                cur.execute("""
                    UPDATE Auction SET 
                        title = ?, category = ?, province = ?, municipality = ?,
                        status = ?, appraisalValue = ?, source = ?, boeLink = ?,
                        updatedAt = ?
                    WHERE boeId = ?
                """, (
                    vehicle['title'], vehicle['category'], vehicle['province'],
                    vehicle['municipality'], vehicle['status'], vehicle['appraisalValue'],
                    vehicle['source'], vehicle['boeLink'], now, vehicle['boeId']
                ))
                updated += 1
            else:
                # Insert
                cur.execute("""
                    INSERT INTO Auction (id, boeId, title, category, province, municipality,
                        status, auctionType, appraisalValue, source, boeLink, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    vehicle['id'], vehicle['boeId'], vehicle['title'], vehicle['category'],
                    vehicle['province'], vehicle['municipality'], vehicle['status'],
                    vehicle['auctionType'], vehicle['appraisalValue'], vehicle['source'],
                    vehicle['boeLink'], now, now
                ))
                inserted += 1
        
        except Exception as e:
            print(f"  ⚠️ Error saving {vehicle['boeId']}: {e}")
    
    conn.commit()
    conn.close()
    
    return inserted, updated

def scrape_all_vehicles(max_pages: int = 10):
    """Scrape all vehicle categories"""
    print("=" * 60)
    print("🚗 VEHICLE SCRAPER")
    print("=" * 60)
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        results = {}
        total_inserted = 0
        total_updated = 0
        
        for vehicle_type in VEHICLE_CATEGORIES.keys():
            vehicles = scrape_vehicle_category(page, vehicle_type, max_pages)
            
            if vehicles:
                inserted, updated = save_vehicles(vehicles)
                results[vehicle_type] = len(vehicles)
                total_inserted += inserted
                total_updated += updated
        
        browser.close()
    
    print("\n" + "=" * 60)
    print("✅ VEHICLE SCRAPING COMPLETED")
    print("=" * 60)
    print(f"Total: {sum(results.values())} vehicles")
    print(f"New: {total_inserted}, Updated: {total_updated}")
    for vtype, count in results.items():
        print(f"  {vtype}: {count}")
    print("=" * 60)
    
    return results

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Scrape vehicle auctions from BOE')
    parser.add_argument('--pages', type=int, default=10, help='Max pages per category')
    args = parser.parse_args()
    
    scrape_all_vehicles(max_pages=args.pages)
