"""
Seguridad Social (TGSS) auction scraper — source="SEGSOCIAL".

Scrapes the Tesorería General de la Seguridad Social public auction portal of
seized assets (fincas rústicas/urbanas, vehículos, embarcaciones, resto de
bienes muebles) at https://w6.seg-social.es/subastas/. These are NOT published
in the BOE, so the BOE scrapers never see them — this is a genuinely separate
source.

Portal mechanics (reversed 2026-06-04, Ghost): a server-rendered, stateful Java
search wizard behind the controller `SubaSeControladorInter`. No JSON/API, no
captcha, no Cloudflare; just a JSESSIONID cookie + `opcion=` step params. Plain
`requests` walks it end-to-end — Playwright is NOT needed. The walk:

  0. GET  /subastas/SubaSeControladorInter                         (prime JSESSIONID)
  1. GET  ?opcion=10&EMB_TIPOBIEN=0101..0215&ok=Continuar          (select all 5 asset types)
  2. GET  ?opcion=8&tipoOperacion=1                                (national result context, page 1)
  3. GET  ?pagina=N&opcion=8&tipoOperacion=1   for N=2..last       (collect EMB_IDs)
  4. GET  ?opcion=13&EMB_ID={id}&opcion2=1&tipoOperacion=1         (per-bien ficha detail)

`EMB_ID` (in the detail URL) is the stable, per-bien-unique identifier — it is
our dedupe anchor. The administrative `Expediente` (e.g. "03 03 24 000653") can
be shared across several bienes of the same debtor, so it is NOT unique on its
own; we keep it in procedureNumber/courtReference for provenance.

Dedupe key:  boeId = "SUB-SS-{EMB_ID}".
Source tag:  source = "SEGSOCIAL"  (Auction.source column already exists + indexed; NO migration).
Prices:      honest-NULL — appraisalValue = Importe de Tasación; valorSubasta and
             minimumBid = Tipo de enajenación (the auction/sale value — valorSubasta
             feeds the detail-page 5% deposit derivation). If a figure is absent we
             write NULL, never 0; we NEVER copy Tasación into valorSubasta.
Status:      future auction date -> PROXIMA_APERTURA (+ opensAt); today/now -> CELEBRANDOSE.
"""

import os
import re
import time
import random
import unicodedata
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

import requests
from bs4 import BeautifulSoup

from .bank_base_scraper import BankBaseScraper
from ..config.provinces import ALL_PROVINCES, get_province_by_code
from ..config.categories import get_category_type
from .vehicle_parser import set_vehicle_fields

import logging

logger = logging.getLogger(__name__)

# Controller + the five asset-type checkbox codes (we want everything).
PORTAL_BASE = "https://w6.seg-social.es"
CONTROLLER = "/subastas/SubaSeControladorInter"
ASSET_TYPE_CODES = ["0101", "0102", "0211", "0212", "0215"]
# 0101 Finca Rústica, 0102 Finca Urbana, 0211 Vehículo, 0212 Embarcación,
# 0215 Resto de Bienes Muebles. We map each EMB_TIPOBIEN code to a category hint.
ASSET_TYPE_CATEGORY = {
    "0101": "Fincas rústicas",
    "0102": "Viviendas",
    "0211": "Turismos",
    "0212": "Barcos",
    "0215": "Otros bienes muebles",
}

# Accent-folded canonical province lookup, built ONCE from the repo's province
# list (no parallel list). Folds "ALICANTE"/"alicante"/"Alacant" variants to the
# canonical accented key so a TGSS province collapses into the same bucket a BOE
# row would. We also map the common TGSS/valenciano/euskera display variants.
def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


