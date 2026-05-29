"""
TEJU Scraper Module
Handles Pre-Auction data extraction from TEJU PDFs using OCR
"""
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
from db import upsert_auction
from proxy_manager import ProxyManager, get_browser_context_config
from stealth import apply_stealth_to_page, random_delay
import requests
import re
import os
from pathlib import Path

try:
    import pytesseract
    from pdf2image import convert_from_path
    from PIL import Image
    OCR_AVAILABLE = True
except ImportError:
    print("⚠️  OCR libraries not installed. Install pytesseract and pdf2image for full functionality.")
    OCR_AVAILABLE = False

def scrape_teju_pre_auctions(province: str = 'Las Palmas') -> int:
    """
    TEJU Scanner: Search for pre-auction notices and extract data via OCR
    Returns: Number of new pre-auctions found
    """
    new_count = 0
    pdf_dir = Path('scraper/temp_pdfs')
    pdf_dir.mkdir(exist_ok=True)
    proxy_manager = ProxyManager()
    
    with sync_playwright() as p:
        # Launch with stealth settings
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )
        
        context_config = get_browser_context_config(proxy_manager)
        context = browser.new_context(**context_config)
        page = context.new_page()
        apply_stealth_to_page(page)
        
        try:
            # Navigate to TEJU search
            teju_url = "https://www.administraciondejusticia.gob.es/paj/publico/citaciones/busqueda"
            print(f"🌐 Navigating to TEJU: {teju_url}")
            
            random_delay(1.0, 2.5)
            page.goto(teju_url, wait_until='networkidle')
            random_delay(2.0, 4.0)
            
            # Fill search form (example - adjust selectors based on actual TEJU site)
            # Search for "Subasta" + province
            search_input = page.locator('input[name="texto"]')
            if search_input.count() > 0:
                random_delay(0.5, 1.5)
                search_input.fill(f"subasta {province}")
            
            # Submit search
            submit_button = page.locator('button[type="submit"], input[type="submit"]')
            if submit_button.count() > 0:
                random_delay(0.5, 1.5)
                submit_button.first.click()
                page.wait_for_load_state('networkidle')
                random_delay(2.0, 3.0)
            
            # Find PDF links
            pdf_links = page.locator('a[href*=".pdf"]').all()
            
            print(f"📄 Found {len(pdf_links)} PDF documents")
            
            for idx, link in enumerate(pdf_links[:5]):  # Limit to 5 for demo
                try:
                    pdf_url = link.get_attribute('href')
                    if not pdf_url:
                        continue
                    
                    # Make URL absolute if relative
                    if pdf_url.startswith('/'):
                        pdf_url = f"https://www.administraciondejusticia.gob.es{pdf_url}"
                    
                    print(f"📥 Downloading PDF {idx + 1}: {pdf_url}")
                    
                    # Download PDF
                    pdf_path = pdf_dir / f"teju_{idx + 1}.pdf"
                    download_pdf(pdf_url, pdf_path)
                    
                    # Extract text using OCR
                    if OCR_AVAILABLE:
                        extracted_data = extract_auction_from_pdf(pdf_path, province)
                        
                        if extracted_data:
                            # Save to database
                            upsert_auction(extracted_data)
                            new_count += 1
                    else:
                        print("⚠️  OCR not available, skipping text extraction")
                    
                    # Clean up PDF
                    if pdf_path.exists():
                        pdf_path.unlink()
                    
                except Exception as e:
                    print(f"Error processing PDF {idx + 1}: {e}")
                    continue
            
        except Exception as e:
            print(f"❌ Error during TEJU scraping: {e}")
        finally:
            context.close()
            browser.close()
    
    return new_count

def download_pdf(url: str, save_path: Path) -> bool:
    """Download PDF from URL"""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        with open(save_path, 'wb') as f:
            f.write(response.content)
        
        return True
    except Exception as e:
        print(f"❌ Failed to download PDF: {e}")
        return False

