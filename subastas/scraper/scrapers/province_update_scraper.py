"""
BOE Province/Municipality Update Scraper
Updates existing auctions with accurate province, municipality, and coordinate data.

Strategy:
- Queries existing auctions in batches (by date range)
- Re-fetches detail page from BOE
- Extracts province, municipality from detail page
- Uses geocoding to get coordinates
- Updates database records
"""

import sys
import os
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timedelta
import json
import logging
import re
import sqlite3
from pathlib import Path
import time

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scraper.core.stealth import random_delay
from scraper.config.settings import SCRAPER_ROOT, BOE_REQUEST_DELAY_SECONDS

logger = logging.getLogger(__name__)

# Spanish provinces list for validation
VALID_PROVINCES = {
    'álava', 'albacete', 'alicante', 'almería', 'asturias', 'ávila',
    'badajoz', 'barcelona', 'burgos', 'cáceres', 'cádiz', 'cantabria',
    'castellón', 'ciudad real', 'córdoba', 'cuenca', 'girona', 'granada',
    'guadalajara', 'gipuzkoa', 'huelva', 'huesca', 'illes balears', 'jaén',
    'a coruña', 'la rioja', 'las palmas', 'león', 'lleida', 'lugo', 'madrid',
    'málaga', 'murcia', 'navarra', 'ourense', 'palencia', 'pontevedra',
    'salamanca', 'segovia', 'sevilla', 'soria', 'tarragona',
    'santa cruz de tenerife', 'teruel', 'toledo', 'valencia', 'valladolid',
    'bizkaia', 'zamora', 'zaragoza', 'ceuta', 'melilla'
}


