"""
Geocoding Service
Service for converting addresses to coordinates.

Backend: Google Geocoding API (Spain-locked: region=es, components=country:ES).
Falls back to free Spanish Catastro coordinate API for cadastral references
(geocode_from_cadastral — unchanged, still uses ovc.catastro.meh.es).

Migrated 2026-05-31 from Nominatim to Google. Key resolution order:
  1. env GOOGLE_MAPS_API_KEY
  2. literal fallback (provided by Ken, works for this project)

Public surface preserved:
  - geocode_address(raw_address, province, municipality) -> Optional[(lat,lng)]
  - batch_geocode(addresses) -> List[Optional[(lat,lng)]]
  - parse_cadastral_ref(ref_id) -> bool
  - geocode_from_cadastral(ref_id) -> Optional[(lat,lng)]

Added:
  - geocode_address_detailed(...) -> Optional[GeocodeResult]
      Same lookup, but also returns location_type (ROOFTOP / RANGE_INTERPOLATED /
      GEOMETRIC_CENTER / APPROXIMATE) and formatted_address. Used by the backfill
      task to count centroid vs precise hits.
"""

import os
import requests
import time
import re
import unicodedata
from dataclasses import dataclass
from typing import Optional, Tuple, List
import logging

logger = logging.getLogger(__name__)


# Fallback key — Ken-provided, scoped to the lehubdelcreative GCP project.
# Prefer env GOOGLE_MAPS_API_KEY in prod. Hardcoded so dev/test still work
# without .env wiring, matching the brief.
_FALLBACK_GOOGLE_KEY = "AIzaSyB7aN2B-DSqAMbRF_mLXMCdu-9vRKOqjfk"


@dataclass
class GeocodeResult:
    latitude: float
    longitude: float
    location_type: str          # ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE
    formatted_address: str
    place_id: Optional[str] = None


