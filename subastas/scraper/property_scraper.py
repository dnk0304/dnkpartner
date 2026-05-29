#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
COMPREHENSIVE PROPERTY SCRAPER
Handles: ACTIVE, FINISHED, and PRE-AUCTION properties

⚠️  DEPRECATED: This scraper is deprecated in favor of category_scraper.py
    The new category scraper provides:
    - More accurate categorization using BOE form filters
    - Systematic coverage of all 90 filter combinations
    - Better progress tracking and resume capability
    - Optimized for 500 results per page
    
    Please use: python scraper/category_scraper.py --help
"""

import sys
import os
import re
import time
import json
import random
import string
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
from enum import Enum

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright
from database.adapter import DatabaseAdapter

# Import CAPTCHA solver
try:
    from captcha_solver import handle_boe_captcha, check_tesseract_installation
    CAPTCHA_SOLVER_AVAILABLE = True
except ImportError:
    CAPTCHA_SOLVER_AVAILABLE = False
    print("⚠️ CAPTCHA solver not available")

# Paths
SCRIPT_DIR = Path(__file__).parent
PROGRESS_DIR = SCRIPT_DIR / "progress"

# Ensure progress directory exists
PROGRESS_DIR.mkdir(parents=True, exist_ok=True)

# BOE Configuration
BASE_URL = "https://subastas.boe.es"
SEARCH_URL = f"{BASE_URL}/subastas_ava.php"

class ScrapeMode(Enum):
    ACTIVE = "CE"  # Celebrándose
    FINISHED = "FI"  # Finalizada
    PRE_AUCTION = "PR"  # Próxima (if exists)

# Property categories
PROPERTY_CATEGORIES = [
    'Viviendas', 'Locales', 'Garajes', 'Naves industriales',
    'Terrenos', 'Fincas rústicas', 'Trasteros', 'Otros inmuebles'
]

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
    if any(w in text for w in ['piso', 'vivienda', 'apartamento', 'ático', 'casa', 'chalet']):
        return 'Viviendas'
    elif any(w in text for w in ['local comercial', 'local', 'oficina', 'bajo comercial']):
        return 'Locales'
    elif any(w in text for w in ['garaje', 'parking', 'plaza de garaje']):
        return 'Garajes'
    elif any(w in text for w in ['nave industrial', 'nave']):
        return 'Naves industriales'
    elif any(w in text for w in ['terreno', 'parcela', 'solar']):
        return 'Terrenos'
    elif any(w in text for w in ['finca rústica', 'finca']):
        return 'Fincas rústicas'
    elif any(w in text for w in ['trastero']):
        return 'Trasteros'
    return 'Otros inmuebles'

def is_property(title: str) -> bool:
    """Check if auction is a property (not vehicle, boat, etc)"""
    text = title.lower()
    
    # Exclude non-properties
    non_property_keywords = [
        'turismo', 'vehículo', 'coche', 'automóvil', 'furgoneta', 'camión',
        'moto', 'motocicleta', 'ciclomotor',
        'barco', 'embarcación', 'yate', 'lancha',
        'maquinaria', 'tractor', 'cosechadora',
        'aeronave', 'avión', 'helicóptero'
    ]
    
    if any(keyword in text for keyword in non_property_keywords):
        return False
    
    # Property keywords
    property_keywords = [
        'piso', 'vivienda', 'apartamento', 'ático', 'casa', 'chalet',
        'local', 'oficina', 'garaje', 'parking', 'plaza de garaje',
        'nave industrial', 'nave', 'terreno', 'parcela', 'solar',
        'finca rústica', 'finca', 'trastero', 'inmueble', 'edificio',
        'local comercial', 'bajo comercial'
    ]
    
    if any(keyword in text for keyword in property_keywords):
        return True
    
    # Default: assume property if not explicitly excluded
    return True

def generate_cuid() -> str:
    """Generate a CUID-like ID"""
    return 'c' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=24))

def load_progress(mode: str) -> Dict:
    progress_file = PROGRESS_DIR / f"{mode}_progress.json"
    if progress_file.exists():
        try:
            with open(progress_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {
        'mode': mode,
        'started_at': datetime.now().isoformat(),
        'last_page': 0,
        'total_scraped': 0,
        'completed': False
    }

def save_progress(mode: str, progress: Dict):
    progress_file = PROGRESS_DIR / f"{mode}_progress.json"
    progress['last_update'] = datetime.now().isoformat()
    with open(progress_file, 'w', encoding='utf-8') as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)

def scrape_properties(page, mode: ScrapeMode, max_pages: int = 100, start_page: int = 1) -> List[Dict]:
    """Scrape properties by mode (ACTIVE, FINISHED, or PRE_AUCTION)"""
    
    mode_names = {
        ScrapeMode.ACTIVE: "ACTIVE",
        ScrapeMode.FINISHED: "FINISHED",
        ScrapeMode.PRE_AUCTION: "PRE_AUCTION"
    }

    db_status_map = {
        ScrapeMode.ACTIVE: "CELEBRANDOSE",
        ScrapeMode.FINISHED: "CONCLUIDA_PORTAL",
        ScrapeMode.PRE_AUCTION: "PRE_AUCTION"
    }
    
    status_labels = {
        ScrapeMode.ACTIVE: "Celebrándose",
        ScrapeMode.FINISHED: "Finalizada",
        ScrapeMode.PRE_AUCTION: "Prox. apertura"  # Fixed: BOE uses "Prox. apertura" not "Próxima"
    }
    
    mode_name = mode_names[mode]
    status_label = status_labels[mode]
    db_status = db_status_map[mode]
    
    print(f"\n🔍 Scraping {mode_name} properties...")
    
    all_auctions = []
    
    try:
        # Navigate to search page
        print(f"  📡 Loading BOE portal...")
        page.goto(SEARCH_URL, wait_until='networkidle', timeout=30000)
        time.sleep(3)
        
        # Select status
        try:
            # Try clicking the status text
            page.click(f'text={status_label}', timeout=5000)
            print(f"  ✓ Selected '{status_label}' status")
        except:
            print(f"  ⚠️  Could not click '{status_label}', trying value...")
            try:
                page.check(f'input[value="{mode.value}"]', timeout=5000)
                print(f"  ✓ Checked {mode.value} status")
            except:
                print(f"  ⚠️  Could not select status, proceeding...")
        
        time.sleep(1)
        
        # Submit form
        try:
            submit_selectors = [
                'input[type="submit"]',
                'button[type="submit"]',
                'button:has-text("Buscar")',
                'input[value="Buscar"]'
            ]
            
            for selector in submit_selectors:
                try:
                    page.click(selector, timeout=2000)
                    print(f"  ✓ Submitted search")
                    break
                except:
                    continue
            
            page.wait_for_load_state('networkidle', timeout=30000)
            time.sleep(3)
            
            # Handle CAPTCHA if present
            if CAPTCHA_SOLVER_AVAILABLE:
                if not handle_boe_captcha(page):
                    print(f"  ⚠️  CAPTCHA solving failed, results may be limited")
            
        except Exception as e:
            print(f"  ⚠️  Form submission issue: {e}")
        
        # Scrape pages
        page_num = start_page
        
        while page_num <= max_pages:
            print(f"\n  📄 Page {page_num}...")
            
            # Parse current page
            auctions_on_page = parse_auction_page(page, mode, db_status)
            
            if not auctions_on_page:
                print(f"    📭 No more auctions on page {page_num}")
                break
            
            all_auctions.extend(auctions_on_page)
            print(f"    ✅ Found {len(auctions_on_page)} properties (Total: {len(all_auctions)})")
            
            # Look for next button
            try:
                next_selectors = [
                    'a:has-text("Siguiente")',
                    'a:has-text(">")',
                    'a.siguiente',
                    'a[rel="next"]',
                    f'a:has-text("{page_num + 1}")',
                ]
                
                next_clicked = False
                for selector in next_selectors:
                    try:
                        next_link = page.locator(selector).first
                        if next_link.count() > 0:
                            next_link.click(timeout=3000)
                            print(f"    ➡️  Going to page {page_num + 1}...")
                            page.wait_for_load_state('networkidle', timeout=15000)
                            time.sleep(2)
                            next_clicked = True
                            break
                    except:
                        continue
                
                if not next_clicked:
                    print(f"    ⏸️  No next button, stopping")
                    break
                    
            except Exception as e:
                print(f"    ⏸️  Pagination error: {e}")
                break
            
            page_num += 1
        
        print(f"\n  ✅ Scraped {page_num} pages, found {len(all_auctions)} {mode_name} properties")
        return all_auctions
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return all_auctions

def parse_auction_page(page, mode: ScrapeMode, db_status: str) -> List[Dict]:
    """Parse auctions from current page"""
    auctions = []
    
    try:
        items = []
        selectors_to_try = [
            '.resultado-busqueda',
            'tr[id^="idSub"]',
            'table tbody tr',
            '.listado-resultado tr',
            'div.resultado',
        ]
        
        for sel in selectors_to_try:
            try:
                items = page.locator(sel).all()
                if items and len(items) > 0:
                    break
            except:
                continue
        
        if not items:
            return []
        
        for i, item in enumerate(items):
            try:
                text = item.inner_text()
                links = item.locator('a').all()
                
                if not links:
                    continue
                
                for link in links:
                    try:
                        href = link.get_attribute('href')
                        if not href or 'idSub=' not in href:
                            continue
                        
                        boe_id = extract_boe_id(href)
                        if not boe_id:
                            continue
                        
                        title = link.inner_text().strip()
                        if not title or len(title) < 10:
                            title = f"Subasta {boe_id}"
                        title = title[:200]
                        
                        # FILTER: Only properties
                        if not is_property(title):
                            continue
                        
                        appraisal = extract_currency(text) or 100000
                        
                        # Determine dates based on status
                        if mode == ScrapeMode.ACTIVE:
                            published_at = datetime.now() - timedelta(days=10)
                            ends_at = datetime.now() + timedelta(days=20)
                        elif mode == ScrapeMode.FINISHED:
                            published_at = datetime.now() - timedelta(days=90)
                            ends_at = datetime.now() - timedelta(days=30)
                        else:  # PRE_AUCTION
                            published_at = datetime.now()
                            ends_at = None
                        
                        auctions.append({
                            'boe_id': boe_id,
                            'title': title,
                            'category': categorize_auction(title),
                            'province': 'Desconocida',
                            'status': db_status,
                            'source': 'BOE',
                            'appraisal_value': appraisal,
                            'current_bid': appraisal * 0.7 if mode != ScrapeMode.PRE_AUCTION else None,
                            'minimum_bid': appraisal * 0.5,
                            'boe_link': f"{BASE_URL}/detalleSubasta.php?idSub={boe_id}",
                            'published_at': published_at,
                            'ends_at': ends_at,
                        })
                        
                        break
                    except:
                        continue
                        
            except:
                continue
        
        return auctions
        
    except:
        return auctions

def save_to_db(auctions: List[Dict]) -> tuple:
    if not auctions:
        return 0, 0
    
    db = DatabaseAdapter()
    conn = db.connect()
    cursor = conn.cursor()
    new, updated, skipped = 0, 0, 0
    
    for a in auctions:
        try:
            if db.db_type == 'sqlite':
                cursor.execute("SELECT id, status FROM Auction WHERE boeId = ?", (a['boe_id'],))
            else:
                cursor.execute('SELECT id, status FROM "Auction" WHERE "boeId" = %s', (a['boe_id'],))
            existing = cursor.fetchone()
            
            db.upsert_auction(a)
            if existing:
                updated += 1
            else:
                new += 1
        except Exception as e:
            print(f"  ⚠️  Error saving {a['boe_id']}: {e}")
            skipped += 1
            continue
    
    conn.close()
    
    if skipped > 0:
        print(f"  📊 Skipped: {skipped} (errors)")
    
    return new, updated

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Comprehensive Property Scraper')
    parser.add_argument('--mode', type=str, choices=['active', 'finished', 'pre'], 
                       default='active', help='Scraping mode')
    parser.add_argument('--pages', type=int, default=100, help='Max pages to scrape')
    parser.add_argument('--start-page', type=int, default=1, help='Starting page')
    parser.add_argument('--headless', action='store_true', help='Run in headless mode')
    
    args = parser.parse_args()
    
    # Map mode string to enum
    mode_map = {
        'active': ScrapeMode.ACTIVE,
        'finished': ScrapeMode.FINISHED,
        'pre': ScrapeMode.PRE_AUCTION
    }
    
    mode = mode_map[args.mode]
    mode_name = args.mode.upper()
    
    print("=" * 70)
    print(f"🚀 PROPERTY SCRAPER - {mode_name} MODE")
    print("=" * 70)
    
    progress = load_progress(args.mode)
    
    print(f"\n📊 Configuration:")
    print(f"   Mode: {mode_name}")
    print(f"   Max pages: {args.pages}")
    print(f"   Start page: {args.start_page}")
    print(f"   Headless: {args.headless}")
    print(f"\n⏰ Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    start_time = time.time()
    
    with sync_playwright() as p:
        print("🌐 Launching browser...")
        browser = p.chromium.launch(
            headless=args.headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
            ]
        )
        
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()
        
        try:
            auctions = scrape_properties(page, mode, args.pages, args.start_page)
            
            if auctions:
                print(f"\n💾 Saving {len(auctions)} properties to database...")
                new, updated = save_to_db(auctions)
                print(f"  ✅ Saved: {new} new, {updated} updated")
                
                progress['total_scraped'] = len(auctions)
                progress['new'] = new
                progress['updated'] = updated
                progress['completed'] = True
            else:
                print("\n⚠️  No properties found!")
            
        except Exception as e:
            print(f"\n❌ Fatal error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            print("\n🔒 Closing browser...")
            browser.close()
    
    save_progress(args.mode, progress)
    
    elapsed = time.time() - start_time
    print("\n" + "=" * 70)
    print(f"✅ {mode_name} PROPERTY SCRAPING COMPLETED")
    print("=" * 70)
    print(f"Total properties: {progress.get('total_scraped', 0):,}")
    print(f"New: {progress.get('new', 0):,}")
    print(f"Updated: {progress.get('updated', 0):,}")
    print(f"Time: {elapsed:.2f}s ({elapsed/60:.2f} min)")
    print("=" * 70)

if __name__ == '__main__':
    main()
