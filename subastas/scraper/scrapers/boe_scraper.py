"""
BOE Scraper Module
Scrapes active, pre-auction, and finished auctions from Portal de Subastas BOE
Supports all 50 Spanish provinces
Enhanced with:
- Pre-auction (Próxima apertura) scraping
- Auction type detection (Judicial, Notarial, AEAT, etc.)
- Accurate BOE status parsing
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import re
import logging
import os

from ..core.base_scraper import BaseScraper
from ..core.browser import get_browser_manager
from ..core.stealth import random_delay
from ..config.provinces import get_province_code, ALL_PROVINCES
from ..config.categories import get_category_type
from ..config.municipality_province import municipality_to_province, province_from_text
from ..config.settings import SCRAPE_MAX_PAGES, SCRAPE_MAX_ITEMS_PER_PAGE, BOE_REQUEST_DELAY_SECONDS
from ..database.adapter import get_database_adapter

logger = logging.getLogger(__name__)

# BOE Status Codes mapping
BOE_STATUS_MAP = {
    'PA': 'PROXIMA_APERTURA',      # Próxima apertura (pre-auction)
    'EJ': 'CELEBRANDOSE',          # En ejecución (active)
    'SU': 'SUSPENDIDA',            # Suspendida
    'CE': 'CONCLUIDA_PORTAL',      # Cerrada/Finalizada
    'AN': 'CANCELADA',             # Anulada/Cancelada
    'FI': 'FINALIZADA_AUTORIDAD',  # Finalizada por Autoridad
}

# ---------------------------------------------------------------------------
# Auction-type (category) derivation from the BOE identifier prefix.
#
# The BOE idSub carries an authoritative two-letter family code right after
# "SUB-". These were VERIFIED LIVE on subastas.boe.es (2026-06-01) by filtering
# the advanced-search "Tipo de subasta" radio (SUBASTA.ORIGEN) and reading the
# resulting idSub prefixes — they do NOT match the NE/NV guesses in early
# planning docs. The mapping below is the real one:
#
#   ORIGEN radio value  ->  idSub prefixes seen  ->  auctionType
#   J  Judicial             SUB-JA / SUB-JV / SUB-JC   JUDICIAL
#   N  Notarial             SUB-NH / SUB-NN            NOTARIAL
#   A  AEAT                 SUB-AT                     AEAT
#   R  Otras trib.          SUB-RC                     OTRAS_TRIBUTARIAS
#   G  Admin. generales     SUB-GA                     ADMINISTRATIVAS
#
# The detail page's "Tipo de subasta" label is a secondary confirmation
# (e.g. "NOTARIAL HIPOTECARIA", "AGENCIA TRIBUTARIA", "RECAUDACIÓN TRIBUTARIA",
# "ADMINISTRATIVA GENERAL") but the prefix is cheapest + always present.
#
# NOTE: legacy historical rows were classified by the older text-based heuristic
# and may carry the older labels TRIBUTARIA / ADMINISTRATIVA. The canonical
# going-forward enum is the right-hand column here.
BOE_PREFIX_AUCTION_TYPE = {
    'JA': 'JUDICIAL', 'JV': 'JUDICIAL', 'JC': 'JUDICIAL',
    'NH': 'NOTARIAL', 'NN': 'NOTARIAL', 'NE': 'NOTARIAL', 'NV': 'NOTARIAL',
    'AT': 'AEAT',
    'RC': 'OTRAS_TRIBUTARIAS',
    'GA': 'ADMINISTRATIVAS',
}

# ORIGEN radio value (SUBASTA.ORIGEN) -> canonical auctionType, used by the
# per-category scrapers so each script declares exactly one BOE family.
ORIGEN_TO_AUCTION_TYPE = {
    'J': 'JUDICIAL',
    'N': 'NOTARIAL',
    'A': 'AEAT',
    'R': 'OTRAS_TRIBUTARIAS',
    'G': 'ADMINISTRATIVAS',
}


def auction_type_from_boe_id(boe_id: Optional[str]) -> Optional[str]:
    """
    Derive the canonical auctionType from a BOE idSub prefix (SUB-XX-...).
    Returns None when the id is missing or the prefix is unrecognised, so the
    caller can fall back to the text-based heuristic.
    """
    if not boe_id:
        return None
    m = re.match(r'SUB-([A-Z]{2})', boe_id.upper())
    if not m:
        return None
    return BOE_PREFIX_AUCTION_TYPE.get(m.group(1))


# Status text to status code mapping
BOE_STATUS_TEXT_MAP = {
    'próxima apertura': 'PROXIMA_APERTURA',
    'prox. apertura': 'PROXIMA_APERTURA',
    'celebrándose': 'CELEBRANDOSE',
    'en ejecución': 'CELEBRANDOSE',
    'activa': 'CELEBRANDOSE',
    'suspendida': 'SUSPENDIDA',
    'cancelada': 'CANCELADA',
    'anulada': 'CANCELADA',
    'concluida': 'CONCLUIDA_PORTAL',
    'concluida en portal': 'CONCLUIDA_PORTAL',
    'finalizada': 'FINALIZADA_AUTORIDAD',
    'finalizada por autoridad': 'FINALIZADA_AUTORIDAD',
    'cerrada': 'CONCLUIDA_PORTAL',
}


# Spanish Referencia Catastral: 20-char alphanumeric, structure
# [0-9]{4}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2} (e.g. 9872023VH5797S0001WX).
# We anchor on the "Referencia catastral" / "Ref. catastral" label to avoid
# false-positives on other 14-20 char codes (postal/registry numbers). The
# value may sit on the same line ("Referencia catastral: 9872023VH...") or
# on the next non-empty line in the Bienes block.
_RC_TOKEN = r'[0-9]{7}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2}'
_RC_LABEL_INLINE_RE = re.compile(
    r'(?:Referencia\s+catastral|Ref\.?\s*catastral)\s*[:\-]?\s*(' + _RC_TOKEN + r')',
    re.IGNORECASE,
)
_RC_LABEL_NEXT_LINE_RE = re.compile(
    r'(?:Referencia\s+catastral|Ref\.?\s*catastral)\s*[:\-]?\s*\n+\s*(' + _RC_TOKEN + r')',
    re.IGNORECASE,
)


def extract_cadastral_refs(bienes_text: Optional[str]) -> tuple:
    """
    Extract Referencia Catastral values from a Bienes-section text blob.

    Returns (first_rc, all_rcs_joined) where:
      - first_rc: the first RC found (what the Catastro fetch path consumes), or None
      - all_rcs_joined: newline-joined list of all distinct RCs found
        (multi-property lots), or None

    Anchors on the label "Referencia catastral" / "Ref. catastral" — does NOT
    blind-grep the page for any 20-char alphanumeric token (would false-positive
    on other ids in the same block).
    """
    if not bienes_text:
        return (None, None)
    text = bienes_text.upper()
    found = []
    seen = set()
    # Inline label: "Referencia catastral: 9872023VH5797S0001WX"
    for m in _RC_LABEL_INLINE_RE.finditer(text):
        rc = m.group(1)
        if rc not in seen:
            seen.add(rc)
            found.append(rc)
    # Next-line label: "Referencia catastral\n9872023VH5797S0001WX"
    for m in _RC_LABEL_NEXT_LINE_RE.finditer(text):
        rc = m.group(1)
        if rc not in seen:
            seen.add(rc)
            found.append(rc)
    if not found:
        return (None, None)
    return (found[0], '\n'.join(found))


class BOEScraper(BaseScraper):
    """
    BOE Portal de Subastas scraper
    Handles Discovery Mode (find new auctions) and Pulse Mode (update bids)
    Enhanced with:
    - Pre-auction scraping (PA status)
    - Auction type detection from Autoridad Gestora
    - Accurate BOE status parsing
    """
    
    BASE_URL = "https://subastas.boe.es"
    SEARCH_URL = "https://subastas.boe.es/subastas_ava.php"
    DETAIL_URL = "https://subastas.boe.es/detalleSubasta.php"
    
    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.browser_manager = get_browser_manager()
        self.db_adapter = get_database_adapter()
    
    def get_source_name(self) -> str:
        return "BOE"
    
    def build_search_url(self, **kwargs) -> str:
        """
        Build BOE search URL with support for all status types
        
        Args:
            province: Province name (optional)
            category: Category filter (optional)
            status: 'active', 'pre-auction', 'finished', 'suspended', etc.
            boe_status_code: Direct BOE status code (PA, EJ, SU, CE, etc.)
        """
        province = kwargs.get('province', self.province)
        category = kwargs.get('category')
        status = kwargs.get('status', 'active')
        boe_status_code = kwargs.get('boe_status_code')
        
        # Base search URL
        url = f"{self.SEARCH_URL}?"
        field_index = 0
        
        # Province filter
        if province:
            province_code = get_province_code(province)
            url += f"campo[{field_index}]=SUBASTA.CODPROV&dato[{field_index}]={province_code}"
            field_index += 1
        
        # Category filter
        if category:
            url += f"&campo[{field_index}]=BIEN.TIPO&dato[{field_index}]={category}"
            field_index += 1
        
        # Status filter - use direct code if provided, otherwise map from status string
        if boe_status_code:
            url += f"&campo[{field_index}]=SUBASTA.ESTADO&dato[{field_index}]={boe_status_code}"
        else:
            status_code_map = {
                'pre-auction': 'PA',    # Próxima apertura
                'active': 'EJ',         # En ejecución (Celebrándose)
                'finished': 'CE',       # Cerrada
                'suspended': 'SU',      # Suspendida
                'cancelled': 'AN',      # Anulada
            }
            if status in status_code_map:
                url += f"&campo[{field_index}]=SUBASTA.ESTADO&dato[{field_index}]={status_code_map[status]}"
        
        return url
    
    def detect_auction_type(self, autoridad_gestora: str, court_name: str = None,
                            boe_id: str = None) -> str:
        """
        Detect the canonical auctionType for an auction.

        Resolution order (most authoritative first):
          1. The BOE idSub prefix (SUB-XX-...) via auction_type_from_boe_id —
             this is the same classification the portal's "Tipo de subasta"
             radio uses, so it is exact.
          2. The Autoridad Gestora / court-name text heuristic (legacy fallback
             for rows whose id we don't have or whose prefix is unknown).

        Returns one of: JUDICIAL, NOTARIAL, AEAT, OTRAS_TRIBUTARIAS,
        ADMINISTRATIVAS (canonical), or legacy TRIBUTARIA/ADMINISTRATIVA from the
        text path.
        """
        prefix_type = auction_type_from_boe_id(boe_id)
        if prefix_type:
            return prefix_type

        if not autoridad_gestora:
            autoridad_gestora = court_name or ''

        text = autoridad_gestora.lower()
        
        # AEAT - Agencia Tributaria
        if any(x in text for x in ['aeat', 'agencia tributaria', 'agencia estatal de administración tributaria']):
            return 'AEAT'
        
        # Judicial - Courts
        if any(x in text for x in ['juzgado', 'tribunal', 'audiencia', 'sala de lo']):
            return 'JUDICIAL'
        
        # Notarial
        if any(x in text for x in ['notaría', 'notario', 'notarial']):
            return 'NOTARIAL'
        
        # Tributaria - Local tax agencies
        if any(x in text for x in ['ayuntamiento', 'diputación', 'consell', 'cabildo', 'recaudación']):
            return 'TRIBUTARIA'
        
        # Seguridad Social
        if any(x in text for x in ['seguridad social', 'tesorería general']):
            return 'ADMINISTRATIVA'
        
        # Default to JUDICIAL (most common)
        return 'JUDICIAL'
    
    def parse_boe_status(self, status_text: str) -> str:
        """
        Parse BOE status text to internal status code
        """
        if not status_text:
            return 'CELEBRANDOSE'
        
        status_lower = status_text.lower().strip()
        
        for pattern, status in BOE_STATUS_TEXT_MAP.items():
            if pattern in status_lower:
                return status
        
        # Default to active
        return 'CELEBRANDOSE'
    
    def parse_listing(self, element: Any, status_override: str = None) -> Optional[Dict[str, Any]]:
        """
        Parse a single auction listing from search results
        
        Args:
            element: Playwright Locator for auction item
            status_override: Override status (e.g., from search filter)
        
        Returns:
            Auction data dictionary or None
        """
        try:
            # Extract title
            title_elem = element.locator('.resultado-titulo, .titulo-subasta')
            # Do NOT default to the literal "Unknown" — leave it falsy so the
            # detail-page Identificador (or boe_id) fills it in below.
            title = title_elem.inner_text().strip() if title_elem.count() > 0 else None
            
            # Extract BOE ID from link
            link_elem = element.locator('a').first
            link = link_elem.get_attribute('href') if link_elem.count() > 0 else ''
            boe_id = self._extract_boe_id(link)
            
            if not boe_id:
                self.log_warning("No BOE ID found in listing")
                return None
            
            # Extract full text for parsing
            full_text = element.inner_text()
            
            # Extract values
            appraisal_value = self._extract_currency(full_text, ['Valor', 'Tasación', 'Valoración'])
            current_bid = self._extract_currency(full_text, ['Puja actual', 'Puja', 'Licitación'])
            minimum_bid = self._extract_currency(full_text, ['Mínimo', 'Puja mínima'])
            
            # Extract location
            municipality = self._extract_municipality(full_text)
            
            # Categorize (title may be None at this point — pass empty string)
            category = get_category_type(title or '', full_text)
            
            # Extract dates
            ends_at = self._extract_end_date(full_text)
            
            # Extract status from listing if visible
            status_elem = element.locator('.estado, .estado-subasta, .badge-estado')
            status_text = status_elem.inner_text().strip() if status_elem.count() > 0 else ''
            
            # Determine status - use override if provided, otherwise parse from listing
            if status_override:
                status = status_override
            elif status_text:
                status = self.parse_boe_status(status_text)
            else:
                status = 'CELEBRANDOSE'
            
            # Extract Autoridad Gestora for auction type detection
            autoridad_elem = element.locator('.autoridad, .autoridad-gestora')
            autoridad_gestora = autoridad_elem.inner_text().strip() if autoridad_elem.count() > 0 else ''
            
            # Also check in full text for authority info
            if not autoridad_gestora:
                autoridad_gestora = self._extract_autoridad(full_text)
            
            # Detect auction type — prefer the authoritative idSub prefix,
            # fall back to the autoridad-gestora text heuristic.
            auction_type = self.detect_auction_type(autoridad_gestora, boe_id=boe_id)
            
            # Province: prefer self.province (set when scraping per-province),
            # otherwise derive from municipality or from full listing text.
            # Fall back to 'Unknown' only when all derivation paths fail.
            province = self.province
            if not province and municipality:
                province = municipality_to_province(municipality)
            if not province:
                province = province_from_text(full_text) or 'Unknown'

            auction_data = {
                'boe_id': boe_id,
                'title': title,
                'category': category,
                'province': province,
                'municipality': municipality,
                'status': status,
                'auction_type': auction_type,
                'source': 'BOE',
                'appraisal_value': appraisal_value,
                'current_bid': current_bid,
                'minimum_bid': minimum_bid,
                'boe_link': f"{self.DETAIL_URL}?idSub={boe_id}",
                'court_name': autoridad_gestora or None,
                'published_at': datetime.now() - timedelta(days=5),  # Estimate
                'ends_at': ends_at or datetime.now() + timedelta(days=7),
            }

            # Persist the portal idSub explicitly into `auctionId` whenever
            # we have one. The portal scraper extracts boe_id from an `?idSub=`
            # href, so for portal rows boe_id IS the portal idSub
            # (format: SUB-XX-YYYY-NNNNNN). Storing it in `auctionId` lets the
            # RC backfill (and downstream Catastro fetch) reach the Bienes tab
            # without re-deriving it. TEJU rows do NOT carry this column.
            if boe_id.startswith('SUB-'):
                auction_data['auction_id'] = boe_id

            if os.getenv('BOE_FETCH_DETAIL', '1') != '0':
                detail_info = self._fetch_detail_info(boe_id)
                if detail_info.get('general_info'):
                    auction_data['boe_announcement'] = detail_info['general_info']
                if detail_info.get('autoridad_gestora'):
                    if not auction_data.get('court_name'):
                        auction_data['court_name'] = detail_info['autoridad_gestora']
                if detail_info.get('bienes_info'):
                    auction_data['lot_description'] = detail_info['bienes_info']
                if detail_info.get('pujas_info'):
                    auction_data['property_description'] = detail_info['pujas_info']
                if detail_info.get('warning'):
                    auction_data['charges_detail'] = detail_info['warning']
                if detail_info.get('detail_url'):
                    auction_data['boe_link'] = detail_info['detail_url']
                if detail_info.get('cadastral_ref'):
                    auction_data['cadastral_ref'] = detail_info['cadastral_ref']
                if detail_info.get('cadastral_data'):
                    auction_data['cadastral_data'] = detail_info['cadastral_data']

                # --- AUTHORITATIVE financial fields from detail page ---
                # Only overwrite when the detail page actually yielded a value;
                # never coerce a missing value to 0 (NULL is the honest signal).
                if detail_info.get('appraisal_value') is not None:
                    auction_data['appraisal_value'] = detail_info['appraisal_value']
                if detail_info.get('minimum_bid') is not None:
                    auction_data['minimum_bid'] = detail_info['minimum_bid']
                if detail_info.get('deposit_amount') is not None:
                    auction_data['deposit_amount'] = detail_info['deposit_amount']
                if detail_info.get('claimed_amount') is not None:
                    auction_data['claimed_amount'] = detail_info['claimed_amount']

                # --- Authoritative end date from detail page ---
                # The listing estimate (now()+7d) is a placeholder; the detail
                # page carries the real "Fecha de conclusión". Without it, rows
                # land with a bogus future endsAt (or NULL) and the status sweep
                # can never expire them — a primary cause of stale-active rows.
                if detail_info.get('ends_at') is not None:
                    auction_data['ends_at'] = detail_info['ends_at']

                # --- Title / identifier ---
                # The listing card rarely carries a usable title, leaving the
                # literal "Unknown". The detail-page Identificador is always
                # present; prefer a real listing title, else the identifier.
                if auction_data.get('title') in (None, '', 'Unknown'):
                    auction_data['title'] = detail_info.get('identificador') or boe_id

                # --- Authoritative status from detail page ---
                # The search filter (status_override) tags rows by the query
                # bucket, but an auction may have concluded/cancelled since.
                # The detail banner is authoritative.
                if detail_info.get('detail_status'):
                    auction_data['status'] = detail_info['detail_status']


                # Province enrichment from detail page text if still Unknown
                if auction_data.get('province') == 'Unknown':
                    detail_text = " ".join(filter(None, [
                        detail_info.get('general_info', ''),
                        detail_info.get('autoridad_gestora', ''),
                        detail_info.get('bienes_info', ''),
                    ]))
                    derived = province_from_text(detail_text)
                    if derived:
                        auction_data['province'] = derived

            # Final safety: `title` is a non-null column in the schema. Never let
            # the literal "Unknown" or None reach the DB — fall back to the BOE
            # identifier, which is always present and meaningful.
            if auction_data.get('title') in (None, '', 'Unknown'):
                auction_data['title'] = boe_id

            return auction_data
        
        except Exception as e:
            self.log_error(f"Failed to parse listing: {e}")
            return None
    
    def _extract_autoridad(self, text: str) -> str:
        """Extract Autoridad Gestora from text"""
        patterns = [
            r'(?:Autoridad|Organismo)[:\s]+([^\n]+)',
            r'(?:Juzgado|Tribunal|Notaría)[^\n]+',
            r'AEAT[^\n]+',
            r'Agencia Tributaria[^\n]+',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(0).strip()
        
        return ''
    
    def scrape(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Main scrape method with support for all status types
        
        Args:
            max_pages: Maximum pages to scrape (default: from settings)
            status: 'active', 'pre-auction', 'finished', 'suspended', etc.
            boe_status_code: Direct BOE status code (PA, EJ, SU, CE)
        """
        max_pages = kwargs.get('max_pages', SCRAPE_MAX_PAGES)
        status = kwargs.get('status', 'active')
        boe_status_code = kwargs.get('boe_status_code')
        
        # Map status to internal status code for overriding
        status_override_map = {
            'pre-auction': 'PROXIMA_APERTURA',
            'active': 'CELEBRANDOSE',
            'finished': 'CONCLUIDA_PORTAL',
            'suspended': 'SUSPENDIDA',
            'cancelled': 'CANCELADA',
        }
        status_override = status_override_map.get(status)
        
        # If BOE status code provided, map it to internal status
        if boe_status_code:
            status_override = BOE_STATUS_MAP.get(boe_status_code, 'CELEBRANDOSE')
        
        self.reset_stats()
        self.log_info(f"Starting scrape for province: {self.province or 'ALL'}, status: {status}")
        
        page = None
        try:
            # Get browser page
            page = self.browser_manager.get_page(stealth=True)
            
            # Build search URL
            search_url = self.build_search_url(**kwargs)
            self.log_info(f"Navigating to: {search_url}")
            
            # Navigate with delay
            random_delay(1.0, 3.0)
            page.goto(search_url, wait_until='networkidle', timeout=30000)
            random_delay(2.0, 4.0)
            
            # Wait for results
            page.wait_for_selector('.resultado-busqueda, .sin-resultados', timeout=10000)
            
            # Check if no results
            if page.locator('.sin-resultados').count() > 0:
                self.log_info("No auctions found")
                return []
            
            # Scrape multiple pages
            current_page = 1
            while current_page <= max_pages:
                self.log_info(f"Scraping page {current_page}/{max_pages}")
                
                # Parse auction listings on current page
                auction_items = page.locator('.resultado-busqueda, .resultado-subasta').all()
                self.log_info(f"Found {len(auction_items)} items on page")
                
                for item in auction_items[:SCRAPE_MAX_ITEMS_PER_PAGE]:
                    try:
                        auction_data = self.parse_listing(item, status_override=status_override)
                        
                        if auction_data and self.validate_auction_data(auction_data):
                            # Save to database
                            self.db_adapter.upsert_auction(auction_data)
                            self.results.append(auction_data)
                            self.increment_stat('items_saved')
                        else:
                            self.increment_stat('items_skipped')
                    
                    except Exception as e:
                        self.log_error(f"Error processing item: {e}")
                        self.increment_stat('errors')
                
                self.increment_stat('items_found', len(auction_items))
                
                # Check for next page
                next_button = page.locator('a.siguiente, .pagination a.next')
                if next_button.count() > 0 and current_page < max_pages:
                    random_delay(BOE_REQUEST_DELAY_SECONDS, BOE_REQUEST_DELAY_SECONDS + 2)
                    next_button.first.click()
                    page.wait_for_load_state('networkidle')
                    random_delay(2.0, 4.0)
                    current_page += 1
                else:
                    break
            
            self.log_info(f"Scraping completed: {self.stats}")
            return self.results
        
        except Exception as e:
            self.log_error(f"Scraping failed: {e}", e)
            return self.results
        
        finally:
            if page:
                self.browser_manager.close_page(page)
    
    def scrape_pre_auctions(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Scrape pre-auctions (Próxima apertura) from BOE
        
        Returns:
            List of pre-auction data dictionaries
        """
        self.log_info("Starting pre-auction scraping (PA status)")
        return self.scrape(status='pre-auction', boe_status_code='PA', **kwargs)
    
    def scrape_active_auctions(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Scrape active auctions (Celebrándose) from BOE
        
        Returns:
            List of active auction data dictionaries
        """
        self.log_info("Starting active auction scraping (EJ status)")
        return self.scrape(status='active', boe_status_code='EJ', **kwargs)
    
    def scrape_suspended_auctions(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Scrape suspended auctions from BOE
        
        Returns:
            List of suspended auction data dictionaries
        """
        self.log_info("Starting suspended auction scraping (SU status)")
        return self.scrape(status='suspended', boe_status_code='SU', **kwargs)
    
    def scrape_all_statuses(self, **kwargs) -> Dict[str, List[Dict[str, Any]]]:
        """
        Scrape all status types from BOE
        
        Returns:
            Dictionary with status -> auctions list
        """
        results = {
            'pre-auction': [],
            'active': [],
            'suspended': [],
            'finished': [],
        }
        
        # Scrape each status
        for status in ['pre-auction', 'active', 'suspended', 'finished']:
            self.log_info(f"Scraping {status} auctions...")
            auctions = self.scrape(status=status, **kwargs)
            results[status] = auctions
            random_delay(5.0, 10.0)  # Delay between status types
        
        return results
    
    def scrape_all_provinces(self, max_pages: int = 5, delay_between: int = 120) -> Dict[str, int]:
        """
        Scrape all 50 provinces with staggered delays
        
        Args:
            max_pages: Max pages per province
            delay_between: Seconds between provinces (default: 120 = 2 min)
        
        Returns:
            Dictionary with province -> count mapping
        """
        results = {}
        
        for province_name in ALL_PROVINCES.keys():
            self.log_info(f"Scraping province: {province_name}")
            self.province = province_name
            
            try:
                auctions = self.scrape(max_pages=max_pages)
                results[province_name] = len(auctions)
                self.log_info(f"Completed {province_name}: {len(auctions)} auctions")
            except Exception as e:
                self.log_error(f"Failed to scrape {province_name}: {e}")
                results[province_name] = 0
            
            # Delay between provinces
            if province_name != list(ALL_PROVINCES.keys())[-1]:  # Not last province
                self.log_info(f"Waiting {delay_between}s before next province...")
                import time
                time.sleep(delay_between)
        
        self.log_info(f"All provinces completed. Total: {sum(results.values())} auctions")
        return results
    
    def update_bid(self, boe_id: str) -> Optional[float]:
        """
        Pulse Mode: Visit auction detail page and update current bid
        
        Args:
            boe_id: Auction BOE ID
        
        Returns:
            Current bid amount or None
        """
        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)
            
            detail_url = f"{self.DETAIL_URL}?idSub={boe_id}"
            self.log_info(f"Updating bid for {boe_id}")
            
            random_delay(1.0, 2.5)
            # domcontentloaded (see _fetch_detail_info): networkidle hangs on
            # live-auction pages whose countdown keeps the network busy.
            page.goto(detail_url, wait_until='domcontentloaded', timeout=30000)
            random_delay(1.5, 3.0)
            
            # Check if auction ended
            status_elem = page.locator('.estado-subasta, .status')
            if status_elem.count() > 0:
                status_text = status_elem.inner_text().lower()
                
                if any(word in status_text for word in ['cerrada', 'finalizada', 'terminada']):
                    # Auction has ended
                    final_bid = self._extract_currency_from_page(page, ['Puja final', 'Precio adjudicación'])
                    self._mark_finished(boe_id, final_bid)
                    return final_bid
            
            # Extract current bid
            current_bid = self._extract_currency_from_page(page, ['Puja actual', 'Puja', 'Licitación actual'])
            
            if current_bid:
                # G2 FIX: use bid-only update — do NOT call upsert_auction with placeholder
                # fields (title='Updated', category='Viviendas', ends_at=now(), status='ACTIVE')
                # which overwrites the real row and corrupts status/endsAt on every bid scrape.
                self.db_adapter.update_auction_bid(boe_id, current_bid)
                self.log_info(f"Updated bid: €{current_bid:,.2f}")
            
            return current_bid
        
        except Exception as e:
            self.log_error(f"Failed to update bid for {boe_id}: {e}")
            return None
        
        finally:
            if page:
                self.browser_manager.close_page(page)
    
    # Helper methods
    
    def _extract_boe_id(self, url: str) -> str:
        """Extract BOE ID from URL"""
        if not url:
            return ''
        match = re.search(r'idSub=([A-Z0-9-]+)', url)
        return match.group(1) if match else ''
    
    def _extract_currency(self, text: str, labels: List[str]) -> Optional[float]:
        """Extract currency value from text"""
        for label in labels:
            pattern = f"{label}[:\\s]+([0-9.,]+)\\s*€"
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                value_str = match.group(1).replace('.', '').replace(',', '.')
                try:
                    return float(value_str)
                except:
                    continue
        return None
    
    def _extract_currency_from_page(self, page: Any, labels: List[str]) -> Optional[float]:
        """Extract currency from page content"""
        try:
            text = page.inner_text('body')
            return self._extract_currency(text, labels)
        except:
            return None

    def _extract_label_value(self, text: str, labels: List[str]) -> Optional[str]:
        """
        Extract the value that follows a label on the BOE detail page.
        Detail pages render label/value pairs; on a flattened inner_text the
        value is on the next line (or after a colon). Returns None if not found.
        """
        if not text:
            return None
        for label in labels:
            # BOE detail pages separate label/value with a tab, colon or newline
            # (e.g. "Identificador\tSUB-JV-2026-255723"). Accept any of them.
            pattern = rf"{re.escape(label)}\s*[:\t\n]\s*([^\t\n]+)"
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                value = match.group(1).strip()
                if value:
                    return value
        return None

    def _extract_minimum_bid(self, text: str) -> Optional[float]:
        """
        Extract 'Puja mínima'. BOE shows either a currency amount or the literal
        'Sin puja mínima' (= no minimum). Returns the amount, or None when there
        is genuinely no minimum bid (never coerced to 0).
        """
        if not text:
            return None
        # Explicit "no minimum" — honest None, NOT 0.
        if re.search(r"Puja\s+m[ií]nima\s*[:\t\n]?\s*Sin\s+puja", text, re.IGNORECASE):
            return None
        return self._extract_currency(text, ['Puja mínima'])

    def _extract_detail_date(self, text: str, labels: List[str]) -> Optional[datetime]:
        """
        Extract a BOE detail-page date for one of `labels`.
        BOE renders dates as e.g. "Fecha de conclusión\t01-06-2026 20:18:03 CET
        (ISO: 2026-06-01T20:18:03+02:00)". Prefer the ISO form when present
        (unambiguous, tz-aware) and fall back to the dd-mm-YYYY HH:MM:SS form.
        Returns a naive datetime (UTC-ish, matching how endsAt is stored).
        """
        if not text:
            return None
        for label in labels:
            # ISO form first
            iso = re.search(
                rf"{re.escape(label)}[^\n]*?ISO:\s*([0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}T[0-9:]{{8}})",
                text, re.IGNORECASE,
            )
            if iso:
                try:
                    return datetime.strptime(iso.group(1), "%Y-%m-%dT%H:%M:%S")
                except Exception:
                    pass
            # dd-mm-YYYY HH:MM:SS form
            dmy = re.search(
                rf"{re.escape(label)}\s*[:\t\n]?\s*([0-9]{{2}})-([0-9]{{2}})-([0-9]{{4}})\s+([0-9]{{2}}):([0-9]{{2}}):([0-9]{{2}})",
                text, re.IGNORECASE,
            )
            if dmy:
                try:
                    d, mo, y, h, mi, sec = (int(g) for g in dmy.groups())
                    return datetime(y, mo, d, h, mi, sec)
                except Exception:
                    pass
        return None

    def _extract_detail_status(self, text: str) -> Optional[str]:
        """
        Derive internal status from the detail-page status banner. The detail
        page is authoritative for whether an auction has concluded/cancelled,
        which the listing search-filter override cannot tell us once ended.
        """
        if not text:
            return None
        lowered = text.lower()
        if 'cancelada' in lowered or 'anulada' in lowered:
            return 'CANCELADA'
        if 'suspendida' in lowered:
            return 'SUSPENDIDA'
        if any(w in lowered for w in ['concluida', 'cerrada', 'finalizada', 'la subasta ha finalizado']):
            return 'CONCLUIDA_PORTAL'
        return None
    
    def _extract_municipality(self, text: str) -> Optional[str]:
        """Extract municipality from text"""
        # Simple heuristic - can be improved
        municipalities = [
            'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza',
            'Málaga', 'Murcia', 'Palma', 'Las Palmas de Gran Canaria',
            'Bilbao', 'Alicante', 'Córdoba', 'Valladolid', 'Vigo',
            'Gijón', 'Granada', 'Tenerife', 'Gran Canaria',
        ]
        
        for municipality in municipalities:
            if municipality.lower() in text.lower():
                return municipality
        
        return None
    
    def _extract_end_date(self, text: str) -> Optional[datetime]:
        """Extract auction end date from text"""
        # Look for date patterns like "Fin: 25/01/2026" or "Hasta: 25-01-2026"
        patterns = [
            r'(?:Fin|Hasta|Finaliza)[:\s]+(\d{1,2})[/-](\d{1,2})[/-](\d{4})',
            r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    day, month, year = match.groups()
                    return datetime(int(year), int(month), int(day))
                except:
                    continue
        
        return None

    def _fetch_detail_info(self, boe_id: str) -> Dict[str, Optional[str]]:
        """
        Fetch comprehensive detail information from an auction detail page using
        the SHARED browser_manager page.

        Per-category scrapers that run their own sync-Playwright browser
        (BOEParallelScraper / CategoryBOEScraper) MUST NOT use this path: opening
        a second Playwright instance from inside a thread that already owns one
        raises "using Playwright Sync API inside the asyncio loop" and the detail
        fetch silently fails (=> NULL appraisal/minBid/deposit on every row).
        Those classes override _fetch_detail_info to navigate with their OWN page
        and then call _extract_detail_from_page (below) for the shared extraction.
        """
        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)
            detail_url = f"{self.DETAIL_URL}?idSub={boe_id}"
            random_delay(1.0, 2.0)
            # 'domcontentloaded', NOT 'networkidle': live-auction detail pages
            # keep long-poll/countdown connections open, so networkidle often
            # never fires and goto hangs past its timeout under load (the cause
            # of batch re-scrapes stalling). All financial label/value pairs are
            # server-rendered in the initial HTML, so domcontentloaded is enough.
            page.goto(detail_url, wait_until='domcontentloaded', timeout=30000)
            random_delay(1.0, 2.0)
            return self._extract_detail_from_page(page, boe_id, detail_url)
        except Exception as e:
            self.log_warning(f"Failed to fetch detail info for {boe_id}: {e}")
            return self._empty_detail_info(boe_id)
        finally:
            if page:
                self.browser_manager.close_page(page)

    def _empty_detail_info(self, boe_id: str) -> Dict[str, Optional[str]]:
        return {
            'general_info': None,
            'autoridad_gestora': None,
            'bienes_info': None,
            'pujas_info': None,
            'warning': None,
            'detail_url': f"{self.DETAIL_URL}?idSub={boe_id}",
            'cadastral_ref': None,
            'cadastral_data': None,
        }

    def _extract_detail_from_page(self, page: Any, boe_id: str,
                                  detail_url: str) -> Dict[str, Optional[str]]:
        """
        Extract all detail-page fields from an ALREADY-NAVIGATED page. Shared by
        the shared-browser path (_fetch_detail_info) and the own-browser path
        (CategoryBOEScraper._fetch_detail_info), so the extraction logic lives in
        exactly one place regardless of which browser opened the page.
        """
        try:
            # Extract all major sections
            general_info = (
                self._extract_section_text(page, 'Información general') or
                self._extract_section_text(page, 'Datos de la subasta')
            )
            
            complement = self._extract_section_text(page, 'Información complementaria de la subasta')
            if complement:
                general_info = f"{general_info}\n{complement}" if general_info else complement

            autoridad = self._extract_section_text(page, 'Autoridad Gestora')
            bienes = self._extract_section_text(page, 'Bienes')
            pujas = self._extract_section_text(page, 'Pujas')
            
            warning = (
                self._extract_section_text(page, 'Advertencias') or
                self._extract_section_text(page, 'Advertencia') or
                self._extract_warning_banner(page)
            )

            cadastral_ref, cadastral_data = extract_cadastral_refs(bienes)

            # AUTHORITATIVE financial fields, identifier (title) and status live
            # on the detail page as label/value pairs — NOT on the search listing
            # card. The listing-card regex never matched these labels, which is the
            # root cause of appraisal=0 / minimum_bid=None / title="Unknown".
            try:
                body_text = page.inner_text('body')
            except Exception:
                body_text = ''

            # Authoritative dates from the detail page (label/value pairs):
            #   "Fecha de inicio"      -> start of the bidding window
            #   "Fecha de conclusión"  -> end of the bidding window (= endsAt)
            start_at = self._extract_detail_date(body_text, ['Fecha de inicio'])
            ends_at = self._extract_detail_date(
                body_text, ['Fecha de conclusión', 'Fecha de fin', 'Fecha de finalización']
            )

            # Status resolution, most-authoritative first:
            #   1. an explicit banner (cancelada / suspendida / concluida), then
            #   2. a conclusion date already in the past => concluded. This is the
            #      robust signal for AEAT (SUB-AT-*) pages, which carry no
            #      "concluida" banner — only a past "Fecha de conclusión".
            detail_status = self._extract_detail_status(body_text)
            if detail_status is None and ends_at is not None and ends_at < datetime.now():
                detail_status = 'CONCLUIDA_PORTAL'

            return {
                'general_info': general_info,
                'autoridad_gestora': autoridad,
                'bienes_info': bienes,
                'pujas_info': pujas,
                'warning': warning,
                'detail_url': detail_url,
                'cadastral_ref': cadastral_ref,
                'cadastral_data': cadastral_data,
                'identificador': self._extract_label_value(body_text, ['Identificador']),
                'appraisal_value': self._extract_currency(body_text, ['Tasación', 'Valoración']),
                'valor_subasta': self._extract_currency(body_text, ['Valor subasta']),
                'minimum_bid': self._extract_minimum_bid(body_text),
                'deposit_amount': self._extract_currency(body_text, ['Importe del depósito', 'Depósito']),
                'claimed_amount': self._extract_currency(body_text, ['Cantidad reclamada']),
                'tipo_subasta': self._extract_label_value(body_text, ['Tipo de subasta']),
                'anuncio_boe': self._extract_label_value(body_text, ['Anuncio BOE']),
                'lotes': self._extract_label_value(body_text, ['Lotes']),
                'start_at': start_at,
                'ends_at': ends_at,
                'detail_status': detail_status,
            }
        except Exception as e:
            self.log_warning(f"Failed to extract detail info for {boe_id}: {e}")
            return self._empty_detail_info(boe_id)

    def _extract_section_text(self, page: Any, title: str) -> Optional[str]:
        try:
            return page.evaluate(
                """
                (title) => {
                  const headings = Array.from(document.querySelectorAll('h2, h3, h4'))
                    .filter(h => (h.textContent || '').toLowerCase().includes(title.toLowerCase()));
                  if (!headings.length) return null;
                  const heading = headings[0];
                  const parts = [];
                  let el = heading.nextElementSibling;
                  while (el) {
                    if (['H2','H3','H4'].includes(el.tagName)) break;
                    if (el.innerText) parts.push(el.innerText.trim());
                    el = el.nextElementSibling;
                  }
                  const text = parts.join('\\n').trim();
                  return text.length ? text : null;
                }
                """,
                title
            )
        except Exception:
            return None

    def _extract_warning_banner(self, page: Any) -> Optional[str]:
        try:
            return page.evaluate(
                """
                () => {
                  const candidates = Array.from(document.querySelectorAll('body *'))
                    .filter(el => el.textContent && el.textContent.trim().toUpperCase().includes('ADVERTENCIA'));
                  if (!candidates.length) return null;
                  const text = candidates[0].textContent.trim();
                  return text.length ? text : null;
                }
                """
            )
        except Exception:
            return None
    
    def _mark_finished(self, boe_id: str, final_bid: Optional[float] = None, status: str = 'CONCLUIDA_PORTAL'):
        """Mark auction as finished with the appropriate status"""
        try:
            # Try transitioning from various active statuses
            for from_status in ['ACTIVE', 'CELEBRANDOSE', 'SUSPENDIDA']:
                try:
                    self.db_adapter.transition_status(boe_id, from_status, status)
                    break
                except:
                    continue
            
            if final_bid:
                # Update final bid in database
                pass
            self.log_info(f"Marked {boe_id} as {status}")
        except Exception as e:
            self.log_error(f"Failed to mark {boe_id} as {status}: {e}")
