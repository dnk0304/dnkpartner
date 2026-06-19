"""
PLABI (Plataforma Electrónica de Liquidación de Bienes) scraper — source="PLABI".

Scrapes the Ministerio de Justicia concursal/insolvency asset-liquidation portal
at https://plabi.justicia.es. PLABI hosts the asset liquidations of the
microenterprise insolvency procedures created by Law 16/2022 (live since Aug
2023, growing — the law routes these insolvencies here). These bienes are NOT
published in the BOE, so the BOE scrapers never see them — a genuinely separate,
#1 off-BOE source. Public, free-access, transparency-designed (low resistance).

Portal mechanics (reversed 2026-06-07, Ghost): a Liferay (Java) portal that is
fully SERVER-RENDERED for the search + detail flow. No JSON/API needed, no
captcha, no Cloudflare; a single cookie (cookied on the first GET) carries the
session. Plain `requests` walks it end-to-end — Playwright is NOT needed. UTF-8.

  1. GET /resultados?p_p_id=com_liferay_subastas_CustomSearchSubastasPortlet
         &..._tpoLiquidationSe=-1&..._tpoActivoSe=-1&..._ccaaSe=-1&..._provinSe=-1
         &..._priceRange=0&..._filterWord=&..._delta=20&..._cur=N
     -> a page of `sb-card-result__wrapper` cards (the listing).  -1 == "Todos"
        on every filter, so this is the full national result set. The page header
        states "Mostrando el intervalo A - B de TOTAL resultados."
  2. GET /buscador-detalle?assetId=PLB{stableId}   (per-lote ficha detail)

Each result card is self-contained and carries: the detail link (assetId), the
publication date, the lot-activo count, the title, the lot value ("Valor del
lote"), and the location ("Comunidad Autónoma, Provincia"). The detail page adds
the municipality ("Ubicación del activo": "Municipio, Provincia, CCAA"), the
appraisal ("Valor estimado"), the asset-type labels (Tipo de activo -> category)
and the full description. We parse the card first (cheap, reliable for every
lote) and enrich from the detail (municipality + appraisal + category).

`assetId` (in the detail URL, e.g. "PLB0z01g1f0f0125") is the stable, per-lote
unique identifier — our dedupe anchor.

Dedupe key:  boeId = "SUB-PLABI-{assetId}".
Source tag:  source = "PLABI"  (Auction.source column already exists + indexed; NO migration).
Prices:      honest-NULL — appraisalValue = "Valor estimado", valorSubasta /
             minimumBid = "Valor del lote"; "0,00 €" / absent / "No consta" -> NULL,
             never 0. We never fabricate a figure.
Status:      PLABI liquidation lotes are OPEN listings with no timed apertura/
             cierre on the public ficha -> CELEBRANDOSE (active), so they show in
             active counts. (Defensive: if a future date ever appears we map it to
             PROXIMA_APERTURA + opensAt.)
"""

import os
import re
import time
import random
import unicodedata
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

from bs4 import BeautifulSoup

from .bank_base_scraper import BankBaseScraper
from ..config.provinces import ALL_PROVINCES
from ..config.municipality_province import canonical_municipality_name
from ..config.categories import get_category_type
from .vehicle_parser import set_vehicle_fields
from .boe_scraper import set_surface_occupancy_fields

import logging

logger = logging.getLogger(__name__)

PORTAL_BASE = "https://plabi.justicia.es"
RESULTS_PATH = "/resultados"
DETAIL_PATH = "/buscador-detalle"

# Liferay portlet parameter namespace. -1 == "Todos" on every facet, so this
# query is the unfiltered national result set.
PORTLET = "com_liferay_subastas_CustomSearchSubastasPortlet"
_P = f"_{PORTLET}_"