_PROVINCE_FOLD = {_fold(name): name for name in ALL_PROVINCES.keys()}
# Bilingual / portal display variants -> canonical repo key.
_PROVINCE_ALIASES = {
    "alacant": "Alicante", "alicante/alacant": "Alicante", "alacant/alicante": "Alicante",
    "castello": "Castellón", "castellon/castello": "Castellón", "castello/castellon": "Castellón",
    "valencia": "Valencia", "valencia/valencia": "Valencia", "valencia/valència": "Valencia",
    "araba": "Álava", "araba/alava": "Álava", "alava/araba": "Álava",
    "gipuzkoa": "Guipúzcoa", "guipuzcoa": "Guipúzcoa",
    "bizkaia": "Vizcaya", "vizcaya": "Vizcaya",
    "illes balears": "Baleares", "islas baleares": "Baleares", "baleares": "Baleares",
    "las palmas": "Las Palmas", "santa cruz de tenerife": "Santa Cruz de Tenerife",
    "girona": "Girona", "gerona": "Girona",
    "lleida": "Lleida", "lerida": "Lleida",
    "ourense": "Orense", "orense": "Orense",
    "a coruna": "La Coruña", "coruna": "La Coruña", "la coruna": "La Coruña",
    # Single-province communities where TGSS labels the bien by the provincial
    # capital / community name rather than the repo's province key.
    "oviedo": "Asturias", "asturias": "Asturias",
    "santander": "Cantabria", "cantabria": "Cantabria",
    "logrono": "La Rioja", "la rioja": "La Rioja", "rioja": "La Rioja",
    "pamplona": "Navarra", "iruna": "Navarra", "navarra": "Navarra",
    "palma": "Baleares", "palma de mallorca": "Baleares",
}

# Valid Spanish province codes (01-52). get_province_by_code() defaults to
# "Las Palmas" on an unknown code, so we only call it for a code in this set —
# anything else yields honest NULL instead of a wrong default.
_VALID_PROVINCE_CODES = {f"{n:02d}" for n in range(1, 53)}


def _province_from_postal(localizacion: str) -> Optional[str]:
    """Derive a canonical province from a 5-digit Spanish postal code embedded
    in the localización text (first two digits = province code). Honest-NULL
    when no valid CP is present."""
    for cp in re.findall(r"\b(\d{5})\b", localizacion):
        code = cp[:2]
        if code in _VALID_PROVINCE_CODES:
            name = get_province_by_code(code)
            if name:
                return name
    return None


def canonical_province(raw: Optional[str]) -> Optional[str]:
    """Fold a raw TGSS province string to the repo's canonical province name.

    Returns None (honest-NULL) when the input is empty or not recognisable —
    NEVER guesses a default.
    """
    if not raw:
        return None
    f = _fold(raw)
    if f in _PROVINCE_FOLD:
        return _PROVINCE_FOLD[f]
    if f in _PROVINCE_ALIASES:
        return _PROVINCE_ALIASES[f]
    # Tolerate a trailing/leading token (e.g. "MONOVER - ALICANTE")
    for token in re.split(r"[-/(),]", f):
        token = token.strip()
        if token in _PROVINCE_FOLD:
            return _PROVINCE_FOLD[token]
        if token in _PROVINCE_ALIASES:
            return _PROVINCE_ALIASES[token]
    return None


