"""
Geocoding Service
Service for converting addresses to coordinates.

Backend: FREE OpenStreetMap / Nominatim (Spain-locked: countrycodes=es) by default.
Google Geocoding API is RETAINED behind GEOCODER_BACKEND=google as an instant,
rebuild-free rollback lever — but the DEFAULT is the free provider.

Falls back to free Spanish Catastro coordinate API for cadastral references
(geocode_from_cadastral — unchanged, still uses ovc.catastro.meh.es).

History:
  - Originally Nominatim.
  - Migrated 2026-05-31 Nominatim -> Google (paid).
  - Reverted 2026-06-08 Google -> Nominatim (FREE) per Dennis directive
    ("SWAP FOR FREE! NO PAYING FOR FINALIZED AUCTIONS!"). All the precision /
    keep-APPROXIMATE / town-fallback improvements layered on since the Google
    migration are PRESERVED — only the HTTP backend swapped back to free.

Provider selection (GEOCODER_BACKEND env, default "nominatim"):
  - "nominatim"  -> FREE OSM/Nominatim (DEFAULT)
  - "google"     -> Google Geocoding API (rollback only; requires a key)

Public surface preserved:
  - geocode_address(raw_address, province, municipality) -> Optional[(lat,lng)]
  - batch_geocode(addresses) -> List[Optional[(lat,lng)]]
  - parse_cadastral_ref(ref_id) -> bool
  - geocode_from_cadastral(ref_id) -> Optional[(lat,lng)]

Added:
  - geocode_address_detailed(...) -> Optional[GeocodeResult]
      Same lookup, but also returns location_type (ROOFTOP / RANGE_INTERPOLATED /
      GEOMETRIC_CENTER / APPROXIMATE) and formatted_address. Used by the backfill
      task to count centroid vs precise hits. Nominatim has no location_type enum,
      so it is SYNTHESIZED from addresstype/class/type to keep the same four enum
      strings the downstream precision_counts buckets depend on.
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
# Only used when GEOCODER_BACKEND=google (rollback). Prefer env GOOGLE_MAPS_API_KEY.
# Kept solely so the Google rollback path still works without .env wiring.
_FALLBACK_GOOGLE_KEY = "AIzaSyB7aN2B-DSqAMbRF_mLXMCdu-9vRKOqjfk"

# Mandatory descriptive User-Agent for Nominatim. The OSM usage policy BANS
# requests with a missing/empty/generic User-Agent — this string identifies the
# app + a contact so OSM can reach us instead of silently IP-banning the box.
_NOMINATIM_USER_AGENT = (
    "SubastasActivas/1.0 (https://subastasactivas.com; dennis.kotlenko@gmail.com)"
)


@dataclass
class GeocodeResult:
    latitude: float
    longitude: float
    location_type: str          # ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE
    formatted_address: str
    place_id: Optional[str] = None


class GeocodingService:
    """
    Geocoding service. FREE OSM/Nominatim by default; Google behind an env flag.

    RATE LIMIT — LOAD-BEARING, DO NOT LOWER:
      Nominatim's free usage policy permits at most ~1 request/second from a
      single source. Exceeding it gets the box IP BANNED. RATE_LIMIT_DELAY is
      therefore 1.1s (≈0.9 req/s, safely under the 1 req/s ceiling). The drain
      and backfill run SINGLE-THREADED — never add concurrency to a Nominatim
      path. Do not "optimize" this constant back down.
    """

    NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
    GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

    # 1.1s ≈ 0.9 req/s — Nominatim free-tier policy is ~1 req/s HARD CAP.
    # This value is genuinely load-bearing (not cosmetic): faster than this and
    # OSM bans the box IP. See class docstring.
    RATE_LIMIT_DELAY = 1.1

    def __init__(
        self,
        user_agent: str = _NOMINATIM_USER_AGENT,
        api_key: Optional[str] = None,
        backend: Optional[str] = None,
    ):
        # Default backend is the FREE provider. GEOCODER_BACKEND=google flips to
        # the paid Google path (rollback lever — no rebuild needed, just recreate
        # the container with the env set).
        self.backend = (
            backend
            or os.getenv("GEOCODER_BACKEND")
            or "nominatim"
        ).strip().lower()

        # Descriptive UA is mandatory for Nominatim. Guard against an empty/
        # generic override leaking in and getting us banned.
        self.user_agent = user_agent or _NOMINATIM_USER_AGENT

        # Google key only resolved/needed for the rollback path.
        self.api_key = (
            api_key
            or os.getenv("GOOGLE_MAPS_API_KEY")
            or _FALLBACK_GOOGLE_KEY
        )
        self.last_request_time = 0.0
        self.cache = {}  # cache_key -> GeocodeResult (or None for known-miss)

        logger.info(f"GeocodingService backend = '{self.backend}'")

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
        Convert address to coordinates.

        Routes to the configured backend (FREE Nominatim by default, Google only
        when GEOCODER_BACKEND=google). Both return the same GeocodeResult contract
        with a location_type drawn from:
          - ROOFTOP            : exact street address / building
          - RANGE_INTERPOLATED : a street / road
          - GEOMETRIC_CENTER   : neighbourhood / district
          - APPROXIMATE        : town/city centroid — still usable per Dennis

        Returns None on hard failure (no results / network error). Shared cache,
        shared address-building, shared rate limit across both backends.
        """
        if not raw_address:
            return None

        cache_key = f"{raw_address}|{province}|{municipality}"
        if cache_key in self.cache:
            logger.debug(f"Cache hit for: {raw_address}")
            return self.cache[cache_key]

        full_address = self._build_full_address(raw_address, province, municipality)
        self._respect_rate_limit()

        if self.backend == "google":
            return self._geocode_google(full_address, cache_key)
        return self._geocode_nominatim(full_address, cache_key)

    # ------------------------------------------------------------------
    # Nominatim backend (FREE — default)
    # ------------------------------------------------------------------

    def _geocode_nominatim(self, full_address: str, cache_key: str) -> Optional[GeocodeResult]:
        """
        Geocode via OpenStreetMap / Nominatim (free). Spain-locked via
        countrycodes=es (the equivalent of Google's components=country:ES).
        """
        try:
            params = {
                "q": full_address,
                "format": "jsonv2",
                "addressdetails": 1,
                "countrycodes": "es",
                "limit": 1,
                "accept-language": "es",
            }
            headers = {"User-Agent": self.user_agent}
            logger.info(f"Geocoding (Nominatim): {full_address}")
            response = requests.get(
                self.NOMINATIM_URL, params=params, headers=headers, timeout=10
            )
            self.last_request_time = time.time()

            # 429 / 503 = rate-limit / over-capacity. TRANSIENT — do NOT cache a
            # None (it's not a real miss); caller retries on the next cron tick.
            if response.status_code in (429, 503):
                logger.warning(
                    f"Nominatim throttled (HTTP {response.status_code}) for: {full_address} "
                    f"— backing off, not caching as miss"
                )
                return None

            if response.status_code != 200:
                logger.error(
                    f"Nominatim geocoding HTTP {response.status_code} for: {full_address}"
                )
                return None

            data = response.json()

            # Empty array = genuine soft miss. Cache the None so we don't re-query
            # the same dud (matters more at 1 req/s).
            if not isinstance(data, list) or not data:
                logger.warning(f"No results for: {full_address}")
                self.cache[cache_key] = None
                return None

            top = data[0]
            lat_raw = top.get("lat")
            lon_raw = top.get("lon")
            if lat_raw is None or lon_raw is None:
                logger.warning(f"Nominatim result missing lat/lon for: {full_address}")
                self.cache[cache_key] = None
                return None

            try:
                lat = float(lat_raw)
                lng = float(lon_raw)
            except (TypeError, ValueError):
                logger.warning(f"Nominatim lat/lon not parseable for: {full_address}")
                self.cache[cache_key] = None
                return None

            location_type = self._nominatim_precision(top)

            result = GeocodeResult(
                latitude=lat,
                longitude=lng,
                location_type=location_type,
                formatted_address=top.get("display_name", full_address),
                place_id=str(top["place_id"]) if top.get("place_id") is not None else None,
            )
            self.cache[cache_key] = result
            logger.info(
                f"Geocoded ({result.location_type}): ({result.latitude}, {result.longitude}) "
                f"-> {result.formatted_address}"
            )
            return result

        except Exception as e:
            logger.error(f"Nominatim geocoding exception for {full_address}: {e}")
            return None

    @staticmethod
    def _nominatim_precision(top: dict) -> str:
        """
        Synthesize a Google-style location_type from Nominatim jsonv2 fields so
        the downstream precision_counts vocabulary stays {ROOFTOP,
        RANGE_INTERPOLATED, GEOMETRIC_CENTER, APPROXIMATE}. Best-effort bucket —
        exact Google parity is NOT required, only enum-string stability.

        Mapping (per brief 3b):
          addresstype in {house, building, address}  OR class=place & type=house
              -> ROOFTOP
          addresstype in {road, street}              OR class=highway
              -> RANGE_INTERPOLATED
          addresstype in {neighbourhood, suburb, quarter, city_district}
              -> GEOMETRIC_CENTER
          everything else (city/town/village/municipality/administrative/missing)
              -> APPROXIMATE
        """
        addresstype = (top.get("addresstype") or "").strip().lower()
        osm_class = (top.get("class") or "").strip().lower()
        osm_type = (top.get("type") or "").strip().lower()

        if addresstype in ("house", "building", "address") or (
            osm_class == "place" and osm_type == "house"
        ):
            return "ROOFTOP"
        if addresstype in ("road", "street") or osm_class == "highway":
            return "RANGE_INTERPOLATED"
        if addresstype in ("neighbourhood", "suburb", "quarter", "city_district"):
            return "GEOMETRIC_CENTER"
        return "APPROXIMATE"

    # ------------------------------------------------------------------
    # Google backend (PAID — rollback only, behind GEOCODER_BACKEND=google)
    # ------------------------------------------------------------------

    def _geocode_google(self, full_address: str, cache_key: str) -> Optional[GeocodeResult]:
        """
        Geocode via Google Geocoding API. RETAINED for rollback only — the
        default backend is the free Nominatim path. Spain-locked (region=es,
        components=country:ES). Native location_type enum, so no synthesis.
        """
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
        Unchanged across both the Google migration and this free-revert.
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
    # Private helpers (normalization preserved verbatim — written for Nominatim)
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
