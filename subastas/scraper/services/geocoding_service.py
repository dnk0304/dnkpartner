"""
Geocoding Service
Service for converting addresses to coordinates using Nominatim (OpenStreetMap)
"""

import requests
import time
import re
import unicodedata
from typing import Optional, Tuple, List
import logging

logger = logging.getLogger(__name__)


class GeocodingService:
    """
    Geocoding service using Nominatim (OpenStreetMap)
    Free service with 1 request per second rate limit
    """
    
    NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
    RATE_LIMIT_DELAY = 1.0  # seconds (Nominatim policy)
    
    def __init__(self, user_agent: str = "SubastaPro/1.0"):
        self.user_agent = user_agent
        self.last_request_time = 0
        self.cache = {}  # Simple in-memory cache
    
    def geocode_address(self, raw_address: str, province: str, municipality: Optional[str] = None) -> Optional[Tuple[float, float]]:
        """
        Convert address to coordinates
        
        Args:
            raw_address: Raw address string
            province: Province name
            municipality: Municipality name (optional, improves accuracy)
        
        Returns:
            Tuple of (latitude, longitude) or None if geocoding fails
        """
        if not raw_address:
            return None
        
        # Check cache
        cache_key = f"{raw_address}|{province}|{municipality}"
        if cache_key in self.cache:
            logger.debug(f"Cache hit for: {raw_address}")
            return self.cache[cache_key]
        
        # Build full address for better accuracy
        full_address = self._build_full_address(raw_address, province, municipality)
        
        # Rate limiting
        self._respect_rate_limit()
        
        try:
            params = {
                'q': full_address,
                'format': 'json',
                'addressdetails': 1,
                'limit': 1,
                'countrycodes': 'es',  # Limit to Spain
            }
            
            headers = {
                'User-Agent': self.user_agent
            }
            
            logger.info(f"Geocoding: {full_address}")
            response = requests.get(self.NOMINATIM_URL, params=params, headers=headers, timeout=10)
            self.last_request_time = time.time()
            
            if response.status_code == 200:
                results = response.json()
                
                if results and len(results) > 0:
                    lat = float(results[0]['lat'])
                    lng = float(results[0]['lon'])
                    
                    # Cache result
                    self.cache[cache_key] = (lat, lng)
                    
                    logger.info(f"Geocoded successfully: ({lat}, {lng})")
                    return (lat, lng)
                else:
                    logger.warning(f"No results for: {full_address}")
                    return None
            else:
                logger.error(f"Geocoding request failed: {response.status_code}")
                return None
        
        except Exception as e:
            logger.error(f"Geocoding exception for {full_address}: {e}")
            return None
    
    def batch_geocode(self, addresses: List[Tuple[str, str, Optional[str]]]) -> List[Optional[Tuple[float, float]]]:
        """
        Geocode multiple addresses in batch (respecting rate limits)
        
        Args:
            addresses: List of (address, province, municipality) tuples
        
        Returns:
            List of (lat, lng) tuples or None for failed geocoding
        """
        results = []
        
        for address, province, municipality in addresses:
            coords = self.geocode_address(address, province, municipality)
            results.append(coords)
        
        return results
    
    def parse_cadastral_ref(self, ref_id: str) -> bool:
        """
        Validate Spanish cadastral reference format
        
        Format: 20 characters (example: 1234567AB1234C0001AB)
        
        Args:
            ref_id: Cadastral reference string
        
        Returns:
            True if valid format, False otherwise
        """
        if not ref_id:
            return False
        
        # Remove spaces and convert to uppercase
        ref_clean = ref_id.replace(' ', '').upper()
        
        # Spanish cadastral reference is 20 characters
        if len(ref_clean) != 20:
            return False
        
        # Basic pattern check (14 digits + 2 letters + 4 alphanumeric)
        pattern = r'^[0-9]{14}[A-Z]{2}[0-9A-Z]{4}$'
        
        if re.match(pattern, ref_clean):
            return True
        
        return False
    
    def geocode_from_cadastral(self, cadastral_ref: str) -> Optional[Tuple[float, float]]:
        """
        Get coordinates from cadastral reference using Catastro API
        
        NOTE: This uses the free Spanish Catastro API
        API: https://ovc.catastro.meh.es/ovcservweb/
        
        Args:
            cadastral_ref: Cadastral reference
        
        Returns:
            (latitude, longitude) or None
        """
        if not self.parse_cadastral_ref(cadastral_ref):
            logger.warning(f"Invalid cadastral reference: {cadastral_ref}")
            return None
        
        # Check cache
        cache_key = f"catastro|{cadastral_ref}"
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        try:
            # Catastro Coordinate API
            url = "http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC"
            
            params = {
                'Provincia': '',
                'Municipio': '',
                'RC': cadastral_ref,
                'SRS': 'EPSG:4326',  # WGS84 (standard lat/lng)
            }
            
            self._respect_rate_limit()
            response = requests.get(url, params=params, timeout=10)
            self.last_request_time = time.time()
            
            if response.status_code == 200:
                # Parse XML response
                import xml.etree.ElementTree as ET
                root = ET.fromstring(response.content)
                
                # Find coordinates in XML
                coords_elem = root.find('.//{http://www.catastro.meh.es/}coordenadas')
                if coords_elem is not None:
                    coord_text = coords_elem.find('{http://www.catastro.meh.es/}coord')
                    if coord_text is not None and coord_text.text:
                        # Format: "lat lng"
                        parts = coord_text.text.split()
                        if len(parts) == 2:
                            lat = float(parts[0])
                            lng = float(parts[1])
                            
                            self.cache[cache_key] = (lat, lng)
                            logger.info(f"Cadastral geocoded: {cadastral_ref} -> ({lat}, {lng})")
                            return (lat, lng)
                
                logger.warning(f"No coordinates found for cadastral ref: {cadastral_ref}")
                return None
        
        except Exception as e:
            logger.error(f"Catastro API error for {cadastral_ref}: {e}")
            return None
    
    # Private helpers
    
    def _build_full_address(self, address: str, province: str, municipality: Optional[str]) -> str:
        """Build full address string for better geocoding accuracy"""
        address = self._normalize_text(address)
        province = self._normalize_text(province)
        municipality = self._normalize_text(municipality) if municipality else None

        parts: List[str] = []
        if address:
            parts.append(address)
        
        if municipality:
            parts.append(municipality)
        
        if province:
            parts.append(province)
        parts.append("España")
        
        return ", ".join(parts)

    def _normalize_text(self, text: Optional[str]) -> str:
        if not text:
            return ""
        value = text.strip()

        # Attempt to repair common mojibake (latin1 -> utf-8)
        try:
            repaired = value.encode("latin1").decode("utf-8")
            if repaired.count("�") < value.count("�"):
                value = repaired
        except Exception:
            pass

        value = unicodedata.normalize("NFKC", value)

        # Remove common noise from scraped addresses
        value = re.sub(r"\bmapa de la zona\b", "", value, flags=re.IGNORECASE)
        value = re.sub(r"\bmapa del municipio\b", "", value, flags=re.IGNORECASE)
        value = re.sub(r"\bmapa de la provincia\b", "", value, flags=re.IGNORECASE)
        value = re.sub(r"\bcp\.?\s*\d{4,5}\b", "", value, flags=re.IGNORECASE)

        # Normalize separators and whitespace
        value = re.sub(r"\s*,\s*", ", ", value)
        value = re.sub(r"\s+", " ", value)
        return value.strip(" ,")
    
    def _respect_rate_limit(self):
        """Sleep if necessary to respect rate limit"""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.RATE_LIMIT_DELAY:
            time.sleep(self.RATE_LIMIT_DELAY - elapsed)
