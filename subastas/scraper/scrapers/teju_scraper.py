"""
TEJU Scraper Module
Scrapes pre-auction judicial edicts from TEJU system
Extracts data from PDFs using OCR when available
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import html
from pathlib import Path
import re
import logging
import requests

from ..core.base_scraper import BaseScraper
from ..core.browser import get_browser_manager
from ..core.stealth import random_delay, human_type, human_scroll, StealthSession
from ..config.provinces import get_province_code
from ..config.categories import get_category_type
from ..config.settings import TEMP_DIR, OCR_ENABLED, TESSERACT_PATH
from ..database.adapter import get_database_adapter

logger = logging.getLogger(__name__)

# Try to import OCR libraries
try:
    import pytesseract
    from pdf2image import convert_from_path
    from PIL import Image
    
    if TESSERACT_PATH:
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
    
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    logger.warning("OCR libraries not available. Install: pip install pytesseract pdf2image Pillow")


class TEJUScraper(BaseScraper):
    """
    TEJU (Tablón Edictal Judicial Único) scraper
    Finds pre-auction notices before they appear on BOE Portal
    """
    
    BASE_URL = "https://www.boe.es"
    SEARCH_URL = f"{BASE_URL}/buscar/edictos_judiciales.php"
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.browser_manager = get_browser_manager()
        self.db_adapter = get_database_adapter()
        self.pdf_dir = TEMP_DIR / 'teju_pdfs'
        self.pdf_dir.mkdir(exist_ok=True)
    
    def get_source_name(self) -> str:
        return "TEJU"
    
    def build_search_url(self, **kwargs) -> str:
        """Build TEJU search URL"""
        # TEJU uses POST form, so return base search page
        return self.SEARCH_URL
    
    def parse_listing(self, element: Any) -> Optional[Dict[str, Any]]:
        """Parse TEJU edict listing"""
        try:
            # Extract edict reference
            ref_elem = element.locator('.referencia, .numero-edict')
            reference = ref_elem.inner_text().strip() if ref_elem.count() > 0 else ''
            
            # Extract court name
            court_elem = element.locator('.organo, .court-name')
            court_name = court_elem.inner_text().strip() if court_elem.count() > 0 else ''
            
            # Extract PDF link
            pdf_link_elem = element.locator('a[href*=".pdf"]').first
            pdf_url = pdf_link_elem.get_attribute('href') if pdf_link_elem.count() > 0 else ''
            
            # Extract date
            date_elem = element.locator('.fecha, .date')
            date_text = date_elem.inner_text().strip() if date_elem.count() > 0 else ''
            published_at = self._parse_date(date_text)
            
            return {
                'reference': reference,
                'court_name': court_name,
                'pdf_url': pdf_url,
                'published_at': published_at,
            }
        
        except Exception as e:
            self.log_error(f"Failed to parse TEJU listing: {e}")
            return None
    
    def scrape(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Main scrape method for TEJU
        
        Args:
            keywords: List of keywords to search (default: auction-related)
            max_results: Maximum results to process
        """
        keywords = kwargs.get('keywords', ['subasta', 'ejecución hipotecaria', 'remate judicial'])
        max_results = kwargs.get('max_results', 20)
        max_pages = kwargs.get('max_pages', 3)
        
        self.reset_stats()
        self.log_info(f"Starting TEJU scrape for province: {self.province or 'ALL'}")
        
        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)
            session = StealthSession(page)
            
            self.log_info(f"Navigating to: {self.SEARCH_URL}")
            session.navigate(self.SEARCH_URL, wait_until='domcontentloaded')
            random_delay(1.5, 3.0)
            try:
                self.log_warning(f"TEJU page loaded: {page.url} | {page.title()}")
            except Exception:
                self.log_warning(f"TEJU page loaded: {page.url}")
            try:
                page.wait_for_selector('input[name^="dato"]', timeout=30000)
            except Exception:
                self.log_warning(f"TEJU search inputs not found (url={page.url})")
                try:
                    debug_path = self.pdf_dir / "teju_debug.html"
                    debug_path.write_text(page.content(), encoding="utf-8")
                    self.log_warning(f"Saved TEJU debug HTML to {debug_path}")
                except Exception:
                    pass
            
            # Search for auction-related edicts
            for keyword in keywords:
                self.log_info(f"Searching for: {keyword}")
                
                # Fill search form
                search_input = page.get_by_label("Texto libre")
                if search_input.count() == 0:
                    search_input = page.get_by_role("textbox", name="Texto libre")
                if search_input.count() == 0:
                    search_input = page.locator('input[name^="dato"][type="text"]')
                if search_input.count() == 0:
                    # If we're on a results page, click the "Búsqueda" tab to get the form
                    search_tab = page.locator('a:has-text("Búsqueda")')
                    if search_tab.count() > 0:
                        try:
                            search_tab.first.click()
                            page.wait_for_load_state('networkidle', timeout=60000)
                            random_delay(1.0, 2.0)
                        except Exception:
                            pass
                    search_input = page.get_by_label("Texto libre")
                    if search_input.count() == 0:
                        search_input = page.get_by_role("textbox", name="Texto libre")
                    if search_input.count() == 0:
                        search_input = page.locator('input[name^="dato"][type="text"]')
                    if search_input.count() == 0:
                        self.log_warning("Search input not found on TEJU page")
                        try:
                            debug_path = self.pdf_dir / "teju_debug.html"
                            debug_path.write_text(page.content(), encoding="utf-8")
                            self.log_warning(f"Saved TEJU debug HTML to {debug_path}")
                        except Exception:
                            pass
                        continue
                
                search_query = f"{keyword}"
                if self.province:
                    search_query += f" {self.province}"
                
                random_delay(0.5, 1.5)
                search_input.first.fill("")
                search_input.first.type(search_query, delay=70)
                random_delay(0.5, 1.0)
                
                # Set results per page to 200 if available
                try:
                    page.locator('select[name="page_hits"]').select_option('200')
                except Exception:
                    pass
                
                # Submit search
                submit_button = page.locator('button[type="submit"], input[type="submit"], button:has-text("Buscar")')
                if submit_button.count() > 0:
                    submit_button.first.click()
                else:
                    self.log_warning("Submit button not found")
                    continue
                
                page.wait_for_load_state('networkidle', timeout=60000)
                random_delay(2.0, 3.5)
                
                # Parse results pages
                processed = 0
                for page_index in range(max_pages):
                    human_scroll(page, distance=600)
                    random_delay(1.0, 2.0)
                    
                    items = page.locator('li.resultado-busqueda, ul.lista_resultados > li').all()
                    self.log_info(f"Found {len(items)} edicts on page {page_index + 1}")
                    if len(items) == 0:
                        try:
                            debug_path = self.pdf_dir / "teju_results_debug.html"
                            debug_path.write_text(page.content(), encoding="utf-8")
                            self.log_warning(f"No TEJU results found; saved HTML to {debug_path}")
                        except Exception:
                            pass
                        break
                    
                    for item in items:
                        if processed >= max_results:
                            break
                        
                        try:
                            link_elem = item.locator('a[href*="diario_boe/txt.php"]').first
                            if link_elem.count() == 0:
                                continue
                            
                            link = link_elem.get_attribute('href')
                            if not link:
                                continue
                            if link.startswith('/'):
                                link = f"{self.BASE_URL}{link}"
                            
                            boe_ref = self._extract_boe_reference(item.inner_text(), link)
                            if not boe_ref:
                                continue
                            
                            edict_payload = self._fetch_edict_text(link)
                            if not edict_payload or not edict_payload.get('text'):
                                continue
                            
                            auction_data = self._extract_auction_from_text(
                                edict_payload['text'],
                                boe_ref,
                                link,
                                edict_payload.get('pdf_url')
                            )
                            if auction_data:
                                self.db_adapter.upsert_auction(auction_data)
                                self.results.append(auction_data)
                                self.increment_stat('items_saved')
                            
                            processed += 1
                            self.increment_stat('items_found')
                        
                        except Exception as e:
                            self.log_error(f"Error processing edict: {e}")
                            self.increment_stat('errors')
                            continue
                    
                    if processed >= max_results:
                        break
                    
                    # Go to next page if available
                    next_link = page.locator('a:has-text("Pág. siguiente")')
                    if next_link.count() > 0:
                        next_link.first.click()
                        page.wait_for_load_state('networkidle', timeout=60000)
                        random_delay(1.5, 3.0)
                    else:
                        break
            
            self.log_info(f"TEJU scraping completed: {self.stats}")
            return self.results
        
        except Exception as e:
            self.log_error(f"TEJU scraping failed: {e}", e)
            return self.results
        
        finally:
            if page:
                self.browser_manager.close_page(page)
    
    def parse_edict_pdf(self, pdf_path: Path) -> Optional[Dict[str, Any]]:
        """
        Parse auction data from edict PDF
        Public method for external use
        """
        return self._extract_auction_from_pdf(pdf_path)
    
    # Helper methods
    
    def _download_pdf(self, url: str, save_path: Path) -> bool:
        """Download PDF from URL"""
        try:
            response = requests.get(url, timeout=30, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            response.raise_for_status()
            
            with open(save_path, 'wb') as f:
                f.write(response.content)
            
            self.log_info(f"Downloaded PDF: {save_path.name}")
            return True
        
        except Exception as e:
            self.log_error(f"Failed to download PDF: {e}")
            return False

    def _extract_boe_reference(self, text: str, link: str) -> Optional[str]:
        """Extract BOE-J reference from text or link"""
        match = re.search(r'(BOE-J-\d{4}-\d+)', text)
        if match:
            return match.group(1)
        match = re.search(r'id=(BOE-J-\d{4}-\d+)', link)
        if match:
            return match.group(1)
        return None

    def _fetch_edict_text(self, url: str) -> Optional[Dict[str, Optional[str]]]:
        """Fetch and extract text and PDF URL from BOE edict page"""
        try:
            response = requests.get(url, timeout=30, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
            })
            response.raise_for_status()
            html_text = response.text
            pdf_url = None
            pdf_match = re.search(r'href=["\']([^"\']+\.pdf[^"\']*)["\']', html_text, re.IGNORECASE)
            if pdf_match:
                pdf_url = pdf_match.group(1)
                if pdf_url.startswith('/'):
                    pdf_url = f"{self.BASE_URL}{pdf_url}"

            pre_match = re.search(r'<pre[^>]*>(.*?)</pre>', html_text, re.DOTALL | re.IGNORECASE)
            if pre_match:
                return {
                    'text': html.unescape(pre_match.group(1)).strip(),
                    'pdf_url': pdf_url
                }

            # Fallback: strip tags
            clean = re.sub(r'<[^>]+>', ' ', html_text)
            clean = re.sub(r'\s+', ' ', clean)
            return {
                'text': html.unescape(clean).strip(),
                'pdf_url': pdf_url
            }
        except Exception as e:
            self.log_error(f"Failed to fetch edict text: {e}")
            return None

    def _extract_auction_from_text(self, text: str, boe_ref: str, source_url: str, pdf_url: Optional[str]) -> Optional[Dict[str, Any]]:
        """Extract auction data from BOE edict text (non-OCR)"""
        text_lower = text.lower()
        if not any(k in text_lower for k in ['subasta', 'remate', 'licitación']):
            return None

        title = self._extract_property_title(text)
        address = self._extract_address(text)
        appraisal = self._extract_value(text, ['Valor', 'Tasación', 'Tipo', 'Precio'])
        court_name = self._extract_court_name(text)
        court_reference = self._extract_court_reference(text)
        municipality = self._extract_municipality(text)
        province = self._extract_province(text) or self.province or 'Unknown'

        auction_type = self._detect_auction_type(court_name or '')

        return {
            'boe_id': boe_ref,
            'title': title or f"TEJU Pre-Subasta {municipality or self.province or 'España'}",
            'category': get_category_type(title or '', text),
            'province': province,
            'municipality': municipality,
            'status': 'PROXIMA_APERTURA',
            'auction_type': auction_type,
            'source': 'TEJU',
                'appraisal_value': appraisal,
            'current_bid': None,
            'court_name': court_name,
            'procedure_number': court_reference,
            'boe_link': source_url,
            'edict_url': source_url,
            'pdf_url': pdf_url,
            'published_at': datetime.now(),
            'ends_at': datetime.now() + timedelta(days=60),
            'address': address,
        }
    
    def _extract_auction_from_pdf(self, pdf_path: Path) -> Optional[Dict[str, Any]]:
        """
        Extract auction data from PDF using OCR
        Looks for patterns like "Finca nº", "Dirección", "Valor", etc.
        """
        if not OCR_AVAILABLE or not OCR_ENABLED:
            self.log_warning("OCR not available or disabled")
            return None
        
        try:
            # Convert first 2 pages of PDF to images
            images = convert_from_path(pdf_path, first_page=1, last_page=2, dpi=300)
            
            if not images:
                return None
            
            # Perform OCR on pages
            full_text = ""
            for img in images:
                text = pytesseract.image_to_string(img, lang='spa')
                full_text += text + "\n"
            
            self.log_info(f"Extracted {len(full_text)} characters from PDF")
            
            # Extract key information
            title = self._extract_property_title(full_text)
            address = self._extract_address(full_text)
            appraisal = self._extract_value(full_text, ['Valor', 'Tasación', 'Tipo'])
            court_name = self._extract_court_name(full_text)
            court_reference = self._extract_court_reference(full_text)
            
            # Generate unique TEJU ID
            teju_id = f"TEJU-{datetime.now().strftime('%Y%m%d')}-{hash(full_text[:100]) % 100000:05d}"
            
            if title or address or court_reference:
                # Detect auction type from court name
                auction_type = self._detect_auction_type(court_name or '')
                
                auction_data = {
                    'boe_id': teju_id,
                    'title': title or f"Pre-Subasta {self.province or 'España'}",
                    'category': get_category_type(title or '', full_text),
                    'province': self.province or 'Unknown',
                    'municipality': self._extract_municipality(full_text),
                    'status': 'PROXIMA_APERTURA',  # Use new BOE-accurate status
                    'auction_type': auction_type,
                    'source': 'TEJU',
                    'appraisal_value': appraisal,
                    'current_bid': None,
                    'court_name': court_name,
                    'court_reference': court_reference,
                    'edict_url': str(pdf_path),
                    'published_at': datetime.now(),
                    'ends_at': datetime.now() + timedelta(days=60),  # Estimate
                    'address': address,
                }
                
                return auction_data
            
            return None
        
        except Exception as e:
            self.log_error(f"OCR extraction failed: {e}")
            return None
    
    def _extract_property_title(self, text: str) -> str:
        """Extract property title from OCR text"""
        patterns = [
            r'(?:Finca|Inmueble|Propiedad)[:\s]+([^\n]{10,150})',
            r'(?:Descripción)[:\s]+([^\n]{10,150})',
            r'(?:Bien)[:\s]+([^\n]{10,150})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return ''
    
    def _extract_address(self, text: str) -> Optional[str]:
        """Extract address from OCR text"""
        patterns = [
            r'(?:Dirección|Sita en|Ubicada en|Domicilio)[:\s]+([^\n]{10,200})',
            r'(?:Calle|Avenida|Plaza|Paseo)[^,\n]{5,150}',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                address = match.group(1).strip() if match.lastindex else match.group(0).strip()
                return address
        
        return None
    
    def _extract_value(self, text: str, keywords: List[str]) -> Optional[float]:
        """Extract monetary value from text"""
        for keyword in keywords:
            pattern = f'(?:{keyword})[:\\s]+([0-9.,]+)\\s*(?:€|euros?)'
            match = re.search(pattern, text, re.IGNORECASE)
            
            if match:
                value_str = match.group(1).replace('.', '').replace(',', '.')
                try:
                    return float(value_str)
                except:
                    continue
        
        return None
    
    def _extract_court_name(self, text: str) -> Optional[str]:
        """Extract court name from text"""
        patterns = [
            r'(Juzgado[^.\n]{5,100})',
            r'(Tribunal[^.\n]{5,100})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_court_reference(self, text: str) -> Optional[str]:
        """Extract court reference/procedure number"""
        patterns = [
            r'(?:Procedimiento|Autos|Expediente)[:\s]+([0-9/]+)',
            r'(?:NIG)[:\s]+([0-9]+)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_municipality(self, text: str) -> Optional[str]:
        """Extract municipality from text"""
        match = re.search(r'\b([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s\-]{3,})\.\s*Edicto', text)
        if match:
            return match.group(1).title()

        municipalities = [
            'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza',
            'Málaga', 'Murcia', 'Palma de Mallorca', 'Las Palmas de Gran Canaria',
            'Bilbao', 'Alicante', 'Córdoba', 'Valladolid', 'Vigo',
            'Gijón', 'Granada', 'Santa Cruz de Tenerife', 'Telde',
        ]
        
        for municipality in municipalities:
            if municipality.lower() in text.lower():
                return municipality
        
        return None

    def _extract_province(self, text: str) -> Optional[str]:
        """Extract province name from text"""
        try:
            from ..config.provinces import PROVINCES
            for province in PROVINCES.keys():
                if province.lower() in text.lower():
                    return province
        except Exception:
            pass

        match = re.search(r'-\s*([A-ZÁÉÍÓÚÜÑ\s]+)\b', text)
        if match:
            return match.group(1).title()

        return None
    
    def _parse_date(self, date_text: str) -> datetime:
        """Parse date from various Spanish formats"""
        # Try different date patterns
        patterns = [
            r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})',
            r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, date_text)
            if match:
                try:
                    groups = match.groups()
                    if len(groups[0]) == 4:  # YYYY-MM-DD
                        year, month, day = groups
                    else:  # DD-MM-YYYY
                        day, month, year = groups
                    return datetime(int(year), int(month), int(day))
                except:
                    continue
        
        return datetime.now()
    
    def _detect_auction_type(self, court_name: str) -> str:
        """
        Detect auction type from court/authority name
        
        Returns: JUDICIAL, NOTARIAL, AEAT, TRIBUTARIA, ADMINISTRATIVA
        """
        if not court_name:
            return 'JUDICIAL'  # Default for TEJU (judicial edicts)
        
        text = court_name.lower()
        
        # AEAT - Agencia Tributaria
        if any(x in text for x in ['aeat', 'agencia tributaria']):
            return 'AEAT'
        
        # Notarial
        if any(x in text for x in ['notaría', 'notario', 'notarial']):
            return 'NOTARIAL'
        
        # Tributaria - Local tax agencies
        if any(x in text for x in ['ayuntamiento', 'diputación', 'cabildo', 'recaudación']):
            return 'TRIBUTARIA'
        
        # Seguridad Social
        if any(x in text for x in ['seguridad social', 'tesorería general']):
            return 'ADMINISTRATIVA'
        
        # Default to JUDICIAL for TEJU (most common)
        return 'JUDICIAL'
    
    def link_to_boe_auction(self, teju_id: str, boe_id: str) -> bool:
        """
        Link a TEJU pre-announcement to a BOE auction when it appears
        
        Args:
            teju_id: TEJU auction ID
            boe_id: BOE auction ID
        
        Returns:
            True if successful
        """
        try:
            # Update TEJU record with BOE link
            # This creates a relationship between pre-auction and active auction
            self.db_adapter.update_auction(teju_id, {
                'boe_link': f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
                'original_source': 'TEJU',
            })
            
            self.log_info(f"Linked TEJU {teju_id} to BOE {boe_id}")
            return True
        
        except Exception as e:
            self.log_error(f"Failed to link TEJU to BOE: {e}")
            return False
