#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Human-like TEJU Scraper
Scrapes pre-auction announcements from BOE's Tablón Edictal Judicial Único
"""

import sys
import io
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from pathlib import Path
import time
import random
from datetime import datetime, timedelta
import sqlite3
import re

# Database path
DB_PATH = Path(__file__).parent.parent / 'data' / 'database' / 'prod.db'

# Search terms for pre-auction announcements
SEARCH_TERMS = [
    "subasta inmuebles",
    "subasta vehiculos",
    "edicto subasta",
    "remate judicial",
]

def random_delay(min_sec=1.5, max_sec=4.0):
    """Human-like random delay"""
    time.sleep(random.uniform(min_sec, max_sec))

def get_realistic_viewport():
    """Return realistic viewport dimensions"""
    viewports = [
        {'width': 1920, 'height': 1080},
        {'width': 1366, 'height': 768},
        {'width': 1536, 'height': 864},
        {'width': 1440, 'height': 900},
    ]
    return random.choice(viewports)

def scrape_teju_boe(search_term: str = "subasta", max_results: int = 200):
    """
    Scrape TEJU edicts from BOE
    Uses human-like browsing behavior to avoid detection
    """
    print(f"\n🔍 Searching TEJU for: '{search_term}'")
    
    all_edicts = []
    
    with sync_playwright() as p:
        # Launch with human-like settings
        print("  🌐 Launching browser...")
        browser = p.chromium.launch(
            headless=False,  # Run visible to behave more human-like
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )
        
        # Create context with realistic settings
        viewport = get_realistic_viewport()
        context = browser.new_context(
            viewport=viewport,
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='es-ES',
            timezone_id='Europe/Madrid',
        )
        
        # Remove automation indicators
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            window.chrome = {runtime: {}};
        """)
        
        page = context.new_page()
        
        try:
            # Navigate to TEJU search
            print("  📡 Navigating to BOE TEJU search...")
            random_delay(2, 3.5)
            page.goto('https://boe.es/buscar/edictos_judiciales.php', wait_until='domcontentloaded', timeout=60000)
            random_delay(2.5, 4)
            
            # Fill search form like a human
            print(f"  ⌨️  Typing search term...")
            text_input = page.locator('input[name="dato[0]"]')
            
            # Type letter by letter with random delays
            for char in search_term:
                text_input.type(char)
                time.sleep(random.uniform(0.05, 0.15))
            
            random_delay(1, 2)
            
            # Set documents per page to 200
            print("  ⚙️  Configuring results...")
            page_size_select = page.locator('select[name="page_hits"]')
            page_size_select.select_option('200')
            random_delay(0.5, 1)
            
            # Click search button
            print("  🔎 Submitting search...")
            search_button = page.locator('button[type="submit"], input[value="Buscar"]')
            search_button.first.click(timeout=10000)
            
            # Wait for results with longer timeout
            random_delay(3, 5)
            page.wait_for_load_state('networkidle', timeout=60000)
            random_delay(2, 3)
            
            # Check if we got results
            try:
                results_text = page.locator('status p').first.inner_text(timeout=5000)
                print(f"  📊 {results_text}")
                
                # Extract number of results
                match = re.search(r'de ([\d.]+)', results_text)
                if match:
                    total_results = int(match.group(1).replace('.', ''))
                    print(f"  📈 Total edicts found: {total_results}")
            except:
                print("  ⚠️  Could not determine result count")
            
            # Parse results page
            print("  📄 Parsing edicts...")
            edicts = parse_teju_results(page)
            all_edicts.extend(edicts)
            print(f"  ✅ Found {len(edicts)} relevant edicts on page 1")
            
            # Get more pages if needed (limit to avoid overload)
            pages_to_scrape = min(3, max_results // 50)  # Max 3 pages
            
            for page_num in range(2, pages_to_scrape + 1):
                try:
                    print(f"\n  📄 Page {page_num}...")
                    random_delay(3, 5)  # Longer delay between pages
                    
                    # Click next page link
                    next_link = page.locator(f'a:has-text("{page_num}")')
                    if next_link.count() > 0:
                        next_link.first.click()
                        random_delay(3, 5)
                        page.wait_for_load_state('networkidle', timeout=60000)
                        random_delay(2, 3)
                        
                        edicts = parse_teju_results(page)
                        all_edicts.extend(edicts)
                        print(f"  ✅ Found {len(edicts)} relevant edicts on page {page_num}")
                    else:
                        print(f"  ⏸️  No more pages")
                        break
                        
                except Exception as e:
                    print(f"  ⚠️  Error on page {page_num}: {e}")
                    break
            
        except PlaywrightTimeout as e:
            print(f"  ❌ Timeout error: {e}")
        except Exception as e:
            print(f"  ❌ Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            print("  🔒 Closing browser...")
            random_delay(1, 2)
            context.close()
            browser.close()
    
    return all_edicts

def parse_teju_results(page):
    """
    Parse TEJU search results page
    Look for auction-related edicts
    """
    edicts = []
    
    try:
        # Get all result items
        items = page.locator('ul.lista_resultados > li').all()
        
        for item in items:
            try:
                # Extract text content
                full_text = item.inner_text()
                
                # Check if it's auction-related
                auction_keywords = ['subasta', 'remate', 'licitación', 'edicto de notificación']
                if not any(keyword in full_text.lower() for keyword in auction_keywords):
                    continue
                
                # Extract reference link
                link_elem = item.locator('a[href*="diario_boe"]')
                if link_elem.count() > 0:
                    link = link_elem.first.get_attribute('href')
                    if not link.startswith('http'):
                        link = f'https://boe.es{link}'
                    
                    # Extract BOE reference
                    ref_match = re.search(r'BOE-J-\d+-\d+', full_text)
                    boe_ref = ref_match.group(0) if ref_match else None
                    
                    # Extract date
                    date_match = re.search(r'(\d{2}/\d{2}/\d{4})', full_text)
                    pub_date = date_match.group(1) if date_match else None
                    
                    # Extract province/location
                    province_match = re.search(r'([A-ZÁÉÍÓÚ\s]+)\. Edicto', full_text)
                    location = province_match.group(1).strip() if province_match else None
                    
                    edict = {
                        'boe_reference': boe_ref,
                        'link': link,
                        'published_date': pub_date,
                        'location': location,
                        'full_text': full_text[:500],  # First 500 chars
                        'source': 'TEJU',
                        'scraped_at': datetime.now().isoformat(),
                    }
                    
                    edicts.append(edict)
                    
            except Exception as e:
                continue
        
    except Exception as e:
        print(f"  ⚠️  Error parsing results: {e}")
    
    return edicts

def save_edicts_to_db(edicts):
    """Save TEJU edicts to database"""
    if not edicts:
        return 0, 0
    
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    new_count = 0
    updated_count = 0
    
    for edict in edicts:
        try:
            # Check if exists
            cur.execute('SELECT id FROM Auction WHERE boeId = ?', (edict['boe_reference'],))
            exists = cur.fetchone()
            
            if not exists:
                # Insert as pre-auction lead
                cur.execute('''
                    INSERT INTO Auction (
                        boeId, title, externalUrl, status, auctionType,
                        province, scrapedAt, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    edict['boe_reference'],
                    f"TEJU Edict - {edict['location'] or 'Location TBD'}",
                    edict['link'],
                    'PRE_AUCTION',
                    'JUDICIAL',
                    edict['location'] or 'Desconocida',
                    edict['scraped_at'],
                    datetime.now().isoformat(),
                    datetime.now().isoformat(),
                ))
                new_count += 1
            else:
                updated_count += 1
        
        except Exception as e:
            print(f"  ⚠️  Error saving edict {edict.get('boe_reference')}: {e}")
            continue
    
    conn.commit()
    conn.close()
    
    return new_count, updated_count

def main():
    """Main execution"""
    print("=" * 70)
    print("🏛️  TEJU SCRAPER - BOE Judicial Edicts")
    print("=" * 70)
    print(f"⏰ Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    all_edicts = []
    
    # Search for different auction-related terms
    for search_term in SEARCH_TERMS[:2]:  # Limit to 2 searches
        edicts = scrape_teju_boe(search_term, max_results=200)
        all_edicts.extend(edicts)
        print(f"\n  ✅ Found {len(edicts)} edicts for '{search_term}'")
        
        # Pause between searches to be polite
        if search_term != SEARCH_TERMS[-1]:
            print(f"\n  ⏸️  Pausing before next search...")
            random_delay(10, 15)
    
    # Remove duplicates
    unique_edicts = {e['boe_reference']: e for e in all_edicts if e.get('boe_reference')}.values()
    unique_edicts = list(unique_edicts)
    
    print(f"\n📊 Total unique edicts found: {len(unique_edicts)}")
    
    if unique_edicts:
        print(f"\n💾 Saving to database...")
        new_count, updated_count = save_edicts_to_db(unique_edicts)
        print(f"  ✅ Saved: {new_count} new, {updated_count} already existed")
    else:
        print(f"\n⚠️  No auction-related edicts found")
        print("  This is normal - TEJU may not have new auction announcements at this time")
    
    print("\n" + "=" * 70)
    print("✅ TEJU SCRAPING COMPLETED")
    print("=" * 70)
    print(f"Total edicts: {len(unique_edicts)}")
    print(f"New: {new_count if unique_edicts else 0}")
    print(f"⏰ Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

if __name__ == "__main__":
    main()
