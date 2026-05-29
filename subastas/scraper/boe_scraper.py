"""
BOE Scraper Module
Handles Discovery Mode and Pulse Mode for BOE auctions
"""
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
from db import upsert_auction, mark_auction_finished
from proxy_manager import ProxyManager, get_browser_context_config
from stealth import apply_stealth_to_page, random_delay, StealthSession
import time
import re

def scrape_boe_new_auctions(province: str = 'Las Palmas', max_pages: int = 5) -> int:
    """
    Discovery Mode: Scrape BOE search results for new auctions
    Returns: Number of new auctions found
    """
    new_count = 0
    proxy_manager = ProxyManager()
    
    with sync_playwright() as p:
        # Launch browser with stealth args
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ]
        )
        
        # Create context with proxy and stealth settings
        context_config = get_browser_context_config(proxy_manager)
        context = browser.new_context(**context_config)
        page = context.new_page()
        
        # Apply stealth measures
        apply_stealth_to_page(page)
        
        try:
            # Navigate to BOE subastas search with human-like delay
            search_url = f"https://subastas.boe.es/subastas_ava.php?campo[0]=SUBASTA.CODPROV&dato[0]={get_province_code(province)}"
            print(f"🌐 Navigating to: {search_url}")
            
            random_delay(1.0, 3.0)  # Random delay before navigation
            page.goto(search_url, wait_until='networkidle')
            random_delay(2.0, 4.0)  # Random delay after page load
            
            # Wait for results to load
            page.wait_for_selector('.resultado-busqueda, .sin-resultados', timeout=10000)
            
            # Check if there are results
            if page.locator('.sin-resultados').count() > 0:
                print("No auctions found for this province.")
                browser.close()
                return 0
            
            # Parse auction listings
            auction_items = page.locator('.resultado-busqueda').all()
            
            for item in auction_items[:20]:  # Limit to first 20 for demo
                try:
                    # Extract basic info from listing
                    title_elem = item.locator('.resultado-titulo')
                    title = title_elem.inner_text() if title_elem.count() > 0 else 'Unknown'
                    
                    # Extract BOE ID from link
                    link_elem = item.locator('a').first
                    link = link_elem.get_attribute('href') if link_elem.count() > 0 else ''
                    boe_id = extract_boe_id(link)
                    
                    if not boe_id:
                        continue
                    
                    # Extract other details (these selectors are examples - adjust based on actual BOE HTML)
                    appraisal_text = item.inner_text()
                    appraisal_value = extract_currency(appraisal_text, 'Valor')
                    current_bid = extract_currency(appraisal_text, 'Puja')
                    
                    # Create auction data
                    auction_data = {
                        'boe_id': boe_id,
                        'title': title.strip(),
                        'category': categorize_auction(title),
                        'province': province,
                        'municipality': extract_municipality(appraisal_text),
                        'status': 'ACTIVE',
                        'appraisal_value': appraisal_value or 100000,  # Default if not found
                        'current_bid': current_bid,
                        'published_at': datetime.now() - timedelta(days=5),  # Estimate
                        'ends_at': datetime.now() + timedelta(days=7),  # Estimate
                        'image_url': 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop'
                    }
                    
                    # Save to database
                    upsert_auction(auction_data)
                    new_count += 1
                    
                except Exception as e:
                    print(f"Error parsing auction item: {e}")
                    continue
            
        except Exception as e:
            print(f"❌ Error during BOE scraping: {e}")
        finally:
            context.close()
            browser.close()
    
    return new_count

def update_active_auction_bids(boe_id: str) -> bool:
    """
    Pulse Mode: Visit auction detail page and update current bid
    Returns: True if successfully updated
    """
    proxy_manager = ProxyManager()
    
    with sync_playwright() as p:
        # Launch with stealth settings
        browser = p.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled']
        )
        
        context_config = get_browser_context_config(proxy_manager)
        context = browser.new_context(**context_config)
        page = context.new_page()
        apply_stealth_to_page(page)
        
        try:
            # Construct detail page URL
            detail_url = f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}"
            
            random_delay(1.0, 2.5)
            page.goto(detail_url, wait_until='networkidle')
            random_delay(1.5, 3.0)
            
            # Check if auction is still active
            status_elem = page.locator('.estado-subasta')
            if status_elem.count() > 0:
                status_text = status_elem.inner_text().lower()
                
                if 'cerrada' in status_text or 'finalizada' in status_text:
                    # Auction has ended
                    final_bid = extract_currency_from_page(page, 'Puja final')
                    mark_auction_finished(boe_id, final_bid)
                    context.close()
                    browser.close()
                    return True
            
            # Extract current bid
            current_bid = extract_currency_from_page(page, 'Puja actual')
            
            if current_bid:
                # Update in database
                auction_data = {
                    'boe_id': boe_id,
                    'current_bid': current_bid,
                    'status': 'ACTIVE',
                    'title': 'Updated',  # Will be ignored in upsert update
                    'category': 'Viviendas',
                    'province': 'Las Palmas',
                    'appraisal_value': 0,
                    'published_at': datetime.now(),
                    'ends_at': datetime.now()
                }
                upsert_auction(auction_data)
                print(f"📊 Updated bid for {boe_id}: €{current_bid:,.2f}")
            
            context.close()
            browser.close()
            return True
            
        except Exception as e:
            print(f"❌ Error updating auction {boe_id}: {e}")
            context.close()
            browser.close()
            return False

# Helper functions
def get_province_code(province: str) -> str:
    """Map province name to BOE code"""
    codes = {
        'Las Palmas': '35',
        'Santa Cruz de Tenerife': '38',
        'Madrid': '28',
        'Barcelona': '08',
        # Add more as needed
    }
    return codes.get(province, '35')

def extract_boe_id(url: str) -> str:
    """Extract BOE ID from URL"""
    match = re.search(r'idSub=([A-Z0-9-]+)', url)
    return match.group(1) if match else ''

def extract_currency(text: str, label: str) -> float:
    """Extract currency value from text"""
    pattern = f"{label}[:\\s]+([0-9.,]+)\\s*€"
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        value_str = match.group(1).replace('.', '').replace(',', '.')
        return float(value_str)
    return 0.0

def extract_currency_from_page(page, label: str) -> float:
    """Extract currency from page content"""
    try:
        text = page.inner_text('body')
        return extract_currency(text, label)
    except:
        return 0.0

def extract_municipality(text: str) -> str:
    """Extract municipality from auction text"""
    # Simple heuristic - improve based on actual data
    if 'Gran Canaria' in text:
        return 'Las Palmas de Gran Canaria'
    return None

def categorize_auction(title: str) -> str:
    """Categorize auction based on title"""
    title_lower = title.lower()
    
    if any(word in title_lower for word in ['vivienda', 'piso', 'apartamento', 'ático', 'casa']):
        return 'Viviendas'
    elif any(word in title_lower for word in ['garaje', 'parking', 'plaza']):
        return 'Garajes'
    elif any(word in title_lower for word in ['local', 'comercial']):
        return 'Locales'
    elif any(word in title_lower for word in ['terreno', 'solar', 'parcela']):
        return 'Terrenos'
    elif any(word in title_lower for word in ['coche', 'vehículo', 'turismo', 'bmw', 'mercedes']):
        return 'Turismos'
    elif any(word in title_lower for word in ['moto', 'motocicleta']):
        return 'Motocicletas'
    elif any(word in title_lower for word in ['barco', 'yate', 'embarcación']):
        return 'Barcos'
    else:
        return 'Otros inmuebles'