def extract_auction_from_pdf(pdf_path: Path, province: str) -> dict:
    """
    Extract auction data from PDF using OCR
    Looks for patterns like "Finca nº", "Dirección", "Valor", etc.
    """
    if not OCR_AVAILABLE:
        return None
    
    try:
        # Convert first page of PDF to image
        images = convert_from_path(pdf_path, first_page=1, last_page=1, dpi=300)
        
        if not images:
            return None
        
        # Perform OCR on the first page
        text = pytesseract.image_to_string(images[0], lang='spa')
        
        print(f"📝 Extracted text length: {len(text)} characters")
        
        # Extract key information using regex patterns
        title = extract_property_title(text)
        address = extract_address(text)
        appraisal = extract_value(text, 'Valor|Tasación|Tipo')
        
        # Generate unique TEJU ID
        teju_id = f"TEJU-{datetime.now().strftime('%Y%m%d')}-{hash(text[:100]) % 10000:04d}"
        
        if title or address:
            auction_data = {
                'boe_id': teju_id,
                'title': title or f"Pre-Subasta en {province}",
                'category': categorize_from_text(text),
                'province': province,
                'municipality': extract_municipality_from_text(text, province),
                'status': 'TEJU',
                'appraisal_value': appraisal or 200000,
                'current_bid': None,
                'published_at': datetime.now(),
                'ends_at': datetime.now() + timedelta(days=30),  # Estimate
                'address': address,
                'pdf_url': str(pdf_path),
                'image_url': 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop'
            }
            
            return auction_data
        
        return None
        
    except Exception as e:
        print(f"❌ OCR extraction failed: {e}")
        return None

def extract_property_title(text: str) -> str:
    """Extract property title from OCR text"""
    # Look for common patterns
    patterns = [
        r'(?:Finca|Inmueble|Propiedad)[:\s]+([^\n]{10,100})',
        r'(?:Descripción)[:\s]+([^\n]{10,100})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    
    return ''

def extract_address(text: str) -> str:
    """Extract address from OCR text"""
    patterns = [
        r'(?:Dirección|Sita en|Ubicada en)[:\s]+([^\n]{10,150})',
        r'(?:Calle|Avenida|Plaza)[^,\n]{5,100}',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            address = match.group(1).strip() if match.lastindex else match.group(0).strip()
            return address
    
    return ''

def extract_value(text: str, keywords: str) -> float:
    """Extract monetary value from text"""
    pattern = f'(?:{keywords})[:\\s]+([0-9.,]+)\\s*(?:€|euros)'
    match = re.search(pattern, text, re.IGNORECASE)
    
    if match:
        value_str = match.group(1).replace('.', '').replace(',', '.')
        try:
            return float(value_str)
        except:
            return 0.0
    
    return 0.0

def categorize_from_text(text: str) -> str:
    """Categorize auction based on OCR text"""
    text_lower = text.lower()
    
    if any(word in text_lower for word in ['vivienda', 'piso', 'apartamento', 'casa']):
        return 'Viviendas'
    elif any(word in text_lower for word in ['garaje', 'parking']):
        return 'Garajes'
    elif any(word in text_lower for word in ['local', 'comercial']):
        return 'Locales'
    elif any(word in text_lower for word in ['terreno', 'solar']):
        return 'Terrenos'
    elif any(word in text_lower for word in ['finca', 'rústica']):
        return 'Fincas rústicas'
    else:
        return 'Otros inmuebles'

def extract_municipality_from_text(text: str, province: str) -> str:
    """Extract municipality from OCR text"""
    if province == 'Las Palmas':
        municipalities = [
            'Las Palmas de Gran Canaria',
            'Telde',
            'Santa Lucía',
            'Arucas',
            'Agüimes',
            'San Bartolomé de Tirajana'
        ]
        
        for muni in municipalities:
            if muni.lower() in text.lower():
                return muni
    
    return None