class ProvinceUpdateScraper:
    """Updates province/municipality data for existing auctions"""
    
    def __init__(self, scraper_id: int, db_path: str = None):
        self.scraper_id = scraper_id
        self.db_path = db_path or os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'database', 'prod.db')
        self.progress_file = SCRAPER_ROOT / f'province_update_{scraper_id}_progress.json'
        self.log_file = SCRAPER_ROOT / f'province_update_{scraper_id}_{datetime.now().strftime("%Y%m%d")}.log'
        
        # Setup logging
        self._setup_logging()
        
        # Browser will be initialized when needed
        self._playwright = None
        self._browser = None
        self._context = None
    
    def _setup_logging(self):
        """Setup file logging"""
        handler = logging.FileHandler(self.log_file)
        handler.setFormatter(logging.Formatter('[%(asctime)s] %(levelname)s: %(message)s'))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    
    def log_info(self, msg: str):
        """Log info message"""
        print(f"[Scraper {self.scraper_id}] {msg}")
        logger.info(f"[Scraper {self.scraper_id}] {msg}")
    
    def log_error(self, msg: str):
        """Log error message"""
        print(f"[Scraper {self.scraper_id}] ERROR: {msg}")
        logger.error(f"[Scraper {self.scraper_id}] {msg}")
    
    def _init_browser(self):
        """Initialize Playwright browser"""
        if self._browser is None:
            from playwright.sync_api import sync_playwright
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch(
                headless=False,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                ]
            )
            self._context = self._browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
            self.log_info("Browser initialized")
    
    def _close_browser(self):
        """Close browser"""
        if self._browser:
            try:
                self._browser.close()
                self._playwright.stop()
                self.log_info("Browser closed")
            except Exception as e:
                self.log_error(f"Error closing browser: {e}")
    
    def _get_page(self):
        """Get new page"""
        self._init_browser()
        page = self._context.new_page()
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            window.chrome = {runtime: {}};
        """)
        return page
    
    def extract_province_municipality(self, detail_html: str, boe_id: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract province and municipality from BOE detail page HTML.
        
        Returns: (province, municipality)
        """
        province = None
        municipality = None
        
        try:
            # Look for "Bien situado en" or "Ubicación" patterns
            ubicacion_patterns = [
                r'(?:Bien situado en|Ubicación|Situado en)[:\s]+([^,\n]+),?\s*([^,\n]*)',
                r'(?:Calle|Avenida|Plaza)[^,]+,\s*([^,]+),?\s*([^\n]*)',
                r'(\d{5})\s+([^,\n]+)',  # Postal code + municipality
            ]
            
            for pattern in ubicacion_patterns:
                match = re.search(pattern, detail_html, re.IGNORECASE)
                if match:
                    # Try to identify which group is province
                    groups = match.groups()
                    for group in groups:
                        if group:
                            normalized = group.lower().strip()
                            # Check if it's a known province
                            for valid_prov in VALID_PROVINCES:
                                if valid_prov in normalized or normalized in valid_prov:
                                    province = group.strip()
                                    break
                            if not province and len(normalized) > 3:
                                # Might be municipality
                                municipality = group.strip()
            
            # Also check for province in "Autoridad Gestora" section
            if not province:
                autoridad_patterns = [
                    r'Juzgado[^,]+ de ([^,\n]+)',
                    r'Tribunal[^,]+ de ([^,\n]+)',
                ]
                for pattern in autoridad_patterns:
                    match = re.search(pattern, detail_html, re.IGNORECASE)
                    if match:
                        candidate = match.group(1).strip()
                        normalized = candidate.lower()
                        for valid_prov in VALID_PROVINCES:
                            if valid_prov in normalized:
                                province = candidate
                                break
        
        except Exception as e:
            self.log_error(f"Error extracting location for {boe_id}: {e}")
        
        return (province, municipality)
    
    def fetch_and_update_auction(self, auction_id: str, boe_id: str) -> bool:
        """
        Fetch BOE detail page and update auction with province/municipality.
        
        Returns: True if updated successfully
        """
        page = None
        try:
            page = self._get_page()
            
            # Navigate to BOE detail page
            url = f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}"
            random_delay(2, 4)
            page.goto(url, wait_until='domcontentloaded', timeout=30000)
            random_delay(2, 3)
            
            # Extract province and municipality from page using text content
            province, municipality = self.extract_from_page(page, boe_id)
            
            if province:
                # Clean up HTML tags
                import re
                province = re.sub(r'<[^>]+>', '', province).strip()
                if municipality:
                    municipality = re.sub(r'<[^>]+>', '', municipality).strip()
                
                # Validate cleaned province
                if province.lower() not in ['unknown', 'desconocida', 'null', 'undefined'] and len(province) > 1:
                    # Update database
                    conn = sqlite3.connect(self.db_path)
                    cursor = conn.cursor()
                    
                    cursor.execute("""
                        UPDATE Auction 
                        SET province = ?,
                            municipality = ?,
                            updatedAt = CURRENT_TIMESTAMP
                        WHERE id = ?
                    """, (province, municipality, auction_id))
                    
                    conn.commit()
                    conn.close()
                    
                    self.log_info(f"✓ Updated {boe_id}: {province}, {municipality or 'N/A'}")
                    return True
                else:
                    self.log_info(f"⚠ Invalid province for {boe_id}: {province}")
                    return False
            else:
                self.log_info(f"⚠ No province found for {boe_id}")
                return False
        
        except Exception as e:
            self.log_error(f"Error updating {boe_id}: {e}")
            return False
        
        finally:
            if page:
                try:
                    page.close()
                except:
                    pass
    
    def extract_from_page(self, page, boe_id: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract province and municipality from live page.
        
        Returns: (province, municipality)
        """
        province = None
        municipality = None
        
        try:
            # Try to find "Información general" section
            general_section = page.locator('.informacion-general, #informacion-general, .datos-generales')
            if general_section.count() > 0:
                text = general_section.first.inner_text()
                
                # Look for location patterns in clean text
                lines = text.split('\n')
                for line in lines:
                    line_clean = line.strip()
                    
                    # Check if line contains a known province
                    line_lower = line_clean.lower()
                    for valid_prov in VALID_PROVINCES:
                        if valid_prov in line_lower:
                            # Extract just the province name
                            province = self._extract_province_name(line_clean, valid_prov)
                            break
                    
                    if province:
                        break
            
            # Also try Autoridad Gestora section
            if not province:
                autoridad = page.locator('.autoridad-gestora, .autoridad')
                if autoridad.count() > 0:
                    text = autoridad.first.inner_text()
                    # Look for "Juzgado de X" or "Tribunal de X"
                    match = re.search(r'Juzgado[^\n]+ de ([^\n,]+)', text, re.IGNORECASE)
                    if not match:
                        match = re.search(r'Tribunal[^\n]+ de ([^\n,]+)', text, re.IGNORECASE)
                    
                    if match:
                        candidate = match.group(1).strip()
                        candidate_lower = candidate.lower()
                        for valid_prov in VALID_PROVINCES:
                            if valid_prov in candidate_lower:
                                province = candidate
                                break
            
            # Try to find municipality from address
            if province:
                address_elem = page.locator('.direccion, .ubicacion, [class*="direcc"]')
                if address_elem.count() > 0:
                    addr_text = address_elem.first.inner_text()
                    # Look for postal code pattern
                    postal_match = re.search(r'(\d{5})\s+([^,\n]+)', addr_text)
                    if postal_match:
                        municipality = postal_match.group(2).strip()
        
        except Exception as e:
            self.log_error(f"Error extracting from page {boe_id}: {e}")
        
        return (province, municipality)
    
    def _extract_province_name(self, text: str, valid_province: str) -> str:
        """Extract clean province name from text containing it"""
        # Try to isolate just the province name
        text_lower = text.lower()
        idx = text_lower.find(valid_province)
        if idx >= 0:
            # Get substring starting from province
            substr = text[idx:idx+len(valid_province)+20]
            # Take just the province part (capitalize properly)
            return valid_province.title()
        return valid_province.title()
    
    def update_date_range(
        self,
        start_year: int,
        start_month: int,
        start_day: int,
        end_year: int,
        end_month: int,
        end_day: int,
        resume: bool = True
    ) -> Dict[str, Any]:
        """
        Update auctions in date range in 15-day batches.
        """
        # Load progress
        progress = self._load_progress() if resume else {
            'scraper_id': self.scraper_id,
            'completed_batches': [],
            'total_updated': 0,
            'total_failed': 0,
            'total_batches': 0,
        }
        
        # Generate 15-day batches
        batches = self._generate_15day_batches(
            datetime(start_year, start_month, start_day),
            datetime(end_year, end_month, end_day)
        )
        
        progress['total_batches'] = len(batches)
        
        self.log_info(f"Starting: {len(batches)} batches")
        self.log_info(f"Range: {start_year}-{start_month:02d}-{start_day:02d} to {end_year}-{end_month:02d}-{end_day:02d}")
        
        for idx, (batch_start, batch_end) in enumerate(batches):
            batch_key = f"{batch_start.strftime('%Y-%m-%d')}_to_{batch_end.strftime('%Y-%m-%d')}"
            
            if resume and batch_key in progress['completed_batches']:
                self.log_info(f"Skipping {batch_key} (completed)")
                continue
            
            self.log_info(f"\nBatch {idx + 1}/{len(batches)}: {batch_key}")
            
            try:
                updated, failed = self._process_batch(batch_start, batch_end)
                
                progress['completed_batches'].append(batch_key)
                progress['total_updated'] += updated
                progress['total_failed'] += failed
                
                self._save_progress(progress)
                
                self.log_info(f"✓ Batch complete: Updated {updated}, Failed {failed}")
                
            except Exception as e:
                self.log_error(f"Failed batch {batch_key}: {e}")
                self._save_progress(progress)
            
            # Delay between batches
            if idx < len(batches) - 1:
                random_delay(10, 15)
        
        self.log_info(f"\nCOMPLETE: Updated {progress['total_updated']:,} auctions")
        self._close_browser()
        
        return progress
    
    def _generate_15day_batches(self, start_date: datetime, end_date: datetime) -> List[tuple]:
        """Generate list of 15-day batch tuples"""
        batches = []
        current = start_date
        
        while current <= end_date:
            batch_end = min(current + timedelta(days=14), end_date)
            batches.append((current, batch_end))
            current = batch_end + timedelta(days=1)
        
        return batches
    
    def _process_batch(self, start_date: datetime, end_date: datetime) -> Tuple[int, int]:
        """
        Process a 15-day batch of auctions.
        
        Returns: (updated_count, failed_count)
        """
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        # Query auctions in this date range with invalid provinces
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, boeId
            FROM Auction
            WHERE publishedAt >= ? AND publishedAt <= ?
            AND (
                province IS NULL 
                OR LOWER(province) IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
                OR LENGTH(TRIM(province)) <= 1
            )
            ORDER BY publishedAt
        """, (start_str, end_str))
        
        auctions = cursor.fetchall()
        conn.close()
        
        self.log_info(f"  Found {len(auctions)} auctions to update")
        
        updated = 0
        failed = 0
        
        for idx, (auction_id, boe_id) in enumerate(auctions):
            if idx > 0 and idx % 10 == 0:
                self.log_info(f"  Progress: {idx}/{len(auctions)}")
                random_delay(2, 4)
            
            if self.fetch_and_update_auction(auction_id, boe_id):
                updated += 1
            else:
                failed += 1
            
            # Rate limiting
            random_delay(BOE_REQUEST_DELAY_SECONDS, BOE_REQUEST_DELAY_SECONDS + 2)
        
        return (updated, failed)
    
    def _load_progress(self) -> Dict[str, Any]:
        """Load progress from JSON"""
        if self.progress_file.exists():
            try:
                with open(self.progress_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load progress: {e}")
        
        return {
            'scraper_id': self.scraper_id,
            'completed_batches': [],
            'total_updated': 0,
            'total_failed': 0,
            'total_batches': 0,
        }
    
    def _save_progress(self, progress: Dict[str, Any]):
        """Save progress to JSON"""
        try:
            progress['last_updated'] = datetime.now().isoformat()
            with open(self.progress_file, 'w') as f:
                json.dump(progress, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save progress: {e}")


def run_scraper(scraper_id: int, start_year: int, start_month: int, start_day: int,
                end_year: int, end_month: int, end_day: int):
    """Run province update scraper for a specific date range"""
    scraper = ProvinceUpdateScraper(scraper_id)
    return scraper.update_date_range(
        start_year, start_month, start_day,
        end_year, end_month, end_day,
        resume=True
    )


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Update auction provinces/municipalities')
    parser.add_argument('--id', type=int, required=True, help='Scraper ID (1-6)')
    parser.add_argument('--start', required=True, help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end', required=True, help='End date (YYYY-MM-DD)')
    
    args = parser.parse_args()
    
    start = datetime.strptime(args.start, '%Y-%m-%d')
    end = datetime.strptime(args.end, '%Y-%m-%d')
    
    run_scraper(
        args.id,
        start.year, start.month, start.day,
        end.year, end.month, end.day
    )