# PLABI's own "Tipo de activo" labels are authoritative for the broad family and
# gate the keyword classifier so an inmueble keyword can never leak onto a mueble
# (the shared classifier over-matches, e.g. "ático" inside "informáticos"). The
# first label is the family; the second (when present) is PLABI's own subtype.
PLABI_FAMILY = {
    "inmuebles": "real_estate",
    "vehículos": "vehicles", "vehiculos": "vehicles",
    "otros bienes muebles": "movable",
    "bienes muebles": "movable",
    "derechos": "rights",
}
# PLABI second-label subtype -> repo category (used directly when it matches).
PLABI_SUBTYPE = {
    "vivienda": "Viviendas", "garaje": "Garajes", "local": "Locales",
    "terreno": "Terrenos", "finca rústica": "Fincas rústicas",
    "finca rustica": "Fincas rústicas", "nave industrial": "Naves industriales",
    "oficina": "Oficinas", "trastero": "Trasteros",
    "turismo": "Turismos", "motocicleta": "Motocicletas", "camión": "Camiones",
    "camion": "Camiones", "barco": "Barcos", "embarcación": "Barcos",
    "aeronave": "Aeronaves",
    "joyas": "Joyas", "maquinaria": "Maquinaria", "mobiliario": "Mobiliario",
    "arte": "Arte y antigüedades", "electrónica": "Electrónica",
    "electronica": "Electrónica",
}
# Family -> default subcategory + the valid subcategory set for that family.
FAMILY_DEFAULT = {
    "real_estate": "Otros inmuebles",
    "vehicles": "Otros vehículos",
    "movable": "Otros bienes muebles",
    "rights": "Otros derechos",
}
FAMILY_SUBCATS = {
    "real_estate": {"Viviendas", "Garajes", "Locales", "Terrenos",
                    "Fincas rústicas", "Otros inmuebles", "Naves industriales",
                    "Oficinas", "Trasteros"},
    "vehicles": {"Turismos", "Motocicletas", "Camiones", "Barcos",
                 "Aeronaves", "Otros vehículos"},
    "movable": {"Joyas", "Maquinaria", "Mobiliario", "Otros bienes muebles",
                "Arte y antigüedades", "Electrónica"},
    "rights": {"Derechos de crédito", "Derechos reales",
               "Participaciones sociales", "Otros derechos"},
}


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


# Canonical province lookup built ONCE from THIS repo's province list. NOTE: this
# repo uses the autonomous-community canonical forms (Bizkaia, Gipuzkoa, Álava,
# A Coruña, Ourense, Illes Balears, Girona, Lleida) — which is exactly what PLABI
# emits, so most match directly. The alias map only covers the Castilian display
# variants PLABI might also use, folded to the repo's canonical key.
_PROVINCE_FOLD = {_fold(name): name for name in ALL_PROVINCES.keys()}
_PROVINCE_ALIASES = {
    "vizcaya": "Bizkaia",
    "guipuzcoa": "Gipuzkoa", "guipúzcoa": "Gipuzkoa",
    "alava": "Álava", "araba": "Álava",
    "la coruna": "A Coruña", "coruna": "A Coruña", "la coruña": "A Coruña",
    "orense": "Ourense",
    "gerona": "Girona",
    "lerida": "Lleida",
    "baleares": "Illes Balears", "islas baleares": "Illes Balears",
    "balears": "Illes Balears",
    # Bilingual / co-official spellings PLABI may emit.
    "valencia": "Valencia", "valència": "Valencia",
    "alicante": "Alicante", "alacant": "Alicante",
    "castellon": "Castellón", "castelló": "Castellón",
}


# Non-province noise tokens PLABI may put in a location slot — treated as NO
# signal (honest-NULL), never canonicalised to a real province.
_PROVINCE_NOISE = {
    "no consta", "espana", "varias", "varias ubicaciones",
    "el lote tiene varias ubicaciones",
}


def canonical_province(raw: Optional[str]) -> Optional[str]:
    """Fold a raw PLABI province string to the repo's canonical key.

    Handles PLABI's co-official slash format ("Castellón/Castelló",
    "Valencia/València") by trying each side, and rejects non-province noise
    ("No consta", "España", "varias ubicaciones"). Returns None (honest-NULL)
    when the input is empty, noise, or unrecognisable — NEVER guesses a default.
    """
    if not raw:
        return None
    f = _fold(raw)
    if not f or f in _PROVINCE_NOISE:
        return None
    # Whole-string match first.
    if f in _PROVINCE_FOLD:
        return _PROVINCE_FOLD[f]
    if f in _PROVINCE_ALIASES:
        return _PROVINCE_ALIASES[f]
    # Co-official "A/B" (or other separators) — try each token.
    for token in re.split(r"[/(),-]", f):
        token = token.strip()
        if not token or token in _PROVINCE_NOISE:
            continue
        if token in _PROVINCE_FOLD:
            return _PROVINCE_FOLD[token]
        if token in _PROVINCE_ALIASES:
            return _PROVINCE_ALIASES[token]
    return None