class SegSocialScraper(BankBaseScraper):
    """Scraper for the TGSS (Seguridad Social) seized-asset auction portal."""

    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        # The portal speaks ISO-8859-1 and expects a real browser UA + a session
        # cookie (JSESSIONID). BankBaseScraper already set a UA + es-ES headers;
        # add the portal Referer so the wizard accepts our step transitions.
        self.session.headers.update({
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": f"{PORTAL_BASE}{CONTROLLER}",
        })
        self.rate_limit_delay = int(os.getenv("SEGSOCIAL_RATE_LIMIT_SECONDS", "2"))
        self.max_pages = int(os.getenv("SEGSOCIAL_MAX_PAGES", "100"))

    # ----- identity ---------------------------------------------------------

    def get_source_name(self) -> str:
        return "SEGSOCIAL"

    def get_api_base_url(self) -> str:
        return PORTAL_BASE

    def get_search_endpoint(self) -> str:
        return CONTROLLER

    # ----- HTML fetch (ISO-8859-1, polite, retried) -------------------------

    def _fetch_html(self, params: Optional[List[Tuple[str, str]]] = None) -> Optional[BeautifulSoup]:
        """GET the controller with the given params; return parsed soup (ISO-8859-1)."""
        url = f"{PORTAL_BASE}{CONTROLLER}"
        for attempt in range(1, self.max_retries + 1):
            elapsed = time.time() - self.last_request_time
            if elapsed < self.rate_limit_delay:
                time.sleep(self.rate_limit_delay - elapsed)
            time.sleep(random.uniform(0.3, 0.9))  # human-like jitter
            try:
                proxies = self._get_requests_proxy()
                resp = self.session.get(url, params=params, timeout=30, proxies=proxies)
                self.last_request_time = time.time()
                if resp.status_code == 200:
                    html = resp.content.decode("iso-8859-1", errors="replace")
                    return BeautifulSoup(html, "html.parser")
                if resp.status_code in (403, 429, 503):
                    backoff = 2 ** attempt
                    self.log_warning(f"Throttled ({resp.status_code}); backing off {backoff}s")
                    time.sleep(backoff)
                    continue
                self.log_error(f"GET failed {resp.status_code} params={params}")
                return None
            except Exception as e:
                self.log_error(f"GET exception (attempt {attempt})", e)
                time.sleep(2 ** attempt)
        return None

    # ----- wizard walk ------------------------------------------------------

    def _prime_session(self) -> bool:
        """Step 0 + 1: prime JSESSIONID and select all five asset types."""
        if self._fetch_html() is None:
            return False
        params = [("opcion", "10")] + [("EMB_TIPOBIEN", c) for c in ASSET_TYPE_CODES] + [("ok", "Continuar")]
        return self._fetch_html(params) is not None

    def _collect_emb_ids(self) -> List[str]:
        """Steps 2-3: walk national results pagination, collect unique EMB_IDs.

        The wizard is stateful — page 1 MUST be requested as `opcion=8` (no
        `pagina`) to establish the result context before `pagina=N` works.
        """
        emb_ids: List[str] = []
        seen = set()
        total_expected: Optional[int] = None
        for page in range(1, self.max_pages + 1):
            if page == 1:
                params = [("opcion", "8"), ("tipoOperacion", "1")]
            else:
                params = [("pagina", str(page)), ("opcion", "8"), ("tipoOperacion", "1")]
            soup = self._fetch_html(params)
            if soup is None:
                break
            if total_expected is None:
                m = re.search(r"total de\s+(\d+)", soup.get_text())
                if m:
                    total_expected = int(m.group(1))
                    self.log_info(f"Portal reports {total_expected} bienes nationally")
            page_ids = self._extract_emb_ids(soup)
            if not page_ids:
                break  # clean end of pagination
            new = [e for e in page_ids if e not in seen]
            for e in new:
                seen.add(e)
                emb_ids.append(e)
        self.log_info(f"Collected {len(emb_ids)} EMB_IDs across pagination")
        return emb_ids

    @staticmethod
    def _extract_emb_ids(soup: BeautifulSoup) -> List[str]:
        ids = []
        for a in soup.find_all("a", href=True):
            m = re.search(r"opcion=13&EMB_ID=(\d+)", a["href"])
            if m:
                ids.append(m.group(1))
        # de-dup within page, preserve order
        out, seen = [], set()
        for i in ids:
            if i not in seen:
                seen.add(i)
                out.append(i)
        return out

    def _build_province_map(self) -> Dict[str, str]:
        """Walk the step-2 geographic buckets to map EMB_ID -> canonical province.

        This is the portal's OWN geographic classification of each bien (the
        province link it sits under), so it is an authoritative, non-fabricated
        province source — used to enrich/cross-check the ficha-derived province.
        Location-less bienes (some vehicles/muebles) appear in NO province bucket
        and are simply absent from this map (honest gap, not a guess).
        """
        prov_map: Dict[str, str] = {}
        # Re-enter the geographic-scope step to read the province links + codes.
        soup = self._fetch_html(
            [("opcion", "10")] + [("EMB_TIPOBIEN", c) for c in ASSET_TYPE_CODES] + [("ok", "Continuar")]
        )
        if soup is None:
            return prov_map
        buckets: List[Tuple[str, str]] = []
        for a in soup.find_all("a", href=True):
            m = re.search(r"opcion=8&provincia=(\d+)&autonoma=(\d+)", a["href"])
            if m:
                buckets.append((m.group(1), m.group(2)))
        for prov_code, auto in buckets:
            canon = get_province_by_code(prov_code.zfill(2)) if prov_code.zfill(2) in _VALID_PROVINCE_CODES else None
            if not canon:
                continue
            for page in range(1, self.max_pages + 1):
                base = [("opcion", "8"), ("provincia", prov_code), ("autonoma", auto), ("tipoOperacion", "1")]
                params = base if page == 1 else [("pagina", str(page))] + base
                psoup = self._fetch_html(params)
                if psoup is None:
                    break
                ids = self._extract_emb_ids(psoup)
                if not ids:
                    break
                for e in ids:
                    prov_map.setdefault(e, canon)
        self.log_info(f"Province map built: {len(prov_map)} EMB_IDs geo-tagged by the portal")
        return prov_map

    def parse_property_list(self, _resp) -> List[Dict]:  # interface stub
        return []

    # ----- ficha (detail) parsing ------------------------------------------

    def _fetch_ficha(self, emb_id: str, bucket_province: Optional[str] = None) -> Optional[Dict[str, Any]]:
        params = [("opcion", "13"), ("EMB_ID", emb_id), ("opcion2", "1"), ("tipoOperacion", "1")]
        soup = self._fetch_html(params)
        if soup is None:
            return None
        detail_url = (f"{PORTAL_BASE}{CONTROLLER}"
                      f"?opcion=13&EMB_ID={emb_id}&opcion2=1&tipoOperacion=1")
        return self._parse_ficha_soup(soup, emb_id, detail_url, bucket_province)

    def _parse_ficha_soup(self, soup: BeautifulSoup, emb_id: str, detail_url: str,
                          bucket_province: Optional[str] = None) -> Optional[Dict[str, Any]]:
        # Work on the "Detalle del bien" .. "Regresar" slice to avoid header/nav noise.
        full = soup.get_text("\n")
        m = re.search(r"Detalle del bien(.*?)Regresar a la p", full, re.S)
        body = m.group(1) if m else full
        # Collapse blank lines for label/value lookups.
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in body.split("\n")]
        lines = [ln for ln in lines if ln]

        def value_after(label: str) -> Optional[str]:
            """Return the first non-empty line after a line that IS the label."""
            for i, ln in enumerate(lines):
                if ln.rstrip(":").strip().lower() == label.lower():
                    for nxt in lines[i + 1:]:
                        if nxt and not nxt.endswith(":"):
                            return nxt
                    return None
            return None

        # Title = the bold heading line right after the "Anterior/Siguiente" nav.
        title = self._extract_title(lines)
        if not title:
            title = None  # honest NULL -> app synthesises

        tasacion = self._parse_currency(value_after("Importe de Tasación"))
        tipo_enajenacion = self._parse_currency(value_after("Tipo de enajenación"))
        cargas_raw = value_after("Cargas")
        cargas_amount = self._parse_currency(cargas_raw)  # None if "Sin Cargas"

        desc_detallada = value_after("Descripción Detallada")
        desc_general = value_after("Descripción General del Bien")
        property_description = desc_detallada or desc_general

        localizacion = self._collect_localizacion(lines)
        fecha_dt = self._parse_fecha(value_after("Fecha"))
        lugar = value_after("Lugar")
        ure = value_after("Unidad de Recaudación Ejecutiva")
        expediente = value_after("Expediente")

        province, municipality = self._derive_location(title, localizacion)
        # Authoritative fallback: the portal's own geographic bucket for this
        # bien (its province link). Not a guess — it's the source's geo tag.
        if not province and bucket_province:
            province = bucket_province
        # bienProvincia keeps the real (possibly-NULL) property province for the
        # geocoder + later cleanup. The NOT NULL `province` column gets the BOE
        # codebase's established sentinel when nothing resolves — never a
        # fabricated real province.
        bien_province = province
        province_col = province or "Unknown"

        # Category via the repo classifier (exact frontend vocabulary) — the
        # title/desc carry the signal ("RUSTICA", "VIVIENDA", "TRASTERO"...).
        # Source-driven override: a Spanish licence plate in the title
        # (e.g. "FORD FOCUS (3450KTC)") is an unambiguous vehicle signal the
        # generic classifier misses for makes outside its keyword list — so we
        # map plated bienes to the vehicle category directly (no classifier fork).
        category = get_category_type(title or "", property_description or "")
        if title and re.search(r"\b\d{4}\s?[A-Z]{3}\b", title):
            category = "Turismos"

        # Honest price mapping (three DISTINCT card numbers, matching BOE/PLABI):
        #   appraisalValue = Importe de Tasación (the appraisal / valuation)
        #   valorSubasta   = Tipo de enajenación (the auction / sale value)
        #   minimumBid     = Tipo de enajenación (the starting bid == sale value here)
        # Tipo de enajenación is the TGSS auction value, so it flows to BOTH the
        # valorSubasta column (used by the detail-page financial breakdown to
        # derive the 5% deposit) AND minimumBid (kept for back-compat — same
        # figure, mirrors the PLABI "Valor del lote" mapping). Each is honest-NULL
        # when the ficha omits the figure; we NEVER copy Tasación into valorSubasta.
        appraisal_value = tasacion
        valor_subasta = tipo_enajenacion
        minimum_bid = tipo_enajenacion

        # Status by auction date.
        status, opens_at, ends_at = self._map_status(fecha_dt)

        court_name = f"TGSS — U.R.E. {ure}" if ure else None

        record = {
            "boe_id": f"SUB-SS-{emb_id}",
            "title": title,
            "category": category,
            "auction_type": "SEGSOCIAL",
            "province": province_col,
            "municipality": municipality,
            "status": status,
            "source": self.get_source_name(),
            "appraisal_value": appraisal_value,
            "valor_subasta": valor_subasta,
            "minimum_bid": minimum_bid,
            "current_bid": None,
            "claimed_amount": cargas_amount,  # charges figure if stated, else NULL
            "charges_detail": cargas_raw,
            "deposit_amount": None,  # TGSS ficha doesn't state a deposit -> honest NULL
            "property_description": property_description,
            "address": localizacion,
            "bien_localidad": municipality,
            "bien_provincia": bien_province,
            "court_name": court_name,
            "procedure_number": expediente,
            "court_reference": expediente,
            "boe_link": detail_url,
            "edict_url": detail_url,
            "original_source": "TGSS",
            "opens_at": opens_at,
            "ends_at": ends_at,
            "end_date_time": ends_at,
            "published_at": datetime.now(),
            "image_url": None,  # portal exposes no photo -> honest NULL
        }
        # Vehicle make/model/year (wave E2) — no-op on non-vehicle bienes.
        set_vehicle_fields(record)
        return record

    @staticmethod
    def _extract_title(lines: List[str]) -> Optional[str]:
        """The bien heading is the line after the result-nav block, before
        "Importe de Tasación". Skip the "Mostrando: ..." / Anterior / Siguiente
        navigation lines."""
        skip = ("mostrando", "anterior", "siguiente", "resultado", "de un total")
        for ln in lines:
            low = ln.lower()
            if any(s in low for s in skip):
                continue
            if ln.isdigit():
                continue
            if ln.lower().startswith("importe de tasaci"):
                break
            return ln
        return None

    @staticmethod
    def _collect_localizacion(lines: List[str]) -> Optional[str]:
        """The Localización block: lines after the "Localización:" label until
        the next section ("Delimitación", "Subasta", "Cultivo", ...)."""
        stops = {"delimitación", "delimitacion", "subasta", "cultivo",
                 "inscrita en", "linde norte", "tipo de enajenación"}
        out: List[str] = []
        capture = False
        for ln in lines:
            low = ln.rstrip(":").strip().lower()
            if low == "localización" or low == "localizacion":
                capture = True
                continue
            if capture:
                if low in stops or ln.endswith(":"):
                    break
                out.append(ln)
        if not out:
            return None
        text = ", ".join(out)
        text = re.sub(r"\s+", " ", text).strip(" ,")
        return text or None

    def _derive_location(self, title: Optional[str],
                         localizacion: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """Derive (province, municipality) from the ficha text — honest-NULL when
        the source gives no usable signal (NEVER fabricated)."""
        province = None
        municipality = None

        # 1) Title parens: "... ( MONOVER - ALICANTE)" or "(MURCIA)".
        if title:
            mp = re.search(r"\(([^)]+)\)\s*$", title)
            if mp:
                inside = mp.group(1).strip()
                parts = [p.strip() for p in re.split(r"[-–]", inside) if p.strip()]
                if len(parts) >= 2:
                    municipality = municipality or parts[0]
                    province = province or canonical_province(parts[-1])
                elif len(parts) == 1:
                    cp = canonical_province(parts[0])
                    if cp:
                        province = province or cp
                    else:
                        municipality = municipality or parts[0]

        # 2) Localización tail: "... MONOVER (ALICANTE)" or "() MURCIA".
        # A purely-numeric parens (e.g. "(03698)") is a postal code, not a
        # province — handled separately below, so skip it here.
        if localizacion:
            mloc = re.search(r"\(([^)]*)\)\s*([A-Za-zÁÉÍÓÚÑÜ/ .'-]+)?\s*$", localizacion)
            if mloc:
                inparen = (mloc.group(1) or "").strip()
                trailing = (mloc.group(2) or "").strip()
                if not inparen.isdigit():
                    if not province:
                        province = canonical_province(trailing) or canonical_province(inparen)
                    if not municipality and trailing and not canonical_province(trailing):
                        municipality = trailing
            # "Término de MONOVER" pattern -> municipality
            mt = re.search(r"[Tt]érmino de\s+([A-Za-zÁÉÍÓÚÑÜ/ .'-]+)", localizacion)
            if mt and not municipality:
                municipality = mt.group(1).strip().split(",")[0].strip()

        # 3) Postal-code fallback for province (honest signal, no guessing).
        if not province and localizacion:
            province = _province_from_postal(localizacion)

        if municipality:
            municipality = municipality.title().strip() or None
        return province, municipality

    # ----- value parsers ----------------------------------------------------

    @staticmethod
    def _parse_currency(raw: Optional[str]) -> Optional[float]:
        """Spanish currency -> float. 'Sin Cargas'/'0'/absent -> None (honest)."""
        if not raw:
            return None
        if "sin cargas" in raw.lower() or "sin tasaci" in raw.lower():
            return None
        m = re.search(r"([\d\.]+,\d{2}|\d[\d\.]*)", raw)
        if not m:
            return None
        num = m.group(1).replace(".", "").replace(",", ".")
        try:
            val = float(num)
        except ValueError:
            return None
        # 0,00 € is an honest "no figure" on this portal -> NULL, never 0.
        return val if val > 0 else None

    @staticmethod
    def _parse_fecha(raw: Optional[str]) -> Optional[datetime]:
        if not raw:
            return None
        m = re.search(r"(\d{2})/(\d{2})/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?", raw)
        if not m:
            return None
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        hh = int(m.group(4)) if m.group(4) else 0
        mm = int(m.group(5)) if m.group(5) else 0
        try:
            return datetime(y, mo, d, hh, mm)
        except ValueError:
            return None

    @staticmethod
    def _map_status(fecha_dt: Optional[datetime]) -> Tuple[str, Optional[datetime], Optional[datetime]]:
        """Map the auction-act date to our enum.

        future date  -> PROXIMA_APERTURA, opensAt = the act date (promote_pending
                        flips it to CELEBRANDOSE when opensAt arrives).
        today/past   -> CELEBRANDOSE (active default), endsAt = the act date.
        no date      -> CELEBRANDOSE (banks-pattern default for an active listing).
        """
        if fecha_dt is None:
            return "CELEBRANDOSE", None, None
        now = datetime.now()
        if fecha_dt.date() > now.date():
            return "PROXIMA_APERTURA", fecha_dt, fecha_dt
        return "CELEBRANDOSE", None, fecha_dt

    # ----- honest-NULL overrides -------------------------------------------

    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """TGSS honest-NULL: require only the identity fields. province and
        appraisal_value MAY be NULL (location-less muebles, no-tasación bienes) —
        the base validator wrongly demands them, so we override here."""
        for field in ("boe_id", "category", "status"):
            if not data.get(field):
                self.log_warning(f"Missing required field: {field}")
                return False
        return True

    def normalize_auction_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Pass NULLs through unchanged. The base normalizer coerces
        appraisal_value to float(0) and drops several TGSS fields — that would
        violate honest-NULL — so we build the normalized dict directly here,
        keeping every optional figure as NULL when absent."""
        def f(v):
            return float(v) if v is not None else None

        return {
            "boe_id": data.get("boe_id", ""),
            "title": (data.get("title") or None),
            "category": data.get("category", "Otros inmuebles"),
            "province": data.get("province"),
            "municipality": data.get("municipality"),
            "status": data.get("status", "CELEBRANDOSE"),
            "source": self.get_source_name(),
            "auction_type": data.get("auction_type"),
            "appraisal_value": f(data.get("appraisal_value")),
            "current_bid": f(data.get("current_bid")),
            "minimum_bid": f(data.get("minimum_bid")),
            "valor_subasta": f(data.get("valor_subasta")),
            "claimed_amount": f(data.get("claimed_amount")),
            "deposit_amount": f(data.get("deposit_amount")),
            "court_name": data.get("court_name"),
            "court_reference": data.get("court_reference"),
            "procedure_number": data.get("procedure_number"),
            "boe_link": data.get("boe_link"),
            "edict_url": data.get("edict_url"),
            "original_source": data.get("original_source"),
            "published_at": data.get("published_at", datetime.now()),
            "opens_at": data.get("opens_at"),
            "ends_at": data.get("ends_at"),
            "end_date_time": data.get("end_date_time"),
            "address": data.get("address"),
            "bien_localidad": data.get("bien_localidad"),
            "bien_provincia": data.get("bien_provincia"),
            "image_url": data.get("image_url"),
            "property_description": data.get("property_description"),
            "lot_description": data.get("lot_description"),
            "charges_detail": data.get("charges_detail"),
        }

    # ----- orchestration ----------------------------------------------------

    def scrape(self, **kwargs) -> List[Dict[str, Any]]:
        """Full national pull: walk the wizard, fetch every ficha, upsert each.

        Returns the list of normalized auction dicts saved.
        """
        self.reset_stats()
        saved: List[Dict[str, Any]] = []

        if not self._prime_session():
            self.log_error("Failed to prime TGSS session (steps 0-1)")
            return saved

        emb_ids = self._collect_emb_ids()
        self.increment_stat("items_found", len(emb_ids))

        # Authoritative province enrichment from the portal's geographic buckets
        # (best-effort; ficha-derived province still wins when present).
        try:
            province_map = self._build_province_map()
        except Exception as e:
            self.log_error("Province-map build failed (continuing without it)", e)
            province_map = {}

        for emb_id in emb_ids:
            try:
                data = self._fetch_ficha(emb_id, bucket_province=province_map.get(emb_id))
                if not data:
                    self.increment_stat("items_skipped")
                    continue
                if not self.validate_auction_data(data):
                    self.increment_stat("items_skipped")
                    continue
                normalized = self.normalize_auction_data(data)
                self.db_adapter.upsert_auction(normalized)
                saved.append(normalized)
                self.increment_stat("items_saved")
            except Exception as e:
                self.log_error(f"Error processing EMB_ID={emb_id}", e)

        self.log_info(
            f"TGSS pull complete: found={len(emb_ids)} saved={len(saved)} "
            f"errors={self.stats['errors']}"
        )
        return saved


def run_daily_update(scraper_id: int = 20):
    """Scheduler entrypoint — same return shape as the other category scrapers
    (`total_auctions`, `errors`, plus `found`/`saved` for visibility)."""
    scraper = SegSocialScraper()
    logger.info("[segsocial] full national pull starting (scraper_id=%s)", scraper_id)
    saved = scraper.scrape()
    return {
        "total_auctions": len(saved),
        "found": scraper.stats.get("items_found", 0),
        "saved": scraper.stats.get("items_saved", 0),
        "errors": scraper.errors,
    }


if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = run_daily_update()
    print(json.dumps(
        {k: v for k, v in result.items() if k in ("total_auctions", "found", "saved")},
        default=str, indent=2))