class GeocodingService:
    """
    Geocoding service using Google Geocoding API.

    Polite throttle (RATE_LIMIT_DELAY) is light — Google's per-second QPS is
    high but we keep a tiny gap to avoid burst limits and to play nice with
    downstream Street View calls that often share the key.
    """

    GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
    RATE_LIMIT_DELAY = 0.05  # 20 req/s ceiling — well under Google's 50 QPS default

    def __init__(self, user_agent: str = "SubastaPro/2.0", api_key: Optional[str] = None):
        self.user_agent = user_agent
        self.api_key = (
            api_key
            or os.getenv("GOOGLE_MAPS_API_KEY")
            or _FALLBACK_GOOGLE_KEY
        )
        self.last_request_time = 0.0
        self.cache = {}  # cache_key -> GeocodeResult (or None for known-miss)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def geocode_address(
        self,
        raw_address: str,
        province: str,
        municipality: Optional[str] = None,
    ) -> Optional[Tuple[float, float]]:
        """Back-compat tuple return. Use geocode_address_detailed for location_type."""
        result = self.geocode_address_detailed(raw_address, province, municipality)
        if result is None:
            return None
        return (result.latitude, result.longitude)

    def geocode_address_detailed(
        self,
        raw_address: str,
        province: str,
        municipality: Optional[str] = None,
    ) -> Optional[GeocodeResult]:
        """
        Convert address to coordinates via Google Geocoding API.

        Returns GeocodeResult including location_type so callers can distinguish:
          - ROOFTOP            : exact street address
          - RANGE_INTERPOLATED : interpolated between known points on a street
          - GEOMETRIC_CENTER   : centre of a region (e.g. street, neighbourhood)
          - APPROXIMATE        : town/city centroid — still usable per Ken

        Returns None on hard failure (no results / network error / REQUEST_DENIED).
        """
        if not raw_address:
            return None

        cache_key = f"{raw_address}|{province}|{municipality}"
        if cache_key in self.cache:
            logger.debug(f"Cache hit for: {raw_address}")
            return self.cache[cache_key]

        full_address = self._build_full_address(raw_address, province, municipality)
        self._respect_rate_limit()

        try:
            params = {
                "address": full_address,
                "region": "es",
                "components": "country:ES",
                "key": self.api_key,
            }
            logger.info(f"Geocoding (Google): {full_address}")
            response = requests.get(self.GOOGLE_URL, params=params, timeout=10)
            self.last_request_time = time.time()

            if response.status_code != 200:
                logger.error(f"Google geocoding HTTP {response.status_code} for: {full_address}")
                return None

            data = response.json()
            status = data.get("status")

            # Hard failures — surface clearly, do NOT cache, caller can retry later.
            if status == "REQUEST_DENIED":
                logger.error(
                    "Google geocoding REQUEST_DENIED: %s — enable Geocoding API on the "
                    "GCP project that owns this key.",
                    data.get("error_message", ""),
                )
                return None
            if status == "OVER_QUERY_LIMIT":
                logger.error("Google geocoding OVER_QUERY_LIMIT — backing off")
                return None
            if status == "INVALID_REQUEST":
                logger.warning(f"Google geocoding INVALID_REQUEST for: {full_address}")
                return None

            # Soft miss — cache the None so we don't re-query the same dud.
            if status == "ZERO_RESULTS" or not data.get("results"):
                logger.warning(f"No results for: {full_address}")
                self.cache[cache_key] = None
                return None

            top = data["results"][0]
            geom = top.get("geometry", {})
            loc = geom.get("location", {})
            lat = loc.get("lat")
            lng = loc.get("lng")
            if lat is None or lng is None:
                logger.warning(f"Google result missing geometry.location for: {full_address}")
                self.cache[cache_key] = None
                return None

            result = GeocodeResult(
                latitude=float(lat),
                longitude=float(lng),
                location_type=geom.get("location_type", "APPROXIMATE"),
                formatted_address=top.get("formatted_address", full_address),
                place_id=top.get("place_id"),
            )
            self.cache[cache_key] = result
            logger.info(
                f"Geocoded ({result.location_type}): ({result.latitude}, {result.longitude}) "
                f"-> {result.formatted_address}"
            )
            return result

        except Exception as e:
            logger.error(f"Geocoding exception for {full_address}: {e}")
            return None

    def batch_geocode(
        self,
        addresses: List[Tuple[str, str, Optional[str]]],
    ) -> List[Optional[Tuple[float, float]]]:
        """Geocode multiple addresses (respecting rate limits). Tuple form for back-compat."""
        return [self.geocode_address(addr, prov, muni) for addr, prov, muni in addresses]

    # ------------------------------------------------------------------
    # Cadastral (unchanged — free Catastro API, no key required)
    # ------------------------------------------------------------------

    def parse_cadastral_ref(self, ref_id: str) -> bool:
        if not ref_id:
            return False
        ref_clean = ref_id.replace(" ", "").upper()
        if len(ref_clean) != 20:
            return False
        pattern = r"^[0-9]{14}[A-Z]{2}[0-9A-Z]{4}$"
        return bool(re.match(pattern, ref_clean))

    def geocode_from_cadastral(self, cadastral_ref: str) -> Optional[Tuple[float, float]]:
        """
        Coords from cadastral reference via free Spanish Catastro API.
        Unchanged across the Google migration.
        """
        if not self.parse_cadastral_ref(cadastral_ref):
            logger.warning(f"Invalid cadastral reference: {cadastral_ref}")
            return None

        cache_key = f"catastro|{cadastral_ref}"
        if cache_key in self.cache:
            cached = self.cache[cache_key]
            if isinstance(cached, tuple):
                return cached
            return None

        try:
            url = "http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC"
            params = {
                "Provincia": "",
                "Municipio": "",
                "RC": cadastral_ref,
                "SRS": "EPSG:4326",
            }

            self._respect_rate_limit()
            response = requests.get(url, params=params, timeout=10)
            self.last_request_time = time.time()

            if response.status_code == 200:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(response.content)
                coords_elem = root.find(".//{http://www.catastro.meh.es/}coordenadas")
                if coords_elem is not None:
                    coord_text = coords_elem.find("{http://www.catastro.meh.es/}coord")
                    if coord_text is not None and coord_text.text:
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

    # ------------------------------------------------------------------
    # Private helpers (normalization preserved verbatim from Nominatim impl)
    # ------------------------------------------------------------------

    def _build_full_address(self, address: str, province: str, municipality: Optional[str]) -> str:
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

        # Strip scraped-page noise
        value = re.sub(r"\bmapa de la zona\b", "", value, flags=re.IGNORECASE)
        value = re.sub(r"\bmapa del municipio\b", "", value, flags=re.IGNORECASE)
        value = re.sub(r"\bmapa de la provincia\b", "", value, flags=re.IGNORECASE)
        value = re.sub(r"\bcp\.?\s*\d{4,5}\b", "", value, flags=re.IGNORECASE)

        value = re.sub(r"\s*,\s*", ", ", value)
        value = re.sub(r"\s+", " ", value)
        return value.strip(" ,")

    def _respect_rate_limit(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.RATE_LIMIT_DELAY:
            time.sleep(self.RATE_LIMIT_DELAY - elapsed)