class PlabiScraper(BankBaseScraper):
    """Scraper for the PLABI (Ministerio de Justicia) liquidation portal."""

    def __init__(self, province: Optional[str] = None):
        super().__init__(province)
        self.session.headers.update({
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            "Referer": f"{PORTAL_BASE}{RESULTS_PATH}",
        })
        self.rate_limit_delay = int(os.getenv("PLABI_RATE_LIMIT_SECONDS", "2"))
        self.page_size = int(os.getenv("PLABI_PAGE_SIZE", "20"))
        self.max_pages = int(os.getenv("PLABI_MAX_PAGES", "100"))
        self.fetch_detail = os.getenv("PLABI_FETCH_DETAIL", "1") != "0"

    # ----- identity ---------------------------------------------------------

    def get_source_name(self) -> str:
        return "PLABI"

    def get_api_base_url(self) -> str:
        return PORTAL_BASE

    def get_search_endpoint(self) -> str:
        return RESULTS_PATH

    # ----- HTML fetch (UTF-8, polite, retried) ------------------------------

    def _fetch_html(self, path: str, params: Optional[Dict[str, str]] = None) -> Optional[BeautifulSoup]:
        """GET an absolute portal path; return parsed soup (UTF-8)."""
        url = f"{PORTAL_BASE}{path}"
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
                    return BeautifulSoup(resp.content.decode("utf-8", errors="replace"),
                                         "html.parser")
                if resp.status_code in (403, 429, 503):
                    backoff = 2 ** attempt
                    self.log_warning(f"Throttled ({resp.status_code}); backing off {backoff}s")
                    time.sleep(backoff)
                    continue
                self.log_error(f"GET failed {resp.status_code} {url} params={params}")
                return None
            except Exception as e:
                self.log_error(f"GET exception (attempt {attempt})", e)
                time.sleep(2 ** attempt)
        return None

    # ----- result-page walk -------------------------------------------------

    def _results_params(self, page: int) -> Dict[str, str]:
        """Unfiltered national query (-1 == Todos), one page of size page_size."""
        return {
            "p_p_id": PORTLET,
            "p_p_lifecycle": "0",
            f"{_P}tpoLiquidationSe": "-1",
            f"{_P}tpoActivoSe": "-1",
            f"{_P}ccaaSe": "-1",
            f"{_P}ccaaSeJu": "-1",
            f"{_P}provinSe": "-1",
            f"{_P}provinSeJu": "-1",
            f"{_P}judge": "-1",
            f"{_P}priceRange": "0",
            f"{_P}filterWord": "",
            f"{_P}delta": str(self.page_size),
            f"{_P}isRedirect": "true",
            f"{_P}cur": str(page),
        }

    def _collect_cards(self) -> List[Dict[str, Any]]:
        """Walk the national results pagination, collecting one parsed dict per
        listing card. The portal header states the TOTAL; we stop when we have
        collected that many (or hit an empty page, or max_pages)."""
        cards: List[Dict[str, Any]] = []
        seen = set()
        total_expected: Optional[int] = None
        for page in range(1, self.max_pages + 1):
            soup = self._fetch_html(RESULTS_PATH, self._results_params(page))
            if soup is None:
                break
            if total_expected is None:
                total_expected = self._parse_total(soup)
                if total_expected:
                    self.log_info(f"PLABI reports {total_expected} resultados nationally")
            page_cards = self._parse_cards(soup)
            if not page_cards:
                break  # clean end of pagination
            added = 0
            for c in page_cards:
                aid = c.get("asset_id")
                if aid and aid not in seen:
                    seen.add(aid)
                    cards.append(c)
                    added += 1
            self.log_info(f"Page {page}: {len(page_cards)} cards ({added} new); total so far {len(cards)}")
            if added == 0:
                break  # a repeated page == past the end
            if total_expected and len(cards) >= total_expected:
                break
        self.log_info(f"Collected {len(cards)} unique PLABI lotes across pagination")
        return cards

    @staticmethod
    def _parse_total(soup: BeautifulSoup) -> Optional[int]:
        m = re.search(r"de\s+([\d.]+)\s+resultados", soup.get_text(" "))
        if m:
            try:
                return int(m.group(1).replace(".", ""))
            except ValueError:
                return None
        return None

    @staticmethod
    def _asset_id_from_href(href: str) -> Optional[str]:
        m = re.search(r"assetId=(PLB[A-Za-z0-9]+)", href or "")
        return m.group(1) if m else None

    def _parse_cards(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Parse every `sb-card-result__wrapper` on a results page."""
        out: List[Dict[str, Any]] = []
        for wrapper in soup.find_all(class_="sb-card-result__wrapper"):
            link = wrapper.find("a", class_="sb-card-result__link", href=True)
            if not link:
                continue
            asset_id = self._asset_id_from_href(link["href"])
            if not asset_id:
                continue

            title_el = wrapper.find(class_="sb-card-result__title-article-auction")
            title = (title_el.get("data-tooltip") or title_el.get_text(" ", strip=True)) if title_el else None

            date_el = wrapper.find(class_="sb-card-result__label-date")
            date_raw = date_el.get_text(" ", strip=True) if date_el else None

            lot_el = wrapper.find(class_="sb-card-result__label-info")
            lot_count = self._parse_lot_count(lot_el.get_text(" ", strip=True) if lot_el else None)

            price_el = wrapper.find(class_="sb-card-result__price-auction")
            lot_value = self._parse_currency(price_el.get_text(" ", strip=True) if price_el else None)

            loc_el = wrapper.find(class_="sb-card-result__location")
            ccaa, province = self._parse_card_location(loc_el.get_text(" ", strip=True) if loc_el else None)

            out.append({
                "asset_id": asset_id,
                "title": title,
                "date_raw": date_raw,
                "lot_count": lot_count,
                "lot_value": lot_value,        # "Valor del lote" from the card
                "card_ccaa": ccaa,
                "card_province": province,
                "detail_url": f"{PORTAL_BASE}{DETAIL_PATH}?assetId={asset_id}",
            })
        return out

    @staticmethod
    def _parse_lot_count(raw: Optional[str]) -> Optional[int]:
        if not raw:
            return None
        m = re.search(r"(\d+)", raw)
        return int(m.group(1)) if m else None

    @staticmethod
    def _parse_card_location(raw: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """Card location is "Comunidad Autónoma, Provincia" -> (ccaa, province)."""
        if not raw:
            return None, None
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        if len(parts) >= 2:
            return parts[0], parts[-1]
        if len(parts) == 1:
            return None, parts[0]
        return None, None

    # ----- detail (ficha) parsing ------------------------------------------

    def _fetch_detail(self, asset_id: str) -> Optional[Dict[str, Any]]:
        soup = self._fetch_html(DETAIL_PATH, {"assetId": asset_id})
        if soup is None:
            return None
        return self._parse_detail_soup(soup)

    def _parse_detail_soup(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """Pull the enrichment fields from a detail ficha. Everything is
        honest-NULL when the ficha omits it."""
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in soup.get_text("\n").split("\n")]
        lines = [ln for ln in lines if ln]

        def value_after(label: str) -> Optional[str]:
            lab = label.lower()
            for i, ln in enumerate(lines):
                if ln.rstrip(":").strip().lower() == lab:
                    for nxt in lines[i + 1:]:
                        if nxt:
                            return nxt
                    return None
            return None

        # Title: "Lote: ...".
        title_el = soup.find(class_="sb-batch__title")
        title = title_el.get_text(" ", strip=True) if title_el else None
        if title:
            title = re.sub(r"^\s*Lote:\s*", "", title).strip() or None

        # Asset-type family labels (Tipo de activo) -> category hint.
        family_labels = [el.get_text(" ", strip=True)
                         for el in soup.find_all(class_="sb-batch__label")]

        # Authoritative location: the LAST sb-batch__label--location is the
        # "Ubicación del activo" line "Municipio, Provincia, CCAA".
        municipality = province = None
        loc_labels = [el.get_text(" ", strip=True)
                      for el in soup.find_all(class_="sb-batch__label--location")]
        if loc_labels:
            municipality, province = self._parse_detail_location(loc_labels[-1])

        # Description.
        desc = value_after("Descripción del lote")

        appraisal = self._parse_currency(value_after("Valor estimado"))
        lot_value = self._parse_currency(value_after("Valor del lote"))
        market_value = self._parse_currency(value_after("Valor actual de mercado"))
        seller = value_after("Vendedor")
        published = self._parse_fecha(value_after("Publicado"))
        cadastral = value_after("Referencia catastral")
        possession = value_after("Situación posesoria")

        return {
            "title": title,
            "family_labels": family_labels,
            "municipality": municipality,
            "province": province,
            "description": desc,
            "appraisal": appraisal,
            "lot_value": lot_value,
            "market_value": market_value,
            "seller": seller,
            "published": published,
            "cadastral": cadastral,
            "possession": possession,
        }

    @staticmethod
    def _parse_detail_location(raw: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """"Municipio, Provincia, CCAA" -> (municipality, province)."""
        if not raw:
            return None, None
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        if len(parts) >= 3:
            return parts[0], parts[1]
        if len(parts) == 2:
            # Could be "Provincia, CCAA" (no municipality) — province first.
            return None, parts[0]
        if len(parts) == 1:
            return None, parts[0]
        return None, None

    # ----- category resolution ---------------------------------------------

    @staticmethod
    def _resolve_category(family_labels: List[str], title: str, description: str) -> str:
        """Resolve the repo category from PLABI's own Tipo-de-activo labels,
        gating the shared keyword classifier so it can only return a subcategory
        that BELONGS to PLABI's declared family (prevents the "ático" in
        "informáticos" leak and the wrong "Otros inmuebles" default for muebles).

        Labels are [family, subtype?] e.g. ["Inmuebles","Vivienda"] or
        ["Otros bienes muebles","Maquinaria"]. When PLABI gives no usable family
        we fall back to the unrestricted keyword classifier.
        """
        family = None
        for lab in family_labels:
            f = PLABI_FAMILY.get(_fold(lab))
            if f:
                family = f
                break

        # PLABI's own second-label subtype, if it maps cleanly, wins.
        for lab in family_labels:
            sub = PLABI_SUBTYPE.get(_fold(lab))
            if sub and (family is None or sub in FAMILY_SUBCATS.get(family, set())):
                return sub

        kw = get_category_type(title, description)
        if family is None:
            return kw  # no family signal -> trust the classifier as-is
        # Only accept the keyword result if it's valid for PLABI's family;
        # otherwise use the family's honest default (never cross families).
        if kw in FAMILY_SUBCATS.get(family, set()):
            return kw
        return FAMILY_DEFAULT[family]

    # ----- assemble one auction dict ---------------------------------------

    def _build_auction(self, card: Dict[str, Any],
                       detail: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        asset_id = card["asset_id"]
        detail = detail or {}

        title = detail.get("title") or card.get("title")

        # Location: detail province wins when it RESOLVES; else the card province
        # (a noise detail slot like "No consta"/"España" must not block the card
        # fallback — canonical_province returns None for noise, so we try both).
        province = canonical_province(detail.get("province")) \
            or canonical_province(card.get("card_province"))
        municipality = detail.get("municipality")
        if municipality and _fold(municipality) in _PROVINCE_NOISE:
            municipality = None
        # Shared normalizer: title-case + dedup vs INE + STRIP plate/junk.
        municipality = canonical_municipality_name(municipality)

        # Category: PLABI's own Tipo-de-activo labels gate the keyword classifier.
        description = detail.get("description")
        category = self._resolve_category(detail.get("family_labels") or [],
                                          title or "", description or "")

        # Honest price mapping:
        #   appraisalValue = "Valor estimado" (the appraisal / valuation)
        #   valorSubasta / minimumBid = "Valor del lote" (the lot sale value)
        # "0,00 €" / "No consta" / absent -> NULL, never 0. We never fabricate.
        appraisal_value = detail.get("appraisal")
        lot_value = detail.get("lot_value")
        if lot_value is None:
            lot_value = card.get("lot_value")
        if appraisal_value is None:
            appraisal_value = detail.get("market_value")  # secondary valuation

        # Status: PLABI liquidation lotes are open listings with no timed
        # apertura on the public ficha -> active (CELEBRANDOSE) so they count.
        status, opens_at, ends_at = "CELEBRANDOSE", None, None

        published = detail.get("published") or self._parse_fecha(card.get("date_raw"))

        record = {
            "boe_id": f"SUB-PLABI-{asset_id}",
            "title": title,
            "category": category,
            "auction_type": "PLABI",
            "province": province or "Unknown",
            "municipality": municipality,
            "status": status,
            "source": self.get_source_name(),
            "appraisal_value": appraisal_value,
            "minimum_bid": lot_value,
            "valor_subasta": lot_value,
            "current_bid": None,
            "claimed_amount": None,
            "deposit_amount": None,
            "property_description": description,
            "address": detail.get("possession"),
            "bien_localidad": municipality,
            "bien_provincia": province,
            "court_name": None,
            "procedure_number": None,
            "court_reference": detail.get("cadastral"),
            "boe_link": card["detail_url"],
            "edict_url": card["detail_url"],
            "original_source": "PLABI",
            "opens_at": opens_at,
            "ends_at": ends_at,
            "end_date_time": ends_at,
            "published_at": published or datetime.now(),
            "image_url": None,
        }
        # Vehicle make/model/year (wave E2) — no-op on non-vehicle lotes.
        set_vehicle_fields(record)
        # G1/G2 — surface m² + occupancy from the PLABI bien prose. Honest-NULL.
        set_surface_occupancy_fields(record)
        return record

    # ----- value parsers ----------------------------------------------------

    @staticmethod
    def _parse_currency(raw: Optional[str]) -> Optional[float]:
        """Spanish currency -> float. '0,00 €' / 'No consta' / absent -> None
        (honest-NULL). We never return 0 or a fabricated figure."""
        if not raw:
            return None
        low = raw.lower()
        if "no consta" in low or "sin " in low:
            return None
        m = re.search(r"([\d\.]+,\d{2}|\d[\d\.]*)", raw)
        if not m:
            return None
        num = m.group(1).replace(".", "").replace(",", ".")
        try:
            val = float(num)
        except ValueError:
            return None
        return val if val > 0 else None

    @staticmethod
    def _parse_fecha(raw: Optional[str]) -> Optional[datetime]:
        """Parse "06/05/2026 12:18" or the card "02 jun 2026" -> datetime."""
        if not raw:
            return None
        m = re.search(r"(\d{2})/(\d{2})/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?", raw)
        if m:
            d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            hh = int(m.group(4)) if m.group(4) else 0
            mm = int(m.group(5)) if m.group(5) else 0
            try:
                return datetime(y, mo, d, hh, mm)
            except ValueError:
                return None
        months = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
                  "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}
        m2 = re.search(r"(\d{1,2})\s+([a-zA-Z]{3})[a-zA-Z]*\.?\s+(\d{4})", raw)
        if m2:
            mo = months.get(m2.group(2).lower()[:3])
            if mo:
                try:
                    return datetime(int(m2.group(3)), mo, int(m2.group(1)))
                except ValueError:
                    return None
        return None

    # ----- interface stubs (BankBaseScraper abstract surface) ---------------

    def parse_property_list(self, _resp) -> List[Dict]:
        return []

    # ----- honest-NULL overrides -------------------------------------------

    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """PLABI honest-NULL: require only the identity fields. province and
        prices MAY be NULL — the base validator wrongly demands them."""
        for field in ("boe_id", "category", "status"):
            if not data.get(field):
                self.log_warning(f"Missing required field: {field}")
                return False
        return True

    def normalize_auction_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Pass NULLs through unchanged (the base normalizer coerces
        appraisal_value to float(0) and drops fields — that would violate
        honest-NULL), mirroring the SegSocial scraper."""
        def f(v):
            return float(v) if v is not None else None

        return {
            "boe_id": data.get("boe_id", ""),
            "title": (data.get("title") or None),
            "category": data.get("category", "Otros bienes muebles"),
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
        """Full national pull: walk the result pages, enrich each lote from its
        detail ficha, upsert each. Returns the list of normalized dicts saved."""
        self.reset_stats()
        saved: List[Dict[str, Any]] = []

        cards = self._collect_cards()
        self.increment_stat("items_found", len(cards))

        for card in cards:
            try:
                detail = self._fetch_detail(card["asset_id"]) if self.fetch_detail else None
                data = self._build_auction(card, detail)
                if not data or not self.validate_auction_data(data):
                    self.increment_stat("items_skipped")
                    continue
                normalized = self.normalize_auction_data(data)
                self.db_adapter.upsert_auction(normalized)
                saved.append(normalized)
                self.increment_stat("items_saved")
            except Exception as e:
                self.log_error(f"Error processing assetId={card.get('asset_id')}", e)

        self.log_info(
            f"PLABI pull complete: found={len(cards)} saved={len(saved)} "
            f"errors={self.stats['errors']}"
        )
        return saved


def run_daily_update(scraper_id: int = 21):
    """Scheduler entrypoint — same return shape as the other category scrapers."""
    scraper = PlabiScraper()
    logger.info("[plabi] full national pull starting (scraper_id=%s)", scraper_id)
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
