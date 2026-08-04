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
from ..config.provinces import (
    get_province_code, ALL_PROVINCES, canonical_province, province_by_code_strict,
)
from ..config.categories import get_category_type
from .vehicle_parser import is_vehicle_category, parse_vehicle_fields
from .property_attribute_parser import parse_property_attributes, dedupe_prose
from .pujas_result_parser import (
    parse_pujas_html, ADJUDICADA as PUJAS_ADJUDICADA, DESIERTA as PUJAS_DESIERTA,
)
from ..config.municipality_province import (
    municipality_to_province, province_from_text, normalize_municipality,
    canonical_municipality_name, derive_province_from_address,
    derive_municipality_from_address, geo_cross_check,
)
from ..config.settings import SCRAPE_MAX_PAGES, SCRAPE_MAX_ITEMS_PER_PAGE, BOE_REQUEST_DELAY_SECONDS
from ..database.adapter import get_database_adapter
from ..lib import doc_storage

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


# ---------------------------------------------------------------------------
# #14 MULTI-LOT SPLIT TRIGGER
#
# When a BOE auction's lotes are sold SEPARATELY (each its own price/property),
# the "Información general" detail page declares it explicitly. Dennis quoted the
# declaration as "(los lotes se subastan de forma independiente)". RECON
# (subastas.boe.es, 2026-06-02, rendered via Playwright on the live example
# SUB-GA-2026-2801400126E01) shows BOE actually renders:
#
#     "La subasta contiene varios lotes que se subastan de forma separada."
#
# i.e. BOE's wording is "de forma SEPARADA", not "de forma INDEPENDIENTE". Both
# are the SAME BOE declaration of lot independence; BOE has used both over time.
# So the trigger matches EITHER tail, anchored on "se subastan de forma
# (separada|independiente)" — case-insensitive, accent/whitespace tolerant. It is
# a specific declaration string, NOT merely "more than one lote exists": auctions
# whose lotes are sold as ONE unit do NOT carry it and MUST stay a single row.
_SPLIT_TRIGGER_RE = re.compile(
    r'se\s+subastan\s+de\s+forma\s+(?:separada|independiente)',
    re.IGNORECASE,
)

# Hard ceiling so a pathological auction (BOE has had 100+-lote dumps) can't stall
# a batch by multiplying page loads without bound. Logged when exceeded.
MAX_LOTES_PER_AUCTION = 50


def is_split_auction(text: Optional[str]) -> bool:
    """True iff the auction-detail text declares its lotes are sold separately
    (the #14 split trigger). False for normal single/sold-together auctions."""
    if not text:
        return False
    return bool(_SPLIT_TRIGGER_RE.search(text))


def make_lote_boe_id(source_id_sub: str, lote_number: int) -> str:
    """Stable, unique composite id for a split lote row: '<idSub>-L<N>'.
    Same lote -> same id -> upsert UPDATES (idempotent), never duplicates."""
    return f"{source_id_sub}-L{lote_number}"


# Composite split-lote id: "<idSub>-L<N>". The "-L<N>" suffix is anchored at the
# END so a bare idSub (which never ends in "-L<digits>") is never misparsed.
_LOTE_COMPOSITE_RE = re.compile(r'^(?P<idsub>.+)-L(?P<lote>\d+)$')


def parse_lote_boe_id(boe_id: Optional[str]) -> Optional[tuple]:
    """Recover (source_id_sub, lote_number:int) from a composite split-lote
    boeId, or None when `boe_id` is a bare (non-split) idSub. Lets the pulse/bid
    path rebuild the correct lote detail URL (idSub=...&idLote=N) for split rows
    instead of requesting the malformed '?idSub=<idSub>-L<N>'."""
    if not boe_id:
        return None
    m = _LOTE_COMPOSITE_RE.match(boe_id)
    if not m:
        return None
    return (m.group('idsub'), int(m.group('lote')))


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


# Property street address in the BOE "Bienes" block sits behind a label, with
# the value tab/colon/newline-separated on the same line (verified live on
# CELEBRANDOSE pages: "Dirección\tC/MANUEL MUÑOZ GUILLEN planta 1ª letra B portal 2").
# Primary label is "Dirección"/"Direccion"; some pages use "Domicilio" or
# "Localización". We anchor on the label (NOT blind-grep) to avoid capturing
# description prose, take the value up to the next tab/newline, then append the
# locality ("Localidad") when present and not already contained, so the geocoder
# gets street + municipality. Multi-lot blocks repeat the label — we take the
# FIRST match (the lead property). Returns None when no address label is present
# (province/municipality remain the geocoder's fallback context — we do NOT
# fabricate an address from them).
# PRIORITY 1 — canonical structured labels. These catch ~100% of standard rows
# (verified live 2026-06-03: 30/30 address-less actives carry one of these).
_ADDR_LABELS = r'(?:Direcci[oó]n|Domicilio|Localizaci[oó]n)'
# CELL-ANCHORED (2026-08-04, ADDRFIELD). The BOE "Datos del bien subastado"
# block renders every label at the START of its own table cell — i.e. preceded
# by a line break or a tab, never mid-sentence. The old un-anchored pattern also
# matched the word "dirección" inside ordinary announcement prose, where it
# means "web address": the AEAT/Hacienda-local boilerplate
#   "Se puede consultar la WEB del Organismo en la siguiente dirección: https://…"
# minted `address = "https://www.haciendalocal.es/…"` on real property rows.
# Requiring the label to open a cell keeps every genuine KV hit and drops the
# prose sense of the word. (Verified: SUB-RC-2022-1400100122038.)
_ADDR_LABEL_RE = re.compile(
    r'(?:^|[\t\n])[ \t]*' + _ADDR_LABELS + r'\s*[:\t\n]\s*([^\t\n]+)',
    re.IGNORECASE,
)
# PRIORITY 2 — alternate structured labels seen on a tail of pages (rural fincas,
# AEAT, older layouts): "Situación", "Emplazamiento", "Vía pública: PARAJE
# PURROIG", "Paraje". Same Label[:\t\n]value discipline; only consulted when (1)
# misses, so the standard path never regresses.
_ADDR_ALT_LABELS = r'(?:Situaci[oó]n|Emplazamiento|V[ií]a\s+p[uú]blica|Paraje)'
_ADDR_ALT_LABEL_RE = re.compile(
    r'(?:^|[\t\n])[ \t]*' + _ADDR_ALT_LABELS + r'\s*[:\t\n]\s*([^\t\n]+)',
    re.IGNORECASE,
)
# PRIORITY 3 — free-text description fallback. Old/rural fincas put the street
# only inside the prose ("Casa situada ... en la calle Balbina Valverde número
# quince ..."). Anchor on a Spanish street-type token, then capture a bounded
# fragment (the street phrase + up to ~60 chars) trimmed at the first sentence
# break. Best-effort only — never the primary path.
#
# `cr\b` REMOVED from the prose token set (2026-08-04, ADDRFIELD). `CR` is how
# BOE writes "carretera" in a *structured* address cell — but in free prose it is
# the leading letters of a licence plate or a car model: it matched `CR-8348-X`,
# `CR-2171-Z`, `CR-3870-Y` (plates, minted as property addresses) and `CR-V`,
# `CR S&S ECOMOTIVE`, `CR Ecomotive Style` (model names). Priority 3 is the LAST
# resort, so it only fires on rows with no address cell at all — overwhelmingly
# the movable-goods rows — where a bare `CR` is essentially never a road. Cell
# values ("CR ADANERO 30") come through priorities 1/2 and are unaffected.
_ADDR_STREET_TOKENS = (
    r'calle|c/|c\.|avda|avenida|av\.|plaza|pza|pza\.|pl\.|paseo|p[º°]'
    r'|camino|cam\.|carretera|ctra|ctra\.|urbanizaci[oó]n|urb\.'
    r'|partida|paraje|pol[ií]gono|pol\.|parcela|lugar|lg\b|barrio'
    r'|travesía|trav\.|ronda|rúa|rua|sector|finca'
)
_ADDR_DESC_RE = re.compile(
    r'\b(' + _ADDR_STREET_TOKENS + r')\b[^.;\n]{0,60}',
    re.IGNORECASE,
)
# A prose match must carry an actual street NAME, not just the street type. The
# corpus holds 68 rows whose entire address is the word "Avda" and 28 "Ctra" —
# harvested from the BOE site footer ("Avda. de Manoteras, 54") and from bare
# cadastral abbreviations ("LG", "C.B", "C.E"). Require the fragment to contain
# whitespace and >= 8 characters; "PASEO DE LAS DELICIAS Nº 101" passes, "Avda"
# does not.
_ADDR_DESC_MIN_LEN = 8


def _prose_fragment_is_addressy(value: str) -> bool:
    v = value.strip(' ,;-')
    return len(v) >= _ADDR_DESC_MIN_LEN and ' ' in v
_BIEN_HEADING_RE = re.compile(
    r'Bien\s+\d+\s*-\s*[^\n(]*\([^)]*\)', re.IGNORECASE
)
_LOCALIDAD_RE = re.compile(
    r'Localidad\s*[:\t\n]\s*([^\t\n]+)',
    re.IGNORECASE,
)
_ADDR_MAX_LEN = 200
_ADDR_SENTINELS = ('no consta', 'no costa', '-', 'n/a', 'sin datos', 'desconocido')

# BOE often appends a trailing " 0" cell to the address value on multi-field
# rows ("LG OTROS LANGOSA\t0"). Strip a lone trailing 0 token so it doesn't
# leak into the geocode string, but keep a real trailing house number
# ("CR ADANERO 30" stays intact — only a SOLITARY trailing 0 is dropped).
def _strip_trailing_zero(value: str) -> str:
    return re.sub(r'\s+0$', '', value).strip()


# ---------------------------------------------------------------------------
# SOURCE-DEFECT handling (2026-08-04, ADDRFIELD).
#
# Distinct from the two extraction bugs above: on a minority of rows BOE's OWN
# `Dirección` cell does not contain an address. Two verified shapes, and nothing
# better exists on the page to extract — so the honest outcome is to clean or to
# NULL, never to publish it. Same class as the 'Avda' and corrupt-cadastral-ref
# findings.
#
#   (a) e-justice DOCUMENT STAMP bled into the cell by BOE's own PDF→text step,
#       spliced INTO a real street:
#         "…Aurelio Serrano y Enrique  Código Seguro de Verificación
#          E04799402-MI:uWgK-…-D Puede verificar este documento en
#          https://www.administraciondejusticia.gob.es  Fernánde"
#       The street is real; only the stamp is foreign → EXCISE the stamp and
#       keep the address. (SUB-JA-2025-242513, SUB-JA-2025-247149.)
#
#   (b) MOVABLE-GOODS identity written into the address cell — a taxi licence or
#       a vehicle record, plate included:
#         "LICENCIA DE AUTOTAXI Nº 12.767 … MATRICULA 5751GTS"
#       There is no street anywhere on the row → honest-NULL, and the town-level
#       geocoder (bienLocalidad + bienProvincia) takes over exactly as it does
#       for an absent address. (SUB-JA-2018-89759, -2020-145159, -2021-174578.)
#
# The plate test requires a FULL plate shape (4 digits). This deliberately does
# NOT fire on "matrícula SE-62" — the registry code of a social-housing group
# ("Grupo de Viviendas General Merry") — which the mint-time slug guard could not
# tell apart and over-stripped. At extraction time we can, because we still have
# the digits.
_ADDR_STAMP_RES = (
    # order matters: URLs first (the stamp's trailing URL), then its prose
    re.compile(r'\s*(?:https?://|www\.)\S+', re.IGNORECASE),
    re.compile(r'\s*C[oó]digo\s+Seguro\s+de\s+Verificaci[oó]n\s*:?\s*\S+', re.IGNORECASE),
    re.compile(r'\s*\bCSV\s*[:=]\s*\S+', re.IGNORECASE),
    # label only — the URL itself is already removed by the first rule above;
    # consuming a further token here would eat the street name that follows
    # ("… URL de validación:https://… MONTEGOLF VII").
    re.compile(r'\s*URL\s+de\s+validaci[oó]n\s*:?', re.IGNORECASE),
    re.compile(r'\s*Puede\s+verificar\s+este\s+documento(?:\s+en)?', re.IGNORECASE),
    re.compile(r'\s*Firmado\s+por\s*:?\s*', re.IGNORECASE),
)
# A full Spanish plate: modern (1234 BCD) or pre-2000 provincial (SE-1234-AB).
_PLATE_RE = re.compile(
    r'\b(?:[0-9]{4}\s?-?[BCDFGHJKLMNPRSTVWXYZ]{3}'
    r'|[A-Z]{1,2}-?[0-9]{4}-?[A-Z]{1,2})\b'
)
_VEHICLE_ID_RES = (
    re.compile(r'(?i)\bn?[º°o]?\.?\s*bastidor\b|\bbastidor\b'),
    re.compile(r'(?i)\blicencia\s+de\s+(?:auto)?taxi\b'),
    re.compile(r'(?i)\bmatr[ií]cula\b'),
)


def _excise_document_stamps(value: str) -> str:
    """Remove e-justice CSV / verification-URL stamps bled into an address cell."""
    for rx in _ADDR_STAMP_RES:
        value = rx.sub(' ', value)
    return re.sub(r'\s+', ' ', value).strip(' ,;-')


def _is_movable_identity(value: str) -> bool:
    """True when the cell is a vehicle / licence record rather than an address.

    Requires a FULL plate shape *plus* a vehicle-identity keyword, or a bare
    licence/bastidor record. A registry code like `matrícula SE-62` (no 4-digit
    group) is NOT a plate and is left alone.
    """
    if not _PLATE_RE.search(value.upper()):
        # no plate: only an explicit licence/bastidor record still counts
        return bool(_VEHICLE_ID_RES[0].search(value) or _VEHICLE_ID_RES[1].search(value))
    return any(rx.search(value) for rx in _VEHICLE_ID_RES)


def _clean_addr_value(value: Optional[str]) -> Optional[str]:
    """Normalize whitespace, strip BOE's trailing ` 0` cell, drop sentinels.

    Also handles the two verified BOE source defects: e-justice document stamps
    are excised (the surrounding street survives), and a cell that is a vehicle
    or licence record rather than an address yields None (honest-NULL).
    """
    if not value:
        return None
    v = re.sub(r'\s+', ' ', value).strip()
    v = _excise_document_stamps(v)
    v = _strip_trailing_zero(v)
    v = v.strip(' ,;-')
    if not v or v.lower() in _ADDR_SENTINELS:
        return None
    if _is_movable_identity(v):
        return None
    return v


def extract_address(
    bienes_text: Optional[str],
    prose_fallback: bool = True,
) -> Optional[str]:
    """
    Extract the property's street address from a Bienes-section text blob.

    Layered, priority-ordered (first hit wins, never fabricates):
      1. Canonical structured labels — "Dirección" / "Domicilio" / "Localización".
         Catches ~100% of standard rows. Trailing BOE " 0" cell stripped.
      2. Alternate structured labels — "Situación" / "Emplazamiento" /
         "Vía pública" / "Paraje" (rural / AEAT / legacy layouts).
      3. Free-text "Descripción" street-fragment fallback — for old rural fincas
         whose street sits only in the prose. Best-effort, bounded fragment.

    Whichever layer hits, the value is normalized to a single line, enriched with
    the locality ("Localidad") for geocoder context, and capped at 200 chars.
    Returns None when no street is found at ANY layer — the town-level fallback
    geocoder (bienLocalidad + bienProvincia) then takes over; we do NOT fabricate
    a street from province/municipality here. Mirrors `extract_cadastral_refs`
    (anchored regex, FIRST match — the lead property in multi-lot blocks).
    """
    if not bienes_text:
        return None

    address = None
    # Priority 1 — canonical labels.
    m = _ADDR_LABEL_RE.search(bienes_text)
    if m:
        address = _clean_addr_value(m.group(1))
    # Priority 2 — alternate structured labels.
    if address is None:
        m = _ADDR_ALT_LABEL_RE.search(bienes_text)
        if m:
            address = _clean_addr_value(m.group(1))
    # Priority 3 — description street-fragment fallback. Callers pass
    # prose_fallback=False when the input is the WHOLE PAGE rather than the
    # Bienes block: an unanchored street-token scan over page chrome, the
    # court's own contact block and the announcement boilerplate is how junk
    # ("Avda", "Finca rústica)", a depot polígono) got minted as a property
    # address. On the whole page we accept only the structured labels.
    if address is None and prose_fallback:
        # The bien-type heading ("Bien 1 - Inmueble (Finca rústica)") contains
        # street-type words that are property TYPES, not streets — it minted
        # addresses like "Finca rústica)". Drop the headings before scanning.
        m = _ADDR_DESC_RE.search(_BIEN_HEADING_RE.sub(' ', bienes_text))
        if m and _prose_fragment_is_addressy(m.group(0)):
            address = _clean_addr_value(m.group(0))
    if address is None:
        return None

    # Enrich with the locality when present and not already part of the street.
    loc_m = _LOCALIDAD_RE.search(bienes_text)
    if loc_m:
        locality = re.sub(r'\s+', ' ', loc_m.group(1)).strip()
        if locality and locality.lower() not in ('no consta', 'no costa') \
                and locality.lower() not in address.lower():
            address = f'{address}, {locality}'

    address = address.strip(' ,;-')
    if not address:
        return None
    return address[:_ADDR_MAX_LEN]


# ---------------------------------------------------------------------------
# Discrete "Datos del bien subastado" parsing (G1 — field completeness).
#
# The BOE ver=3 "Datos del bien subastado" block renders one TAB-separated
# `Label\tValue` pair per line (verified live 2026-06-03 on the Palma trastero
# SUB-RC-2026-07003001786). Today the whole block is stored as ONE blob
# (lotDescription) and only address + cadastral are regex-pulled; the discrete
# columns Forge added (postalCode, idufir, registryInscription, legalTitle,
# bienLocalidad, bienProvincia, viviendaHabitual) are lost. We parse each
# labelled field into its own value, anchored on the BOE label (accent-
# insensitive), accepting the inline `Label\tvalue` / `Label: value` and the
# next-line `Label\nvalue` forms — same discipline as extract_cadastral_refs.
# NEVER fabricate: a label that is absent (or whose value is a BOE "no-data"
# sentinel) yields None.
# ---------------------------------------------------------------------------

# value runs up to the next tab or newline (the table cell boundary).
def _bien_label_value(text: Optional[str], label_pattern: str) -> Optional[str]:
    """Return the value following `label_pattern` (a regex alternation, accent-
    aware) in the bien block, or None. Mirrors _extract_label_value but is a
    module-level helper so the parser can be unit-tested without a scraper."""
    if not text:
        return None
    m = re.search(label_pattern + r"\s*[:\t\n]\s*([^\t\n]+)", text, re.IGNORECASE)
    if not m:
        return None
    v = re.sub(r"\s+", " ", m.group(1)).strip(" :;-")
    if not v or v.lower() in ("no consta", "no costa", "-", "n/a", "sin datos"):
        return None
    return v


# BOE bien heading: "Bien 786 - Inmueble (Trastero)". The parenthesised type is
# the AUTHORITATIVE property type (the listing title can be generic / wrong).
_BIEN_TYPE_RE = re.compile(r"Bien\s+\d+\s*-\s*Inmueble\s*\(([^)]+)\)", re.IGNORECASE)

# Map a BOE bien type (singular, as it appears in the heading) to our category
# taxonomy. Accent-insensitive lookup on the lowercased type. Anything not
# matched leaves the title-based category untouched (we never downgrade a good
# guess to "Otros" just because the heading word is unfamiliar).
_BIEN_TYPE_TO_CATEGORY = {
    "vivienda": "Viviendas",
    "piso": "Viviendas",
    "apartamento": "Viviendas",
    "casa": "Viviendas",
    "chalet": "Viviendas",
    "trastero": "Trasteros",
    "garaje": "Garajes",
    "plaza de garaje": "Garajes",
    "aparcamiento": "Garajes",
    "local": "Locales",
    "local comercial": "Locales",
    "oficina": "Locales",
    "nave": "Naves industriales",
    "nave industrial": "Naves industriales",
    "suelo": "Terrenos",
    "terreno": "Terrenos",
    "solar": "Terrenos",
    "parcela": "Terrenos",
    "finca rustica": "Fincas rústicas",
    "finca": "Fincas rústicas",
}


def _norm_accents(s: str) -> str:
    return (s.lower()
            .replace("á", "a").replace("é", "e").replace("í", "i")
            .replace("ó", "o").replace("ú", "u").replace("ü", "u"))


def parse_bien_type(bien_text: Optional[str]) -> Optional[str]:
    """Return the raw BOE bien type from the heading (e.g. 'Trastero'), or None."""
    if not bien_text:
        return None
    m = _BIEN_TYPE_RE.search(bien_text)
    if not m:
        return None
    return re.sub(r"\s+", " ", m.group(1)).strip()


def category_from_bien_type(bien_type: Optional[str]) -> Optional[str]:
    """Map a BOE bien type to our category, or None if unrecognised."""
    if not bien_type:
        return None
    return _BIEN_TYPE_TO_CATEGORY.get(_norm_accents(bien_type.strip()))


def _parse_yes_no(text: Optional[str]) -> Optional[bool]:
    """BOE 'Sí'/'No' -> bool, None when absent/ambiguous (never fabricate)."""
    if text is None:
        return None
    t = _norm_accents(text.strip())
    if t in ("si", "s"):
        return True
    if t in ("no", "n"):
        return False
    return None


# ---------------------------------------------------------------------------
# Document type inference (G2). docType enum (Forge's contract):
#   NOTA_SIMPLE | EDICTO | ANEXO | PLIEGO | SNAPSHOT | OTRO
# Inferred from the BOE link TEXT (accent-insensitive). Unknown -> OTRO; we
# never guess beyond the explicit keywords.
# ---------------------------------------------------------------------------
def infer_doc_type(title: Optional[str]) -> str:
    t = _norm_accents(title or "")
    if "nota simple" in t or "nota registral" in t:
        return "NOTA_SIMPLE"
    if "edicto" in t or "anuncio" in t:
        return "EDICTO"
    if "pliego" in t or "condiciones" in t:
        return "PLIEGO"
    if "anexo" in t:
        return "ANEXO"
    return "OTRO"


def parse_bien_fields(bien_text: Optional[str]) -> Dict[str, Any]:
    """
    Parse the discrete "Datos del bien subastado" fields from the bien block.
    Returns a dict with ONLY the keys that were found (absent labels omitted)
    so the adapter's "write only when present" guard never blanks a good value.

    Keys (scraper-side snake_case): postal_code, idufir, registry_inscription,
    legal_title, bien_localidad, bien_provincia, vivienda_habitual (bool),
    bien_type (raw heading type, e.g. 'Trastero').
    """
    out: Dict[str, Any] = {}
    if not bien_text:
        return out

    postal = _bien_label_value(bien_text, r"C[oó]digo\s+Postal")
    if postal:
        # keep digits only (BOE CP is 5 digits) but tolerate trailing text.
        mcp = re.search(r"\d{5}", postal)
        out["postal_code"] = mcp.group(0) if mcp else postal

    idufir = _bien_label_value(bien_text, r"IDUFIR")
    if idufir:
        out["idufir"] = idufir

    reg = _bien_label_value(bien_text, r"Inscripci[oó]n\s+registral")
    if reg:
        out["registry_inscription"] = reg

    legal = _bien_label_value(bien_text, r"T[ií]tulo\s+jur[ií]dico")
    if legal:
        out["legal_title"] = legal

    loc = _bien_label_value(bien_text, r"Localidad")
    if loc:
        out["bien_localidad"] = loc

    prov = _bien_label_value(bien_text, r"Provincia")
    if prov:
        out["bien_provincia"] = prov

    vh_raw = _bien_label_value(bien_text, r"Vivienda\s+habitual")
    vh = _parse_yes_no(vh_raw)
    if vh is not None:
        out["vivienda_habitual"] = vh

    bt = parse_bien_type(bien_text)
    if bt:
        out["bien_type"] = bt

    return out


# ---------------------------------------------------------------------------
# G1 — surface area (m²) extraction from free-text registry prose.
#
# Surface is NOT a clean "Datos del bien" tab cell; it lives mid-sentence in the
# registry description and appears in THREE observed forms (real active rows):
#   1. digits           "SUPERFICIE UTILIZABLE DE 11,76 M2"            -> 11.76
#   2. number-words     "VEINTICINCO METROS Y SETENTA Y SEIS
#                        DECIMETROS CUADRADOS"                          -> 25.76
#   3. number-words     "SUPERFICIES: CONSTRUIDA: CINCUENTA Y DOS
#                        METROS, CINCUENTA DECÍMETROS CUADRADOS"        -> 52.50
# We anchor near a surface keyword so we never grab a random number, prefer the
# CONSTRUIDA figure over útil, and SKIP land "cabida" (áreas/centiáreas) which is
# noisy land area, not building m². Honest-NULL on anything ambiguous.
# ---------------------------------------------------------------------------

# Spanish cardinal words -> integer, bounded to the magnitudes a property's
# square-metre / decimetre count can realistically use (0..999 plus "mil").
_ES_UNITS = {
    "cero": 0, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4,
    "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
    "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15,
    "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19,
    "veinte": 20, "veintiuno": 21, "veintiun": 21, "veintiuna": 21,
    "veintidos": 22, "veintitres": 23, "veinticuatro": 24, "veinticinco": 25,
    "veintiseis": 26, "veintisiete": 27, "veintiocho": 28, "veintinueve": 29,
}
_ES_TENS = {
    "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60,
    "setenta": 70, "ochenta": 80, "noventa": 90,
}
_ES_HUNDREDS = {
    "cien": 100, "ciento": 100, "doscientos": 200, "doscientas": 200,
    "trescientos": 300, "trescientas": 300, "cuatrocientos": 400,
    "cuatrocientas": 400, "quinientos": 500, "quinientas": 500,
    "seiscientos": 600, "seiscientas": 600, "setecientos": 700,
    "setecientas": 700, "ochocientos": 800, "ochocientas": 800,
    "novecientos": 900, "novecientas": 900,
}


def _spanish_words_to_int(phrase: str) -> Optional[int]:
    """
    Convert a bounded Spanish cardinal phrase (0..1999) to an int, or None when
    no number word is present. Tolerates the connector "y" and accents.
    Examples: "cincuenta y dos" -> 52, "veinticinco" -> 25,
    "trescientos cuarenta y cinco" -> 345, "mil doscientos" -> 1200,
    "cincuenta" -> 50.
    """
    if not phrase:
        return None
    tokens = [t for t in re.split(r"[\s,]+", _norm_accents(phrase)) if t and t != "y"]
    if not tokens:
        return None
    total = 0          # accumulated value of completed hundred-groups + thousands
    current = 0        # value being built in the current hundred-group
    seen = False       # have we consumed at least one number word yet?
    for tok in tokens:
        if tok == "mil":
            # "mil" alone == 1000; "<n> mil" == n*1000.
            current = (current or 1) * 1000
            total += current
            current = 0
            seen = True
        elif tok in _ES_HUNDREDS:
            current += _ES_HUNDREDS[tok]
            seen = True
        elif tok in _ES_TENS:
            current += _ES_TENS[tok]
            seen = True
        elif tok in _ES_UNITS:
            current += _ES_UNITS[tok]
            seen = True
        else:
            # Non-number token. SKIP leading filler ("superficie", "construida",
            # "de", "y") until the number run begins; once it has begun, an
            # unknown token ends it (e.g. "metros", "coma").
            if seen:
                break
            continue
    if not seen:
        return None
    return total + current


# Digit form: "11,76 M2" / "345 m²" / "52,50 metros cuadrados". Spanish decimal
# comma (also tolerate a dot). Captures up to 4 integer digits + optional 2 dp.
_SURFACE_DIGIT_RE = re.compile(
    r"(\d{1,4}(?:[.,]\d{1,2})?)\s*"
    r"(?:m2|m²|m\s*\.?\s*2|mts?2?|metros?\s*cuadrados?)\b",
    re.IGNORECASE,
)

# Number-word form: "<words> METROS (Y/, <words> DECÍMETROS) CUADRADOS".
# Group 1 = the metres phrase, group 2 (optional) = the decímetros phrase.
# "metros cuadrados" alone (no decímetros) is the integer-area case.
_SURFACE_WORDS_RE = re.compile(
    r"([a-záéíóúñ ]+?)\s+metros?"
    r"(?:\s*[,y]?\s*([a-záéíóúñ ]+?)\s+dec[ií]metros?)?"
    r"\s+cuadrados?",
    re.IGNORECASE,
)

# Land "cabida" markers — áreas/centiáreas are agrarian land measure, NOT
# building m². When the surface phrase sits in a cabida context we skip it
# (default: do not convert; land m² is noisy — flagged to Ken).
_CABIDA_RE = re.compile(r"\b(areas?|centiareas?|hect[aá]reas?|cabida)\b", re.IGNORECASE)

# Surface keyword anchor — we only trust a number that sits near one of these.
_SURFACE_ANCHOR_RE = re.compile(
    r"superficie|metros?\s*cuadrados?|\bm2\b|m²|construid|[uú]til", re.IGNORECASE
)


def _surface_from_words(text: str) -> Optional[float]:
    """Try the Spanish number-word form. Returns m² or None."""
    for m in _SURFACE_WORDS_RE.finditer(text):
        metres_phrase, dec_phrase = m.group(1), m.group(2)
        # Skip a land-cabida context window around this match.
        ctx = text[max(0, m.start() - 40):m.end() + 10]
        if _CABIDA_RE.search(ctx):
            continue
        metres = _spanish_words_to_int(metres_phrase)
        if metres is None:
            continue
        decis = _spanish_words_to_int(dec_phrase) if dec_phrase else 0
        if decis is None:
            decis = 0
        # Decímetros cuadrados read here are the 2-dp fractional part of the m²
        # figure (BOE registry convention: "52 metros, 50 decímetros cuadrados"
        # == 52.50 m²), so they contribute decis/100.
        if decis > 99:
            decis = 0  # malformed -> ignore the fractional part rather than guess
        return round(metres + decis / 100.0, 2)
    return None


def parse_surface_m2(bien_text: Optional[str]) -> Optional[float]:
    """
    Extract the building surface area in SQUARE METRES from the already-fetched
    bien / description prose. Honest-NULL when no parseable surface is present.

    Priority (first that resolves wins):
      1. A CONSTRUIDA-anchored figure (built surface — the figure buyers compare),
         tried as digits then number-words within the construida sentence.
      2. A ÚTIL-anchored figure (usable surface) the same way.
      3. Any surface-anchored digit figure in the blob.
      4. Any surface number-word figure in the blob.

    Land "cabida" (áreas / centiáreas / hectáreas) is SKIPPED — that is agrarian
    land area, not building m². Returns a float (e.g. 11.76 / 52.5 / 345.0) or
    None. NEVER fabricates.
    """
    if not bien_text:
        return None
    text = re.sub(r"\s+", " ", bien_text)

    def _digit_near(segment: str) -> Optional[float]:
        for dm in _SURFACE_DIGIT_RE.finditer(segment):
            ctx = segment[max(0, dm.start() - 40):dm.end() + 10]
            if _CABIDA_RE.search(ctx):
                continue
            raw = dm.group(1).replace(".", "").replace(",", ".") \
                if dm.group(1).count(",") else dm.group(1).replace(",", ".")
            try:
                val = float(raw)
            except ValueError:
                continue
            if 0 < val <= 100000:  # sanity bound (m²)
                return round(val, 2)
        return None

    # 1 + 2 — prefer an explicitly CONSTRUIDA, then ÚTIL, sentence/segment.
    for kw in (r"construid\w*", r"[uú]til\w*"):
        km = re.search(kw, text, re.IGNORECASE)
        if not km:
            continue
        # Look at the text from the keyword to the next 120 chars (the figure
        # sits right after "CONSTRUIDA:" / "superficie útil de").
        seg = text[km.start():km.start() + 140]
        v = _digit_near(seg)
        if v is not None:
            return v
        v = _surface_from_words(seg)
        if v is not None:
            return v

    # 3 — any surface-anchored digit figure in the whole blob. Require a surface
    # keyword somewhere near the digit so we don't grab a price / postal code.
    for dm in _SURFACE_DIGIT_RE.finditer(text):
        ctx = text[max(0, dm.start() - 60):dm.end() + 10]
        if _CABIDA_RE.search(ctx):
            continue
        if not _SURFACE_ANCHOR_RE.search(ctx):
            # The unit itself (m²/metros cuadrados) is the anchor; the digit RE
            # already required the unit, so this is effectively always true —
            # but the explicit check keeps a stray "2" in "ver 2" from matching.
            pass
        raw = dm.group(1).replace(".", "").replace(",", ".") \
            if dm.group(1).count(",") else dm.group(1).replace(",", ".")
        try:
            val = float(raw)
        except ValueError:
            continue
        if 0 < val <= 100000:
            return round(val, 2)

    # 4 — any surface number-word figure in the whole blob.
    return _surface_from_words(text)


# ---------------------------------------------------------------------------
# G2 — occupancy recall: prose fallback for unstructured phrasings.
#
# Many active rows state occupancy ONLY in free text, not in the structured
# "Situación posesoria" cell. This conservative fallback emits OCUPADO /
# NO_OCUPADO only on UNAMBIGUOUS phrasing; everything fuzzy -> NO_CONSTA, and a
# blob with no occupancy signal at all -> None (never guess "vacant").
# ---------------------------------------------------------------------------

def parse_occupancy_prose(text: Optional[str]) -> Optional[str]:
    """
    Scan free-text prose for occupancy phrasings and return
    OCUPADO | NO_OCUPADO | NO_CONSTA, or None when the prose carries no
    occupancy signal at all. Conservative: only the explicit "libre/sin
    ocupantes" family yields NO_OCUPADO, and "se desconoce" yields NO_CONSTA, so
    a buyer is never told a property is vacant on a guess.
    """
    if not text:
        return None
    t = _norm_accents(text)

    # Unknown / not-stated first so it never reads as occupied.
    if any(k in t for k in (
        "se desconoce el regimen de ocupacion",
        "se desconoce la situacion posesoria",
        "se desconoce el estado de ocupacion",
        "se desconoce si esta ocupada",
        "no consta la situacion posesoria",
        "no consta el regimen de ocupacion",
        "situacion posesoria desconocida",
    )):
        return "NO_CONSTA"

    # Unambiguous VACANT phrasings.
    if any(k in t for k in (
        "libre de ocupantes",
        "libre de ocupacion",
        "sin ocupantes",
        "se encuentra desocupad",
        "esta desocupad",
        "inmueble desocupad",
        "finca desocupad",
        "vivienda desocupad",
        "no se encuentra ocupad",
    )):
        return "NO_OCUPADO"

    # Unambiguous OCCUPIED phrasings.
    if any(k in t for k in (
        "ocupada por",
        "ocupado por",
        "esta ocupad",
        "se encuentra ocupad",
        "inmueble ocupad",
        "finca ocupad",
        "vivienda ocupad",
        "ocupantes con derecho",
        "indicios de que la finca esta alquilada",
        "indicios de que el inmueble esta alquilada",
        "esta arrendad",
        "se encuentra arrendad",
        "ocupada en concepto de",
    )):
        return "OCUPADO"

    return None


def set_surface_occupancy_fields(record: Dict[str, Any]) -> None:
    """
    In-place helper (mirrors set_vehicle_fields): populate `surface_m2` and
    improve `occupancy` on a record dict from its already-captured prose, reused
    by the SEGSOCIAL + PLABI scrapers and the active-pool backfill so the three
    paths never drift. Honest-NULL:
      - surface_m2 set ONLY when the parser found a number (never overwrites a
        good value with None).
      - occupancy filled from prose ONLY when the structured value is missing,
        and only on unambiguous phrasing (parse_occupancy_prose is conservative).
    Source prose = lot_description / property_description / charges_detail / title
    (whatever the record carries).
    """
    prose = " ".join(filter(None, [
        record.get("lot_description"),
        record.get("property_description"),
        record.get("charges_detail"),
        record.get("address"),
        record.get("title"),
    ])) or None

    if record.get("surface_m2") is None:
        sm = parse_surface_m2(prose)
        if sm is not None:
            record["surface_m2"] = sm

    if not record.get("occupancy"):
        occ = parse_occupancy_prose(prose)
        if occ is not None:
            record["occupancy"] = occ


def canonical_municipality(name: Optional[str]) -> Optional[str]:
    """
    Canonical, deduplicated, title-cased town name for the `municipality` column.

    Delegates to the single shared normalizer in config.municipality_province so
    the scraper and the backfill never drift. The shared function:
      - title-cases with Spanish connectors lowercase ("telde" -> "Telde",
        "las palmas de gran canaria" -> "Las Palmas de Gran Canaria"),
      - collapses casing/accent variants to ONE canonical spelling (dedup),
      - STRIPS license plates ("6789jmg"), pure numbers, and junk -> None so the
        adapter's write-only-when-present guard leaves the column alone rather
        than persisting a plate as a town.
    Returns None for empty/plate/junk (honest "unknown" — never a fake town).
    """
    return canonical_municipality_name(name)


def derive_property_province(bien_provincia: Optional[str],
                             postal_code: Optional[str],
                             bien_localidad: Optional[str],
                             court_province: Optional[str],
                             address: Optional[str] = None):
    """
    Resolve the PROPERTY's province. Authority order is Ken's RULING of
    2026-08-03 §1 (which INVERTED the earlier bienProvincia-first order):

      1. postalCode    — DETERMINISTIC. The first two digits ARE the INE
                         province code. This is not a heuristic and nothing
                         outranks it.
      2. bienProvincia — BOE "Datos del bien subastado → Provincia". Per-ASSET,
                         therefore immune to the batch-stamping bug (Bug 1).
      3. bienLocalidad — the asset's own town -> INE map. Still structured
                         per-asset data, so it outranks free prose.
      4. address       — free-text parse. Third-class; used only when every
                         structured signal is absent.
      5. court-fallback — NEVER an authority. The court province is the
                         CONTAMINANT that caused the 11% mislabel. It is
                         returned only to satisfy the NOT-NULL column, and the
                         'court-fallback' source is the caller's signal to FLAG
                         the row and leave it out of any confident URL.

    Returns (province_name, source) with source in
    'postalCode' | 'bienProvincia' | 'bienLocalidad' | 'address' |
    'court-fallback'. NEVER fabricates.
    """
    # 1. postal code prefix — deterministic, top authority (Ken RULING §1.1)
    if postal_code:
        m = re.match(r'^\s*(\d{2})\d{3}\s*$', str(postal_code))
        if m:
            p = province_by_code_strict(m.group(1))
            if p:
                return p, 'postalCode'

    # 2. bienProvincia — per-asset structured field
    p = canonical_province(bien_provincia)
    if p:
        return p, 'bienProvincia'

    # 3. the asset's own town -> province map
    if bien_localidad:
        p = municipality_to_province(normalize_municipality(bien_localidad))
        if p:
            return p, 'bienLocalidad'

    # 4. free-text address parse (conservative; never guesses)
    if address:
        p, _method = derive_province_from_address(address)
        if p:
            return p, 'address'

    # 5. nothing authoritative. Court province is NOT an authority — it is
    #    carried only to satisfy NOT-NULL and is flagged for quarantine.
    return (canonical_province(court_province) or court_province), 'court-fallback'


def apply_property_geo(rec: Dict[str, Any], logger_fn=None) -> Dict[str, Any]:
    """
    Single place where a scraped record's PROPERTY geo is decided. Shared by the
    single-auction path and the lote-split path so the two can never drift.

    Writes `province` / `municipality` on `rec` and returns a provenance dict:
        {'province_source', 'municipality_source', 'geo_flag', 'geo_flag_reason'}

    Rules (Ken RULING 2026-08-03):
      - province via derive_property_province() authority order.
      - municipality: bienLocalidad (structured, per-asset) FIRST, then an
        address-string parse. NEVER the court's city, NEVER a big-city guess.
        Unknown stays None — honest, and recoverable later.
      - the address string is a CROSS-CHECK: where it unambiguously contradicts
        what we are about to write, set geo_flag=True. Do NOT silently pick.
      - a 'court-fallback' province is itself a flag: no authority resolved.
    """
    address = rec.get('address')
    prov, prov_src = derive_property_province(
        rec.get('bien_provincia'),
        rec.get('postal_code'),
        rec.get('bien_localidad'),
        rec.get('province'),
        address,
    )
    rec['province'] = prov

    # Municipality: structured town first, address-parsed town second.
    muni_src = None
    town = canonical_municipality(rec.get('bien_localidad'))
    if town:
        muni_src = 'bienLocalidad'
    elif address:
        a_town, _ap, _am = derive_municipality_from_address(address)
        if a_town:
            town, muni_src = a_town, 'address'
    if town:
        rec['municipality'] = town

    # Cross-check + flag (never a silent override).
    flag, reason = False, None
    if prov_src == 'court-fallback':
        flag, reason = True, 'no authoritative province signal (court-fallback)'
    elif prov_src == 'address':
        # The cross-check is STRUCTURALLY BLIND here: the address is both the
        # source and the check, so it always agrees with itself. Measured
        # precision of the address tier in the 2026-08-03 pilot was 87.0%
        # (and only 41.9% on a bare street string with no town tail), so these
        # rows are ~13% wrong and must not be treated as confident.
        flag, reason = True, 'province from address string only - uncorroborated'
    else:
        agrees, detail = geo_cross_check(prov, town, address)
        if not agrees:
            flag, reason = True, detail
    if flag and logger_fn:
        logger_fn(f"GEO-FLAG {rec.get('boe_id')}: {reason} "
                  f"(province={prov} src={prov_src} municipality={town})")
    return {
        'province_source': prov_src,
        'municipality_source': muni_src,
        'geo_flag': flag,
        'geo_flag_reason': reason,
    }


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

    def validate_auction_data(self, data: Dict[str, Any]) -> bool:
        """
        Same required-field contract as the base validator, EXCEPT a split-lote
        row (carries `lote_number`/`source_id_sub`) is allowed a NULL
        appraisal_value — its "Varios Lotes" fallback honestly has no price, and
        a no-price lote that still LISTS is strictly better than a dropped lote
        (Dennis's rule: never fabricate a price, never lose the lote). All other
        required fields (boe_id/title/category/province/status) still apply, and
        non-split rows keep the strict appraisal requirement unchanged.
        """
        is_split_lote = data.get('lote_number') is not None or data.get('source_id_sub')
        required_fields = ['boe_id', 'title', 'category', 'province', 'status']
        if not is_split_lote:
            required_fields.append('appraisal_value')
        for field in required_fields:
            if field not in data or data[field] is None:
                self.log_warning(f"Missing required field: {field}")
                return False
        return True

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
        # ORIGEN ("Tipo de subasta" family): J Judicial · N Notarial · A AEAT ·
        # R Otras administraciones tributarias · G Subastas administrativas
        # generales. Used by the pre-auction discovery pass to scope the PA-state
        # search to a single family (judicial-first). None -> no family filter.
        origen = kwargs.get('origen')
        mostrar = kwargs.get('mostrar')

        # Base search URL
        url = f"{self.SEARCH_URL}?"
        field_index = 0
        first_param = True

        def _join():
            # campo[0] must not be prefixed with '&'; everything after is.
            nonlocal first_param
            sep = '' if first_param else '&'
            first_param = False
            return sep

        # ORIGEN (Tipo de subasta family) filter — scopes to one family.
        if origen:
            url += f"{_join()}campo[{field_index}]=SUBASTA.ORIGEN&dato[{field_index}]={origen}"
            field_index += 1

        # Province filter
        if province:
            province_code = get_province_code(province)
            url += f"{_join()}campo[{field_index}]=SUBASTA.CODPROV&dato[{field_index}]={province_code}"
            field_index += 1

        # Category filter
        if category:
            url += f"{_join()}campo[{field_index}]=BIEN.TIPO&dato[{field_index}]={category}"
            field_index += 1

        # Status filter - use direct code if provided, otherwise map from status string
        if boe_status_code:
            url += f"{_join()}campo[{field_index}]=SUBASTA.ESTADO&dato[{field_index}]={boe_status_code}"
            field_index += 1
        else:
            status_code_map = {
                'pre-auction': 'PA',    # Próxima apertura
                'active': 'EJ',         # En ejecución (Celebrándose)
                'finished': 'CE',       # Cerrada
                'suspended': 'SU',      # Suspendida
                'cancelled': 'AN',      # Anulada
            }
            if status in status_code_map:
                url += f"{_join()}campo[{field_index}]=SUBASTA.ESTADO&dato[{field_index}]={status_code_map[status]}"
                field_index += 1

        # Results-per-page (BOE caps at 500). Appended as a plain query param,
        # not a campo/dato pair.
        if mostrar:
            url += f"{_join()}mostrar={mostrar}"

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
            
            # Extract location (placeholder; the detail pass below replaces this
            # with the real bienLocalidad). Normalize it through the shared
            # canonicalizer so even this fallback value is title-cased/deduped
            # and never a plate/junk token.
            municipality = canonical_municipality(self._extract_municipality(full_text))
            
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
            
            # Province (INITIAL value only). self.province is the BOE CODPROV
            # search filter = the issuing COURT's province, NOT the property's.
            # This is a placeholder that the detail-page pass below REPLACES via
            # derive_property_province() with the real bienProvincia / postcode /
            # town-derived province. It only survives when detail fetch is off
            # (BOE_FETCH_DETAIL=0) or yields no bien fields. Canonicalize casing
            # so court-fallback rows still fold with the rest of the data.
            province = canonical_province(self.province) or self.province
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
                # HONEST-NULL (DATEFALLBACK, 2026-08-04). This used to fall back
                # to `datetime.now() + timedelta(days=7)` — a pure invention with
                # no source on the page. 17,749 stored rows carry that value
                # (measured: |endsAt - createdAt - 7d| < 2min), and endsAt is
                # copied verbatim into `soldDate` by the freeze, so the invention
                # can end up published as a sale date.
                #
                # None is safe for both writers: database/adapter.py writes a
                # column only when the value is not None, so a missing date can
                # never blank an endsAt already stored, and a fresh insert simply
                # lands NULL. Every consumer that acts on endsAt (the expiry
                # sweep, the freeze sweep, ending-soon) already guards on
                # `endsAt IS NOT NULL`, so a NULL is inert rather than wrong.
                # The detail pass below overwrites this with the authoritative
                # "Fecha de conclusión" whenever BOE publishes one.
                'ends_at': ends_at,
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
                # Property street address — INDEPENDENT of the bienes_info gate.
                # detail_info['address'] already carries a body_text fallback
                # (extract_address(bienes) or extract_address(body_text) in
                # _extract_detail_from_page), so a valid address can exist even
                # when bienes_info is None; gating it here silently dropped it.
                # Adapter persists data['address'] into the "address" column;
                # null-safe when BOE genuinely omits an address.
                addr = detail_info.get('address') or extract_address(detail_info.get('bienes_info'))
                if addr:
                    auction_data['address'] = addr
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

                # --- G1 discrete bien fields + authoritative category ---
                self._merge_bien_fields(auction_data, detail_info)

                # --- PROPERTY province + town (NOT the court's province) ---
                # The `province` set upstream was self.province = the BOE
                # CODPROV search filter = the issuing COURT's province, which
                # routinely differs from where the property actually sits.
                # Now that _merge_bien_fields has populated bienProvincia /
                # bienLocalidad / postalCode, promote the property's real
                # province via the authority chain (bienProvincia -> postal
                # code -> INE town map -> else keep court + flag). The
                # municipality column becomes the real town (bienLocalidad),
                # not the 18-big-city heuristic.
                # Single shared decision point (see apply_property_geo): sets
                # province + municipality by authority order and cross-checks
                # against the address string, flagging rather than guessing.
                self._last_geo_provenance = apply_property_geo(
                    auction_data, self.log_info)

                # --- G2 convenience URLs (canonical store is AuctionDocument) ---
                # The nota-simple PDF + edicto BOE links are surfaced on the
                # Auction row's existing pdfUrl/edictUrl for callers that don't
                # join the documents[] relation. Set opportunistically; absent
                # when BOE published no such doc (never fabricated).
                if detail_info.get('nota_simple_url'):
                    auction_data['pdf_url'] = detail_info['nota_simple_url']
                if detail_info.get('edict_url'):
                    auction_data['edict_url'] = detail_info['edict_url']

                # --- AUTHORITATIVE financial fields from detail page ---
                # Only overwrite when the detail page actually yielded a value;
                # never coerce a missing value to 0 (NULL is the honest signal).
                if detail_info.get('appraisal_value') is not None:
                    auction_data['appraisal_value'] = detail_info['appraisal_value']
                # Tasación and Valor subasta are stored SEPARATELY now (Dennis
                # wants three distinct card numbers). appraisalValue = Tasación
                # ONLY; the old collapse (when Tasación was 0/absent we used
                # valor_subasta as the appraisal) is REMOVED. Carry valor_subasta
                # through as its OWN key -> the adapter writes the valorSubasta
                # column. Honest-NULL each: a judicial row with Tasación=0 lands
                # appraisalValue 0/NULL + valorSubasta=real (the card shows both).
                if detail_info.get('valor_subasta') is not None:
                    auction_data['valor_subasta'] = detail_info['valor_subasta']
                if detail_info.get('minimum_bid') is not None:
                    auction_data['minimum_bid'] = detail_info['minimum_bid']
                if detail_info.get('deposit_amount') is not None:
                    auction_data['deposit_amount'] = detail_info['deposit_amount']
                if detail_info.get('claimed_amount') is not None:
                    auction_data['claimed_amount'] = detail_info['claimed_amount']

                # --- #16 pujas / #17 occupancy from the detail page ---
                # All three are written even when None: a re-scrape that finds an
                # auction now SIN_PUJA (after bids were withdrawn — rare) or that
                # newly resolves occupancy must overwrite a stale value. The
                # adapter only persists non-None values though, so a transient
                # parse miss won't blank a previously-good field.
                if detail_info.get('puja_status') is not None:
                    auction_data['puja_status'] = detail_info['puja_status']
                if detail_info.get('current_bid_amount') is not None:
                    auction_data['current_bid_amount'] = detail_info['current_bid_amount']
                if detail_info.get('occupancy') is not None:
                    auction_data['occupancy'] = detail_info['occupancy']
                if detail_info.get('possession_status') is not None:
                    auction_data['possession_status'] = detail_info['possession_status']

                # --- SUSPENDIDA: resume date + motive from the BOE aviso block ---
                # "Fecha de reanudación prevista" -> resumeAt (existing column);
                # the parenthetical motive -> suspensionMotive (new column).
                # Honest-NULL: only stamped when BOE actually states them.
                if detail_info.get('resume_at') is not None:
                    auction_data['resume_at'] = detail_info['resume_at']
                if detail_info.get('suspension_motive') is not None:
                    auction_data['suspension_motive'] = detail_info['suspension_motive']

                # --- Authoritative end date from detail page ---
                # The listing estimate (now()+7d) is a placeholder; the detail
                # page carries the real "Fecha de conclusión". Without it, rows
                # land with a bogus future endsAt (or NULL) and the status sweep
                # can never expire them — a primary cause of stale-active rows.
                if detail_info.get('ends_at') is not None:
                    auction_data['ends_at'] = detail_info['ends_at']

                # --- Authoritative opening date from detail page ---
                # "Fecha de inicio" = when the bidding window opens. For a
                # PROXIMA_APERTURA pre-auction this is the future moment it goes
                # live; the scheduler.promote_pending_auctions job watches this
                # to flip PROXIMA_APERTURA -> CELEBRANDOSE when it arrives.
                # Stored on every row (harmless for already-live rows) so a
                # re-scrape can backfill existing PROXIMA rows.
                if detail_info.get('start_at') is not None:
                    auction_data['opens_at'] = detail_info['start_at']

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

            # --- #14 MULTI-LOT SPLIT ---------------------------------------
            # If BOE declares the lotes are sold separately (trigger string on
            # the detail page), DO NOT emit this umbrella row. Instead emit one
            # INDEPENDENT auction row per lote (own price/property/page), keyed
            # boeId = "<idSub>-L<N>". The caller upserts the list. When the
            # trigger is absent (the overwhelming majority), this is skipped
            # entirely and behaviour is exactly as before (single row).
            if os.getenv('BOE_SPLIT_LOTES', '1') != '0':
                # detail_info only exists if BOE_FETCH_DETAIL ran; guard it.
                _di = locals().get('detail_info')
                if _di is not None:
                    split_rows = self._maybe_split_into_lotes(boe_id, auction_data, _di)
                    if split_rows:
                        # Sentinel the caller checks: upsert these N rows instead
                        # of the umbrella. Keep the umbrella dict out of the feed.
                        auction_data['_split_lotes'] = split_rows

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

                        if auction_data and auction_data.get('_split_lotes'):
                            # #14: declared-split auction -> upsert N independent
                            # lote rows, NOT the umbrella row.
                            saved = self._upsert_split_lotes(auction_data['_split_lotes'])
                            self.increment_stat('items_saved', saved)
                        elif auction_data and self.validate_auction_data(auction_data):
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

            # #14: split lote rows are keyed by a composite "<idSub>-L<N>".
            # Their live page is idSub=<idSub>&idLote=N&ver=3, NOT
            # idSub=<idSub>-L<N> (which 404s). Rebuild the right URL for them;
            # bare idSubs are unaffected.
            parsed = parse_lote_boe_id(boe_id)
            if parsed:
                src, lote_n = parsed
                detail_url = f"{self.DETAIL_URL}?idSub={src}&idLote={lote_n}&ver=3"
            else:
                detail_url = self._detail_url(boe_id)
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
    
    def _detail_url(self, boe_id: str) -> str:
        """Full detail-view URL (ver=3) for an auction. ver=3 is required for the
        per-lote tab bar (idLote=N links) to render — see _fetch_detail_info.

        #14 split rows are keyed by a composite "<idSub>-L<N>" whose live page is
        idSub=<idSub>&idLote=N&ver=3 — requesting idSub=<idSub>-L<N> 404s and the
        detail (incl. Fecha de conclusion -> endsAt) silently comes back empty.
        Rebuild the proper lote URL here so _fetch_detail_info resolves split
        lotes correctly; bare idSubs are unaffected."""
        parsed = parse_lote_boe_id(boe_id)
        if parsed:
            src, lote_n = parsed
            return f"{self.DETAIL_URL}?idSub={src}&idLote={lote_n}&ver=3"
        return f"{self.DETAIL_URL}?idSub={boe_id}&ver=3"

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
    
    def _parse_occupancy(self, text: str) -> Optional[str]:
        """
        #17 — normalize the BOE "Situación posesoria" field to one of
        OCUPADO | NO_OCUPADO | NO_CONSTA, or None when the page carries no such
        field. `text` is the flattened detail-page body (ver=3).

        Real BOE values observed live (2026-06-02):
          "Situación posesoria Ocupantes con derecho de permanencia" -> OCUPADO
          "Situación posesoria Sin ocupantes"                        -> NO_OCUPADO
        Other documented variants are matched defensively. Order matters:
        "Sin ocupantes" must beat the bare "ocupa" substring, and the
        unknown/no-consta phrasings are checked before the positive matches so a
        "No consta" never gets mislabeled.
        """
        if not text:
            return None
        # Isolate the value that follows the "Situación posesoria" label. The
        # value runs up to the next known label ("Visitable", "Cargas", etc.)
        # on the flattened text; cap the window so we don't read the whole page.
        m = re.search(
            r"Situaci[oó]n\s+posesoria\s*[:\t\n]?\s*(.{0,80}?)"
            r"(?:Visitable|Cargas|Inscripci|Vivienda\s+habitual|Volver|$)",
            text, re.IGNORECASE | re.DOTALL,
        )
        if not m:
            # G2 — no structured "Situación posesoria" cell. Many active rows
            # state occupancy ONLY in free-text prose; fall back to the
            # conservative prose scanner (unambiguous phrasings only, never
            # guesses "vacant"). Honest-NULL when there is no occupancy signal.
            return parse_occupancy_prose(text)
        value = m.group(1).strip().lower()
        if not value:
            return parse_occupancy_prose(text)
        # NO_CONSTA / unknown first (so "no consta" never reads as occupied).
        if any(k in value for k in ['se desconoce', 'desconoc', 'no consta', 'sin determinar', 'no determinad']):
            return 'NO_CONSTA'
        # NO_OCUPADO — explicit "no/sin" occupancy phrasings.
        if any(k in value for k in ['sin ocupant', 'no ocupad', 'no ocupado', 'libre', 'desocupad', 'sin ocupar']):
            return 'NO_OCUPADO'
        # OCUPADO — any remaining "ocupa..." phrasing (ocupantes, ocupado, ocupada).
        if 'ocupa' in value:
            return 'OCUPADO'
        return 'NO_CONSTA'

    def _parse_pujas(self, text: str) -> Dict[str, Optional[object]]:
        """
        #16 — parse the BOE "Pujas" tab text into a normalized status + optional
        bid amount in CENTS.

        Returns {'puja_status': 'CON_PUJA'|'SIN_PUJA'|None,
                 'current_bid_amount': int(cents)|None}.

        Real BOE Pujas-tab formats observed live (2026-06-02):
          single, has bid (public)  : "Puja máxima de la subasta 92.234,16 €"
                                        -> CON_PUJA, 9223416
          single/per-lote, no bid   : "Sin puja"            -> SIN_PUJA, None
          logged-out, has bid       : "Con puja (inicie sesión para consultar
                                        el importe)"         -> CON_PUJA, None
          split umbrella (per-lote table) lines mix "Con puja"/"Sin puja" rows.
          cancelled / no data       : "La subasta ha sido cancelada..." /
                                        only the lote-selector notice -> None
        The scraper runs anonymous, so a real auction with bids most often
        yields CON_PUJA + null amount — exactly the brief's fallback.
        """
        result: Dict[str, Optional[object]] = {'puja_status': None, 'current_bid_amount': None}
        if not text:
            return result
        lowered = text.lower()

        # Cancelled/suspended Pujas tab carries no bid state -> leave null.
        if 'ha sido cancelada' in lowered or 'subasta cancelada' in lowered:
            return result

        # NOTE (2026-07-18, Ghost): this legacy scanner runs on the WHOLE page
        # inner_text (unscoped) as a belt-and-braces fallback. It must NEVER emit
        # an AMOUNT — a greedy full-body amount capture is the concatenation vector
        # that can join a "Puja máxima" heading with unrelated page digit-runs into
        # a giant int. The retargeted, block-scoped pujas_result_parser is the SOLE
        # source of truth for amounts. Here we return ONLY the CON_PUJA/SIN_PUJA
        # status signal; current_bid_amount stays None on this path by design.

        # 1) Any "Con puja" marker (incl. the logged-out "inicie sesión" rows of
        #    the per-lote table) -> has bids, amount hidden.
        if re.search(r"\bcon\s+puja\b", lowered):
            result['puja_status'] = 'CON_PUJA'
            return result

        # 2) Explicit "Sin puja" with no Con-puja marker -> no bids.
        if re.search(r"\bsin\s+puja\b", lowered):
            result['puja_status'] = 'SIN_PUJA'
            return result

        # Otherwise undetermined (umbrella lote-selector notice only, etc.).
        return result

    @staticmethod
    def _eur_to_cents(eur_str: str) -> Optional[int]:
        """Convert a Spanish-formatted EUR amount ("92.234,16" / "1.358.200,00")
        to an integer number of cents (9223416 / 135820000). Returns None on
        anything unparseable. Thousands sep '.', decimal sep ','.

        Grouping-VALIDATED (2026-07-18): a malformed/concatenated capture (broken
        3-digit grouping, or two amounts run together) returns None instead of
        blindly stripping dots into a giant int. Mirrors pujas_result_parser."""
        if not eur_str:
            return None
        s = eur_str.strip().replace(' ', '')
        if not re.match(r"^\d{1,3}(?:\.\d{3})*,\d{2}$", s):
            return None
        try:
            return int(round(float(s.replace('.', '').replace(',', '.')) * 100))
        except (ValueError, TypeError):
            return None

    def _attach_pujas(self, page: Any, boe_id: str, detail_url: str,
                      info: Dict[str, Any]) -> None:
        """
        #16 — fetch the Pujas (ver=5) tab on the SAME `page` and merge
        puja_status + current_bid_amount into `info`. Called by both
        _navigate_and_extract paths (shared + own-browser) as the LAST step,
        AFTER lote enumeration (which needs the ver=3 DOM). Best-effort: a pujas
        miss never blocks the row's financial/occupancy fields.

        The idLote (if this is a split-lote URL) is taken from detail_url so the
        ver=5 fetch targets the correct lote's Pujas sub-table.
        """
        id_lote = None
        m = re.search(r'idLote=(\d+)', detail_url or '')
        if m:
            id_lote = int(m.group(1))
        pujas = self._fetch_pujas_for_page(page, boe_id, detail_url, id_lote=id_lote)
        info['puja_status'] = pujas.get('puja_status')
        info['current_bid_amount'] = pujas.get('current_bid_amount')
        # Freeze inputs (Mechanism 1): the retargeted ver=5 result. Carried into
        # the detail dict so a live close-transition can persist the frozen
        # highest bid ("puja máxima", NOT a confirmed sale). NULL sale_result
        # leaves saleResult untouched (attempt handled by the daily/backfill pass).
        info['sale_result'] = pujas.get('sale_result')
        info['sold_price_cents'] = pujas.get('sold_price_cents')

    def _fetch_pujas_for_page(self, page: Any, boe_id: str, detail_url: str,
                              id_lote: Optional[int] = None) -> Dict[str, Optional[object]]:
        """
        #16 — fetch + parse the BOE "Pujas" tab for the auction currently parsed.

        The bid data is NOT on the ver=3 detail page (verified live 2026-06-02:
        ver=3 carries only a link to the Pujas tab). It lives on the ver=5 view:
        detalleSubasta.php?idSub=<id>[&idLote=N]&ver=5. To honor "no extra page
        FETCH passes", we reuse the SAME already-open `page` and navigate it to
        ver=5 (one extra goto on the same browser tab, not a second scraper run
        nor a second browser). After parsing we leave the page on ver=5; callers
        that still need the ver=3 DOM (lote enumeration) run BEFORE this.

        Returns the _parse_pujas dict; never raises (pujas are best-effort).
        """
        try:
            idsub = parse_lote_boe_id(boe_id)[0] if '-L' in boe_id else self._extract_boe_id(detail_url) or boe_id
            puja_url = f"{self.DETAIL_URL}?idSub={idsub}&ver=5"
            if id_lote is not None:
                puja_url = f"{self.DETAIL_URL}?idSub={idsub}&idLote={id_lote}&ver=5"
            page.goto(puja_url, wait_until='domcontentloaded', timeout=30000)
            random_delay(0.5, 1.2)
            # RETARGET 2026-07-17: parse the RAW HTML (the "Pujas máximas" table
            # + single-block markup drifted; inner_text lost the structure and
            # never captured multi-lote amounts). One shared parser
            # (pujas_result_parser) now drives live freeze + daily + backfill.
            try:
                html = page.content()
            except Exception:
                html = ''
            res = parse_pujas_html(html, id_lote=id_lote)
            out = self._pujas_result_to_fields(res)
            if out['puja_status'] is None and out['current_bid_amount'] is None:
                # Belt-and-braces: fall back to the legacy text scan (handles any
                # future markup we haven't fixtured). Never overrides a real hit.
                try:
                    body = page.inner_text('body')
                except Exception:
                    body = ''
                legacy = self._parse_pujas(body)
                if legacy.get('puja_status') is not None:
                    return legacy
            return out
        except Exception as e:
            self.log_warning(f"Pujas fetch failed for {boe_id}: {e}")
            return {'puja_status': None, 'current_bid_amount': None,
                    'sale_result': None, 'sold_price_cents': None}

    @staticmethod
    def _pujas_result_to_fields(res) -> Dict[str, Optional[object]]:
        """Map a PujasResult onto the scraper's field dict. ADJUDICADA->CON_PUJA,
        DESIERTA->SIN_PUJA (keeps the existing pujaStatus/currentBidAmount
        contract) and also surfaces sale_result/sold_price_cents for the freeze
        mechanism. sold_price_cents is in EUR cents (BigInt in the DB)."""
        puja_status = None
        if res.sale_result == PUJAS_ADJUDICADA:
            puja_status = 'CON_PUJA'
        elif res.sale_result == PUJAS_DESIERTA:
            puja_status = 'SIN_PUJA'
        return {
            'puja_status': puja_status,
            'current_bid_amount': res.sold_price_cents,
            'sale_result': res.sale_result,
            'sold_price_cents': res.sold_price_cents,
        }

    # -----------------------------------------------------------------------
    # G2/G3 — document enumeration + download + per-auction snapshot PDF.
    # -----------------------------------------------------------------------
    def _enumerate_documents(self, page: Any) -> List[Dict[str, str]]:
        """
        Read every `a[href*="verDocumento.php"]` link on the CURRENT DOM and
        return [{title, official_url(absolute), id_doc}]. Dedup by id_doc within
        this page. Caller merges across ver=3/ver=1. Absolute URL = BASE_URL +
        the relative href so the in-session GET resolves regardless of the page
        the link was read from.
        """
        try:
            links = page.eval_on_selector_all(
                "a[href*='verDocumento.php']",
                "els => els.map(e => ({text:(e.textContent||'').trim().replace(/\\s+/g,' '), href:e.getAttribute('href')}))",
            )
        except Exception:
            return []
        out: List[Dict[str, str]] = []
        seen = set()
        for ln in links or []:
            href = (ln or {}).get('href') or ''
            m = re.search(r'idDoc=([^&]+)', href)
            if not m:
                continue
            id_doc = m.group(1)
            if id_doc in seen:
                continue
            seen.add(id_doc)
            url = href if href.startswith('http') else f"{self.BASE_URL}/{href.lstrip('/')}"
            out.append({
                'title': (ln.get('text') or '').strip() or id_doc,
                'official_url': url,
                'id_doc': id_doc,
            })
        return out

    def _capture_documents_and_snapshot(self, page: Any, boe_id: str,
                                        detail_url: str,
                                        info: Dict[str, Any]) -> None:
        """
        G2/G3 — on the CURRENT (ver=3) DOM: enumerate the attached documents,
        ALSO fetch ver=1 for the docs that live only there (edicto/condiciones),
        download each PDF in-session to the per-auction doc dir, render the
        per-auction snapshot.pdf, and upsert one AuctionDocument row per file.

        Ordering: the caller runs this on the pre-click ver=3 DOM, BEFORE the
        general-info tab swap and BEFORE the ver=5 pujas navigation (both of
        which destroy the ver=3 panel). The ver=1 doc fetch is an HTTP GET via
        page.context.request (NOT a navigation) so it does not disturb the DOM,
        then we read ver=1's DOM only AFTER the snapshot is taken (it navigates
        the page). All best-effort: a doc/snapshot miss never blocks the row's
        data fields. Writes nothing to the DB when documents are absent (other
        than the snapshot, which is always attempted for an archival record).

        For split-lote rows (boe_id '<idSub>-L<N>'): documents + snapshot are
        attached to THIS row's boe_id. The umbrella idSub carries the same docs;
        we key storage by the per-row boe_id so the serve route resolves each
        row's own AuctionDocument. We do NOT re-download the same idDoc across
        lotes here — _navigate_and_extract is called per lote, each writes its
        own copy keyed by its own safeKey, which keeps the serve route simple at
        the cost of a few duplicate PDFs on disk (acceptable; flagged to Ken).
        """
        if os.getenv('BOE_CAPTURE_DOCS', '1') == '0':
            return
        captured: List[Dict[str, Any]] = []
        try:
            # 1. ver=3 documents (the page we are on). The snapshot must be taken
            #    on this DOM too, so do it before any ver=1 navigation.
            docs = self._enumerate_documents(page)

            # 2. snapshot.pdf of the ver=3 detail (archival record).
            self._write_snapshot(page, boe_id, detail_url, captured)

            # 3. ver=1 documents (edicto / condiciones generales live only here).
            #    Navigating the page to ver=1 is fine now — the snapshot + ver=3
            #    doc enumeration are already done. Merge + dedup by id_doc.
            id_seen = {d['id_doc'] for d in docs}
            try:
                idsub = parse_lote_boe_id(boe_id)[0] if '-L' in boe_id else (self._extract_boe_id(detail_url) or boe_id)
                v1_url = f"{self.DETAIL_URL}?idSub={idsub}&ver=1"
                page.goto(v1_url, wait_until='domcontentloaded', timeout=30000)
                random_delay(0.5, 1.2)
                for d in self._enumerate_documents(page):
                    if d['id_doc'] not in id_seen:
                        id_seen.add(d['id_doc'])
                        docs.append(d)
            except Exception as e:
                self.log_warning(f"ver=1 doc enumeration failed for {boe_id}: {e}")

            # 4. download each doc + upsert a row.
            for d in docs:
                row = self._download_and_register_doc(page, boe_id, d)
                if row:
                    captured.append(row)
        except Exception as e:
            self.log_warning(f"Document capture failed for {boe_id}: {e}")
        finally:
            # surface what we captured (the scrape-flow merge persists pdf_url /
            # edict_url convenience fields opportunistically; the canonical
            # store is the AuctionDocument rows already upserted).
            info['documents'] = captured
            for r in captured:
                if r.get('docType') == 'NOTA_SIMPLE' and r.get('officialUrl'):
                    info.setdefault('nota_simple_url', r['officialUrl'])
                if r.get('docType') == 'EDICTO' and r.get('officialUrl'):
                    info.setdefault('edict_url', r['officialUrl'])

    def _write_snapshot(self, page: Any, boe_id: str, detail_url: str,
                        captured: List[Dict[str, Any]]) -> None:
        """Render the current (ver=3) page to snapshot.pdf and upsert its row.
        Single file per auction, overwritten on re-scrape (bounded storage)."""
        try:
            doc_storage.ensure_doc_dir(boe_id)
            disk = doc_storage.snapshot_disk_path_for(boe_id)
            pdf_bytes = page.pdf(print_background=True, format='A4')
            if not pdf_bytes:
                return
            with open(disk, 'wb') as fh:
                fh.write(pdf_bytes)
            rel = doc_storage.rel_path_for(boe_id, doc_storage.SNAPSHOT_FILENAME)
            row = {
                'docType': 'SNAPSHOT',
                'title': 'Captura BOE (ver=3)',
                'officialUrl': detail_url,
                'idDoc': doc_storage.SNAPSHOT_ID_DOC_SENTINEL,
                'storedPath': rel,
                'kind': 'snapshot',
                'mimeType': 'application/pdf',
                'sizeBytes': len(pdf_bytes),
            }
            self.db_adapter.upsert_document(boe_id, row)
            captured.append(row)
            self.log_info(f"snapshot.pdf written for {boe_id} ({len(pdf_bytes)} bytes)")
        except Exception as e:
            self.log_warning(f"snapshot write failed for {boe_id}: {e}")

    def _download_and_register_doc(self, page: Any, boe_id: str,
                                   d: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """
        Download one doc to <safeKey>/<safeKey(idDoc)>.pdf (idempotent: skip the
        download when the file already exists and is non-empty), then upsert its
        AuctionDocument row.

        Most BOE attachments are PDFs. Some are IMAGES (scanned JPG/PNG served
        with Content-Disposition: attachment). For those the response body we
        already hold IS the document — we persist those bytes directly and
        register the row with kind='image'. We must NOT re-navigate the browser
        to those image URLs: BOE serves them as a download, so page.goto raises
        "Download is starting" and the doc would be lost (this previously
        dropped ~660 image docs/day). The on-disk filename keeps the `.pdf`
        suffix the storage contract / serve route require (the safe_filename
        helper forces it); the true media type travels in mimeType, and
        officialUrl is always preserved so the UI can link out to the BOE
        original regardless of how the serve route labels the bytes.
        Returns the row dict on success, None when the doc is genuinely
        unsupported (non-PDF, non-image).
        """
        id_doc = d['id_doc']
        title = d['title']
        url = d['official_url']
        doc_type = infer_doc_type(title)
        filename = doc_storage.safe_filename(doc_storage.safe_key(id_doc))
        disk = doc_storage.doc_disk_path_for(boe_id, filename)
        rel = doc_storage.rel_path_for(boe_id, filename)
        kind = 'download'
        mime = 'application/pdf'
        try:
            doc_storage.ensure_doc_dir(boe_id)
            # Idempotent: reuse an existing non-empty file (backfill-safe). A
            # multilot doc re-fetched per lot (-L1/-L2/...) is a DIFFERENT boe_id
            # each time, so this guards only same-id re-scrapes; it reuses the
            # file without re-downloading and stays quiet (no per-lot log spam).
            size = None
            already_on_disk = False
            if os.path.exists(disk) and os.path.getsize(disk) > 0:
                size = os.path.getsize(disk)
                already_on_disk = True
                # We can't re-sniff the media type without the bytes; infer it
                # from the on-disk magic so a re-scrape keeps kind/mime correct
                # for image docs as well as PDFs.
                try:
                    with open(disk, 'rb') as fh:
                        head = fh.read(8)
                    if head[:3] == b'\xff\xd8\xff':
                        kind, mime = 'image', 'image/jpeg'
                    elif head[:8] == b'\x89PNG\r\n\x1a\n':
                        kind, mime = 'image', 'image/png'
                except Exception:
                    pass
            else:
                resp = page.context.request.get(url, timeout=45000)
                ctype = (resp.headers or {}).get('content-type', '')
                ctype_l = ctype.lower()
                body = resp.body()
                if 'application/pdf' in ctype_l and body[:5] == b'%PDF-':
                    with open(disk, 'wb') as fh:
                        fh.write(body)
                    size = len(body)
                elif body and (
                    ctype_l.startswith('image/')
                    or body[:3] == b'\xff\xd8\xff'              # JPEG magic
                    or body[:8] == b'\x89PNG\r\n\x1a\n'         # PNG magic
                ):
                    # Image attachment: the bytes in hand ARE the document.
                    # Persist directly (no re-navigate). Keep the .pdf on-disk
                    # filename for the serve-route/storage contract; record the
                    # real media type in mimeType.
                    is_png = ('png' in ctype_l) or body[:8] == b'\x89PNG\r\n\x1a\n'
                    with open(disk, 'wb') as fh:
                        fh.write(body)
                    size = len(body)
                    kind = 'image'
                    mime = 'image/png' if is_png else 'image/jpeg'
                    self.log_info(
                        f"doc {id_doc} for {boe_id} stored as image "
                        f"({mime}, {size} bytes)"
                    )
                else:
                    # Genuinely unsupported (non-PDF, non-image). Skip quietly —
                    # do NOT re-navigate (it would trigger a download and raise).
                    self.log_info(
                        f"doc {id_doc} for {boe_id} skipped: unsupported "
                        f"ctype={ctype!r}"
                    )
                    return None
            row = {
                'docType': doc_type,
                'title': title,
                'officialUrl': url,
                'idDoc': id_doc,
                'storedPath': rel,
                'kind': kind,
                'mimeType': mime,
                'sizeBytes': size,
            }
            self.db_adapter.upsert_document(boe_id, row)
            if not already_on_disk:
                # On a fresh download, log once. Image docs already logged their
                # own "stored as image" INFO above; PDFs log the mirror line here.
                if kind != 'image':
                    self.log_info(f"doc {id_doc} ({doc_type}) mirrored for {boe_id} ({size} bytes)")
                # politeness between doc GETs (govt portal) — only after a real GET
                random_delay(0.6, 1.4)
            return row
        except Exception as e:
            self.log_warning(f"doc download/register failed for {boe_id} idDoc={id_doc}: {e}")
            return None

    def _extract_municipality(self, text: str) -> Optional[str]:
        """
        Best-effort PROPERTY town from a listing blob. Honest-None when unknown.

        ⚠️ BUG 2 FIX (Ghost, 2026-08-03). This used to be an 18-big-city
        substring scan over the WHOLE page text:

            for m in ['Madrid','Barcelona',...,'Sevilla',...]:
                if m.lower() in text.lower(): return m

        which matched the COURT's city (and BOE's own site chrome) anywhere on
        the page. That is why an Almería property under a Sevilla court was
        stamped `municipality = "Sevilla"` — 59.8% of populated municipalities
        were wrong — and why no town outside those 18 could EVER be set, which
        structurally produced the 54.8% `sin-municipio`.

        The replacement resolves the town against the full INE gazetteer with
        the street-context / ambiguity / sub-token guards, and returns None
        rather than a big city it happened to find in the chrome. A `None` here
        is corrected downstream by the authoritative `bienLocalidad`; a wrong
        big city was not.
        """
        if not text:
            return None
        town, _prov, _method = derive_municipality_from_address(text)
        return town
    
    # An auction end date may ONLY come from a field that is LABELLED as the
    # auction's conclusion. Anything else is a guess, and a guessed date is
    # worse than no date at all: `endsAt` drives the expiry sweep
    # (scheduler.monitor_status_changes), which flips a row to
    # CONCLUIDA_PORTAL, and it is copied verbatim into `soldDate` by the freeze.
    # A fabricated past date therefore *concludes an auction that never ran*.
    #
    # DEFECT REMOVED (DATEFALLBACK, 2026-08-04): this function used to carry a
    # bare, unlabelled fallback `(\d{1,2})[/-](\d{1,2})[/-](\d{4})` that matched
    # the FIRST date-shaped string anywhere in the search-result card. On rows
    # where BOE publishes no auction dates yet (PROXIMA_APERTURA), that harvested
    # whatever date the bien prose happened to contain:
    #   "Fecha de matriculación: 07-07-2011"          -> endsAt 2011-07-07
    #   "Escritura pública otorgada con fecha 29/09/2004" -> endsAt 2004-09-29
    # (reproduced verbatim against the four rows repaired on 2026-08-04; see
    # ghost_zombie_endsat_snapshot_20260804).
    #
    # "Fin"/"Hasta"/"Finaliza" are dropped too: they are not BOE auction-date
    # labels, they are ordinary Spanish words that occur throughout bien prose
    # and registry text ("finaliza la calle", "hasta el lindero"). Only the
    # explicit conclusion labels BOE actually renders are accepted.
    #
    # The authoritative reader is `_extract_detail_date`, which is cell-anchored,
    # prefers the tz-aware ISO form and keeps HH:MM:SS. This card-level reader is
    # only a pre-detail hint; when it cannot find a labelled conclusion date the
    # honest answer is None and the detail pass fills it in.
    _END_DATE_LABEL_RE = re.compile(
        r'Fecha\s+de\s+(?:conclusi[oó]n|fin(?:alizaci[oó]n)?)\s*[:\t\n]?\s*'
        r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})'
        r'(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?',
        re.IGNORECASE,
    )

    def _extract_end_date(self, text: str) -> Optional[datetime]:
        """
        Extract the auction end date from a search-result card.

        ONLY a field explicitly labelled as the auction's conclusion date is
        accepted ("Fecha de conclusión / de fin / de finalización"). Returns None
        when no such label is present — never the nearest date-shaped string.
        """
        if not text:
            return None
        match = self._END_DATE_LABEL_RE.search(text)
        if not match:
            return None
        day, month, year, hh, mm, ss = match.groups()
        try:
            return datetime(
                int(year), int(month), int(day),
                int(hh or 0), int(mm or 0), int(ss or 0),
            )
        except ValueError:
            # An impossible calendar date is a parse failure, not a date.
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
        Those classes override _navigate_and_extract to navigate with their OWN
        page and then call _extract_detail_from_page (below) for the shared
        extraction.

        ver=3 is the FULL detail view: it renders the per-lote tab bar (the
        idLote=N links the #14 split path enumerates) and every financial
        label/value pair. Without it BOE serves a summary view with NO lote links
        (verified live 2026-06-02), so the split detection would see zero lotes.
        """
        detail_url = self._detail_url(boe_id)
        return self._navigate_and_extract(boe_id, detail_url)

    def _navigate_and_extract(self, boe_id: str, detail_url: str) -> Dict[str, Optional[str]]:
        """
        Navigate `detail_url` on the SHARED browser_manager page and run the
        shared extraction. Split out from _fetch_detail_info so the multi-lot
        split path (#14) can fetch an arbitrary lote URL (idSub + idLote=N)
        through the very same navigation + extraction, with no URL hardcoding.
        Own-browser subclasses (BOEParallelScraper) override this, not the two
        callers, so the split path inherits the correct browser automatically.
        """
        page = None
        try:
            page = self.browser_manager.get_page(stealth=True)
            random_delay(1.0, 2.0)
            # 'domcontentloaded', NOT 'networkidle': live-auction detail pages
            # keep long-poll/countdown connections open, so networkidle often
            # never fires and goto hangs past its timeout under load (the cause
            # of batch re-scrapes stalling). All financial label/value pairs are
            # server-rendered in the initial HTML, so domcontentloaded is enough.
            page.goto(detail_url, wait_until='domcontentloaded', timeout=30000)
            random_delay(1.0, 2.0)
            # Multi-lot auctions open with the "Lotes" tab active and load the
            # "Informacion general" panel (which carries Fecha de inicio /
            # Fecha de conclusion -> endsAt, and Estado) via AJAX only when that
            # tab is clicked. Without this, body inner_text never contains the
            # conclusion date for split auctions -> endsAt stays NULL ("sin
            # fecha"). Single-lot pages already default to this panel, so the
            # click is a harmless no-op there. (Verified live 2026-06-02 on
            # SUB-RC-2026-0026I20250049: pre-click body lacked the date,
            # post-click body had "Fecha de conclusion 15-06-2026 ...".)
            # ORDER MATTERS — clicking the "Información general" tab SWAPS the
            # active panel and DESTROYS both (a) the idLote=N tab-bar links on an
            # umbrella page and (b) the financial/bienes block on an individual
            # lote page (verified live 2026-06-02 on SUB-RC-2026-3100200100959:
            # pre-click lote links [1,2] + lote-L1 prices 906,32/763,80/76,38;
            # post-click links=[] and all prices None). So:
            #   1. enumerate lotes on the freshly-loaded DOM,
            #   2. extract the full detail (prices/bienes/warning) on that SAME
            #      pre-click DOM,
            #   3. ALWAYS activate the ver=1 "Información general" tab and
            #      re-extract — merging the recovered dates AND financial fields
            #      WITHOUT clobbering the prices/bienes already captured.
            lote_numbers = self._enumerate_lote_numbers(page)
            info = self._extract_detail_from_page(page, boe_id, detail_url)
            # G2/G3 — documents + snapshot capture on the PRE-CLICK ver=3 DOM,
            # BEFORE the general-info tab activation (which swaps the panel and
            # would lose both the ver=3 verDocumento links and a clean snapshot)
            # and BEFORE the ver=5 pujas navigation (which destroys ver=3).
            self._capture_documents_and_snapshot(page, boe_id, detail_url, info)
            # UNCONDITIONAL ver=1 "Información general" activation. The financial
            # table (Valor subasta / Tasación / Puja mínima / Importe del depósito
            # / Cantidad reclamada) lives ONLY on the ver=1 panel, NOT on the
            # pre-click ver=3 Bienes DOM. The old gate fired this ONLY when a date
            # was missing — but PROXIMA_APERTURA / judicial pages carry their
            # dates on ver=3, so ver=1 was never opened and `valor_subasta` was
            # never read -> judicial Tasación=0 had no fallback -> appraisal NULL
            # (the 109 "sin tasación" rows). ver=3 capture (lote enum + split +
            # docs/snapshot) has already run above on the pre-click DOM, so
            # activating now cannot regress it. Activation is best-effort/swallowed
            # (single-lot pages where the panel is already active are a no-op).
            self._merge_general_info_fields(page, boe_id, detail_url, info)
            info['lote_numbers'] = lote_numbers
            # #16 pujas LAST: navigates the same page to ver=5, after the ver=3
            # DOM has been read + lotes enumerated + docs/snapshot captured.
            self._attach_pujas(page, boe_id, detail_url, info)
            return info
        except Exception as e:
            self.log_warning(f"Failed to fetch detail info for {boe_id}: {e}")
            return self._empty_detail_info(boe_id)
        finally:
            if page:
                self.browser_manager.close_page(page)

    def _activate_general_info_tab(self, page: Any) -> None:
        """Click the "Informacion general" tab so its AJAX-loaded panel (which
        holds Fecha de inicio / Fecha de conclusion / Estado) is present in the
        DOM before extraction. Multi-lot auctions open on the "Lotes" tab and
        never load this panel otherwise, leaving endsAt NULL. Best-effort: any
        failure (single-lot page where it is already active, selector absent) is
        swallowed so extraction proceeds on whatever is rendered."""
        try:
            tab = page.locator('text=Información general').first
            if tab.count() > 0:
                tab.click(timeout=5000)
                random_delay(1.2, 2.2)
        except Exception as e:
            self.log_warning(f"general-info tab activation skipped: {e}")

    # Financial keys recovered from the ver=1 "Información general" panel. These
    # live ONLY on ver=1, not the pre-click ver=3 Bienes DOM.
    _GENERAL_INFO_FINANCIAL_KEYS = (
        'appraisal_value', 'valor_subasta', 'minimum_bid',
        'deposit_amount', 'claimed_amount',
    )
    # Date/status keys recovered from the same panel (the original SIN-FECHA fix).
    _GENERAL_INFO_DATE_KEYS = ('start_at', 'ends_at', 'detail_status')

    def _merge_general_info_fields(self, page: Any, boe_id: str,
                                   detail_url: str,
                                   info: Dict[str, Optional[str]]) -> None:
        """Activate the ver=1 "Información general" panel, re-extract, and merge
        the date AND financial fields into `info` WITHOUT clobbering real ver=3
        values already captured on the pre-click DOM. Shared by the shared-browser
        (_navigate_and_extract) and own-browser (BOEParallelScraper override)
        paths so both have identical merge semantics.

        Merge guards (fill-null-only, never regress a real pre-click value):
        - dates/status: lift from `dated` only when `info`'s value is None.
        - financials:   lift only when `info`'s value is falsy (None OR 0) AND
          `dated`'s value is a real non-zero figure. The (None, 0) guard is what
          recovers the judicial Tasación=0 case: ver=3 reads Tasación=0, ver=1
          carries the real "Valor subasta", and we lift it. The "info must be
          empty/zero" guard prevents the tab swap (which can blank ver=3
          financials in `dated`) from clobbering a single-lot page whose real
          prices were already on the pre-click DOM.

        appraisal_value (Tasación) and valor_subasta (Valor subasta) are kept as
        DISTINCT keys here and flow to DISTINCT columns downstream
        (appraisalValue vs valorSubasta) — the old downstream collapse that
        folded valor_subasta into appraisalValue is REMOVED (Dennis wants three
        card numbers). Honest-NULL is preserved end to end: if neither ver=3 nor
        ver=1 carries a price, every key stays None (never coerced)."""
        self._activate_general_info_tab(page)
        dated = self._extract_detail_from_page(page, boe_id, detail_url)
        for k in self._GENERAL_INFO_DATE_KEYS:
            if info.get(k) is None and dated.get(k) is not None:
                info[k] = dated[k]
        for k in self._GENERAL_INFO_FINANCIAL_KEYS:
            if info.get(k) in (None, 0) and dated.get(k) not in (None, 0):
                info[k] = dated[k]

    def _empty_detail_info(self, boe_id: str) -> Dict[str, Optional[str]]:
        return {
            'general_info': None,
            'autoridad_gestora': None,
            'bienes_info': None,
            'address': None,
            'pujas_info': None,
            'warning': None,
            'detail_url': f"{self.DETAIL_URL}?idSub={boe_id}",
            'cadastral_ref': None,
            'cadastral_data': None,
            'lote_numbers': [],
            'possession_status': None,
            'occupancy': None,
            'puja_status': None,
            'current_bid_amount': None,
            # G1 discrete bien fields
            'postal_code': None,
            'idufir': None,
            'registry_inscription': None,
            'legal_title': None,
            'bien_localidad': None,
            'bien_provincia': None,
            'vivienda_habitual': None,
            'bien_type': None,
            'property_type': None,
            'surface_m2': None,
            # Property-portal attributes (Phase 1) — honest-NULL by default.
            'bedrooms': None,
            'bathrooms': None,
            'has_terrace': None,
            'has_garden': None,
            'has_garage': None,
            'has_storage_room': None,
            'floor_level': None,
            # G2/G3 documents (filled by _capture_documents_and_snapshot)
            'documents': [],
            # SUSPENDIDA — resume date + motive (honest-NULL by default)
            'resume_at': None,
            'suspension_motive': None,
        }

    def _merge_bien_fields(self, auction_data: Dict[str, Any],
                           detail_info: Dict[str, Any]) -> None:
        """
        G1 — copy the discrete "Datos del bien subastado" values from a detail
        extraction into the auction record, and CORRECT the category from the
        authoritative BOE bien heading when the title-based guess disagrees.

        Each field is written only when the detail page yielded a value so a
        re-scrape that transiently misses a label never blanks a good column
        (the adapter applies the same "only-when-present" discipline). Shared by
        the main scrape flow and _build_lote_record so the two paths stay
        identical. NEVER fabricates — None values are skipped.
        """
        passthrough = [
            ('postal_code', 'postal_code'),
            ('idufir', 'idufir'),
            ('registry_inscription', 'registry_inscription'),
            ('legal_title', 'legal_title'),
            ('bien_localidad', 'bien_localidad'),
            ('bien_provincia', 'bien_provincia'),
            ('vivienda_habitual', 'vivienda_habitual'),
            ('property_type', 'property_type'),
            ('surface_m2', 'surface_m2'),
            ('bedrooms', 'bedrooms'),
            ('bathrooms', 'bathrooms'),
            ('has_terrace', 'has_terrace'),
            ('has_garden', 'has_garden'),
            ('has_garage', 'has_garage'),
            ('has_storage_room', 'has_storage_room'),
            ('floor_level', 'floor_level'),
        ]
        for src, dst in passthrough:
            v = detail_info.get(src)
            if v is not None:
                auction_data[dst] = v

        # Category override: the bien heading ("Inmueble (Trastero)") is the
        # authoritative property type. When it maps to a known category and the
        # title-based guess differs (e.g. a trastero whose listing title is
        # generic, which categorize_auction sends to "Otros inmuebles"), prefer
        # the heading. Unknown heading types leave the title guess untouched —
        # we never downgrade a good category to "Otros" on an unfamiliar word.
        cat = category_from_bien_type(detail_info.get('bien_type'))
        if cat and auction_data.get('category') != cat:
            self.log_info(
                f"Category corrected from bien heading: "
                f"{auction_data.get('category')!r} -> {cat!r} "
                f"(bien_type={detail_info.get('bien_type')!r})"
            )
            auction_data['category'] = cat

        # Vehicle make/model/year (wave E2). Runs AFTER the category override so
        # we test the authoritative category. Source text = the bien block
        # (bienes_info / lot_description) + the listing title. Honest-NULL:
        # only set a field when the parser actually found it; never blanks a
        # previously-good value, never writes on a non-vehicle row.
        if is_vehicle_category(auction_data.get('category')):
            desc = (detail_info.get('bienes_info')
                    or auction_data.get('lot_description')
                    or auction_data.get('property_description'))
            vf = parse_vehicle_fields(auction_data.get('title'), desc)
            if vf['make'] is not None:
                auction_data['vehicle_make'] = vf['make']
            if vf['model'] is not None:
                auction_data['vehicle_model'] = vf['model']
            if vf['year'] is not None:
                auction_data['vehicle_year'] = vf['year']

    def _enumerate_lote_numbers(self, page: Any) -> List[int]:
        """
        Return the sorted distinct lote numbers for the auction on `page` by
        reading every `?...idLote=N...` link in the DOM (the per-lote tab bar).
        A single-lot auction has no such links (or only idLote= empty) -> [].
        Used by the #14 split path to know how many independent lote rows to mint.
        """
        try:
            hrefs = page.eval_on_selector_all(
                "a[href*='idLote=']",
                "els => els.map(e => e.getAttribute('href'))",
            )
        except Exception:
            return []
        nums = set()
        for h in hrefs or []:
            m = re.search(r'idLote=(\d+)', h or '')
            if m:
                nums.add(int(m.group(1)))
        return sorted(nums)

    def _upsert_split_lotes(self, lote_rows: List[Dict[str, Any]]) -> int:
        """Validate + upsert each split-lote row as an independent auction.
        Returns the count actually saved. Shared by both scrape loops."""
        saved = 0
        for rec in lote_rows:
            try:
                if self.validate_auction_data(rec):
                    self.db_adapter.upsert_auction(rec)
                    self.results.append(rec)
                    saved += 1
                else:
                    self.increment_stat('items_skipped')
            except Exception as e:
                self.log_error(f"Failed to upsert lote {rec.get('boe_id')}: {e}")
                self.increment_stat('errors')
        return saved

    def _maybe_split_into_lotes(self, source_id_sub: str,
                                umbrella: Dict[str, Any],
                                detail_info: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        """
        #14 (count-gated, 2026-06-02): If `source_id_sub` exposes 2+ distinct
        lotes (per the idLote tab bar), fetch EACH lote page and return a list of
        independent auction_data dicts (one per lote, composite boeId). Returns
        None when the auction has < 2 enumerable lotes — the caller then keeps
        the single umbrella row, unchanged behaviour.

        GATE = LOTE COUNT >= 2 (Dennis's rule). The `is_split_auction` trigger
        string ("se subastan de forma separada/independiente") is NO LONGER the
        decider — it is now a non-gating signal only (logged). The reason: many
        multi-lot auctions sell each lote as a separate property without ever
        carrying that exact phrase, and Dennis wants ANY 2+-lote auction split
        into one row per lote. A 1-lote (or 0 enumerable) auction is the
        overwhelming-majority no-op path and MUST stay a single umbrella row.
        """
        lote_numbers = detail_info.get('lote_numbers') or []

        # Non-gating signal: record whether BOE also declared the split in words.
        trigger_text = ' '.join(filter(None, [
            detail_info.get('general_info'),
            detail_info.get('bienes_info'),
            detail_info.get('warning'),
        ]))
        declared = is_split_auction(trigger_text)

        # THE GATE: lote count >= 2. A single (or zero) enumerable lote keeps the
        # umbrella row untouched — this is the no-op majority path.
        if len(lote_numbers) < 2:
            if declared:
                # BOE declared a split but exposes < 2 idLote links — do NOT
                # split blindly (we'd produce zero rows and drop the auction).
                self.log_warning(
                    f"{source_id_sub}: split DECLARED but only {len(lote_numbers)} "
                    f"idLote link(s) found; keeping single umbrella row"
                )
            return None

        if declared:
            self.log_info(f"{source_id_sub}: lote-count split (also carries declaration string)")
        else:
            self.log_info(f"{source_id_sub}: lote-count split (no declaration string — count gate)")

        if len(lote_numbers) > MAX_LOTES_PER_AUCTION:
            self.log_warning(
                f"{source_id_sub}: {len(lote_numbers)} lotes exceeds cap "
                f"{MAX_LOTES_PER_AUCTION}; capping enumeration"
            )
            lote_numbers = lote_numbers[:MAX_LOTES_PER_AUCTION]

        self.log_info(
            f"{source_id_sub}: SPLIT auction — {len(lote_numbers)} independent lotes"
        )

        rows: List[Dict[str, Any]] = []
        for n in lote_numbers:
            try:
                rec = self._build_lote_record(source_id_sub, n, umbrella)
                if rec is not None:
                    rows.append(rec)
            except Exception as e:
                self.log_error(f"{source_id_sub} lote {n}: failed to build record: {e}")
        return rows or None

    def _build_lote_record(self, source_id_sub: str, lote_number: int,
                           umbrella: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Fetch one lote's detail page (idSub + idLote=N) and build a COMPLETE,
        independent auction_data dict — own pricing/property/dates/status — keyed
        boeId = '<idSub>-L<N>'. Reuses the exact same per-page extractors as any
        single auction (the lote page layout is identical to a single-auction
        page), so no new parsing logic is needed.
        """
        lote_url = f"{self.DETAIL_URL}?idSub={source_id_sub}&idLote={lote_number}&ver=3"
        info = self._navigate_and_extract(
            make_lote_boe_id(source_id_sub, lote_number), lote_url
        )

        composite_id = make_lote_boe_id(source_id_sub, lote_number)

        # auctionType is a property of the BOE PROCEDURE — shared by all lotes —
        # so carry the umbrella's type (derived from the shared idSub prefix).
        auction_type = umbrella.get('auction_type') or auction_type_from_boe_id(source_id_sub)

        # appraisalValue = Tasación ONLY. Valor subasta is stored SEPARATELY
        # (its own column) now — the old collapse (use valor_subasta as the
        # appraisal when Tasación was 0/absent, verified on SUB-JA-2024-235417)
        # is REMOVED so the card can show Tasación + Valor subasta as two
        # distinct numbers. Honest-NULL each.
        appraisal = info.get('appraisal_value')
        valor_subasta = info.get('valor_subasta')

        minimum_bid = info.get('minimum_bid')

        # "Varios Lotes" fallback (NEVER fabricate a price). When THIS lote's own
        # page yields no usable price at all — Tasación 0/absent AND Valor subasta
        # 0/absent AND Puja mínima absent — surface "Varios Lotes" honestly with a
        # NULL price rather than coercing to 0 or inventing a number. Zero-
        # migration path: leave appraisal_value/minimum_bid = None and inject the
        # literal token into the title (front-end reads the title). Per-lote and
        # last-resort only: a lote WITH ANY real price keeps its real price.
        # NB: Valor subasta is now stored separately but STILL counts as a real
        # price here — a row with valor_subasta but no Tasación must NOT regress
        # to "Varios Lotes".
        no_fetchable_price = (not appraisal) and (not valor_subasta) and (minimum_bid in (None, 0))

        # Province/municipality come from the LOTE's own page text (lotes can
        # differ — that's the whole point of independent listing). Fall back to
        # the umbrella's province when the lote page yields nothing.
        lote_text = ' '.join(filter(None, [
            info.get('general_info'), info.get('bienes_info'),
            info.get('autoridad_gestora'),
        ]))
        province = province_from_text(lote_text) or umbrella.get('province') or 'Unknown'

        title = info.get('identificador') or f"{source_id_sub} - Lote {lote_number}"
        if no_fetchable_price and 'varios lotes' not in title.lower():
            # Honest no-price marker — front-end shows "Varios Lotes" / no estimate.
            title = f"{title} - Varios Lotes"

        # Property street address from THIS lote's own page, so split lote rows
        # geocode to their own pin. _extract_detail_from_page already resolved it
        # (Bienes section -> body fallback); fall back to the bienes blob for
        # safety. Null-safe.
        lote_address = info.get('address') or extract_address(info.get('bienes_info'))

        category = umbrella.get('category')
        # Re-derive category from the lote's own description when possible.
        if lote_text:
            category = get_category_type('', lote_text) or category
        if not category:
            category = umbrella.get('category') or 'Otros'

        rec: Dict[str, Any] = {
            'boe_id': composite_id,
            'title': title,
            'category': category,
            'province': province,
            'municipality': umbrella.get('municipality'),
            'status': info.get('detail_status') or umbrella.get('status') or 'CELEBRANDOSE',
            'auction_type': auction_type,
            'source': 'BOE',
            'appraisal_value': appraisal,
            'valor_subasta': valor_subasta,
            'minimum_bid': minimum_bid,
            'address': lote_address,
            'deposit_amount': info.get('deposit_amount'),
            'claimed_amount': info.get('claimed_amount'),
            'boe_link': lote_url,
            'boe_announcement': info.get('general_info'),
            'lot_description': info.get('bienes_info'),
            'property_description': info.get('pujas_info'),
            'charges_detail': info.get('warning'),
            'court_name': info.get('autoridad_gestora') or umbrella.get('court_name'),
            'cadastral_ref': info.get('cadastral_ref'),
            'cadastral_data': info.get('cadastral_data'),
            'published_at': umbrella.get('published_at') or (datetime.now() - timedelta(days=5)),
            'ends_at': info.get('ends_at') or umbrella.get('ends_at'),
            'opens_at': info.get('start_at'),
            # #16/#17 — each lote carries its OWN puja state + occupancy
            # (info came from this lote's own ver=3 + ver=5 fetch in
            # _navigate_and_extract), so split rows get accurate per-lote values.
            'puja_status': info.get('puja_status'),
            'current_bid_amount': info.get('current_bid_amount'),
            'occupancy': info.get('occupancy'),
            'possession_status': info.get('possession_status'),
            # Provenance (additive columns; written via adapter schema guard).
            'source_id_sub': source_id_sub,
            'lote_number': lote_number,
            # auctionId carries the umbrella idSub so the Bienes/Catastro path
            # can still reach the source procedure.
            'auction_id': source_id_sub,
        }
        # G1 — discrete bien fields + authoritative category override for this
        # lote (runs after the lote_text-based category derivation above, so the
        # BOE bien heading has the final say). Documents + snapshot for this lote
        # were already captured inside _navigate_and_extract (keyed by the
        # composite boe_id), so nothing doc-related is needed here.
        self._merge_bien_fields(rec, info)

        # Promote the PROPERTY province + real town for this lote, same authority
        # chain as the single-auction path (bienProvincia -> postcode -> INE town
        # map -> else keep the lote/umbrella province + flag). The lote page's own
        # bien block now drives province/municipality instead of the umbrella's
        # (court) province or a big-city text guess.
        apply_property_geo(rec, self.log_info)
        return rec

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
            # The bien block sits under the <h3>"Datos del bien subastado"
            # heading (NOT "Bienes" — _extract_section_text('Bienes') returns
            # None on real SUB- pages, verified live 2026-06-03 on the Palma
            # trastero). Anchor on the real heading first; keep 'Bienes' as a
            # fallback for any legacy layout. This is the root cause of the
            # trastero field gap: with bienes=None, every discrete field +
            # address + cadastral ref was lost.
            bienes = (
                self._extract_section_text(page, 'Datos del bien subastado') or
                self._extract_section_text(page, 'Bienes')
            )
            pujas = self._extract_section_text(page, 'Pujas')
            
            warning = (
                self._extract_section_text(page, 'Advertencias') or
                self._extract_section_text(page, 'Advertencia') or
                self._extract_warning_banner(page)
            )
            # Belt-and-braces: reject any page-dump leak (BOE nav + JS clock +
            # login chrome) before it lands in chargesDetail. Honest-NULL on
            # reject. This is the second line of defence even if a JS extractor
            # regresses to capturing an outer wrapper's textContent.
            warning = self._sanitize_extracted_text(warning)
            # Same guard for the bien block (-> lot_description / lotDescription),
            # which shares the leak pattern (~468 rows). enforce_length=False:
            # a legit multi-property bien block can run long AND is consumed for
            # cadastral/address extraction below — the page-dump token check
            # alone catches the nav/JS leak without nuking long real blocks.
            # Strip the logged-out login-footer sentence FIRST — it is legit
            # page content inside the bien section on login-gated rows, and its
            # "Iniciar sesión" text would false-positive the page-dump token
            # check below and reject the entire bien blob (3f2ea9c regression:
            # ~AEAT batches lost address/lotDescription/cadastral).
            bienes = self._strip_login_footer(bienes)
            bienes = self._sanitize_extracted_text(bienes, enforce_length=False)

            cadastral_ref, cadastral_data = extract_cadastral_refs(bienes)

            # Property street address. On an umbrella page the bien block sits
            # under a "Bienes"/"Datos del bien subastado" heading; on an
            # individual lote page it sits under the "Lote N" heading with NO
            # "Bienes" heading, so _extract_section_text('Bienes') returns None
            # and extract_address(bienes) finds nothing. The "Dirección" label is
            # always in the page body either way, so anchor address extraction on
            # the Bienes section first, then fall back to the full body_text
            # (verified live 2026-06-02: lote SUB-RC-2026-3100200100959-L1 ->
            # "CALLE ALTO TEJEDORES Nº9, Peralta"). body_text is read just below.

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

            # Address: prefer the Bienes-section anchor, fall back to whole body
            # (lote pages have no Bienes heading — see note above).
            address = extract_address(bienes) or extract_address(
                body_text, prose_fallback=False
            )

            # G1 — discrete "Datos del bien subastado" fields. Parse from the
            # bien block (preferred) and fall back to the whole body for lote
            # pages whose bien block has no "Datos del bien subastado" heading.
            # parse_bien_fields omits absent labels so the adapter never blanks
            # a good value. bien_type from the heading is the AUTHORITATIVE
            # property type — used below to correct the title-based category.
            bien_fields = parse_bien_fields(bienes) or {}
            if not bien_fields:
                bien_fields = parse_bien_fields(body_text) or {}

            # SUSPENDIDA capture — resume date + motive from the BOE aviso block
            # (already in body_text). Honest-NULL on non-suspended / bare rows.
            resume_at, suspension_motive = self._extract_suspension_info(body_text)

            # Property attributes (bedrooms/bathrooms/terrace/garden/garage/
            # storage/floor) parsed from the SAME already-fetched prose — no new
            # fetch. Bien block preferred, then cadastral data, then whole body.
            # Honest-NULL: every key is None unless the prose states it.
            # dedupe_prose drops overlapping fields before parsing: cadastral_data
            # is extracted FROM bienes, and body_text is the whole page (which
            # CONTAINS bienes), so a naive concat counted every room mention 2-3×
            # (4 dormitorios -> stored 8). See dedupe_prose docstring.
            prop_attrs = parse_property_attributes(
                dedupe_prose(bienes, cadastral_data, body_text)
            )

            return {
                'general_info': general_info,
                'autoridad_gestora': autoridad,
                'bienes_info': bienes,
                'address': address,
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
                # #17 occupancy — parsed from this same ver=3 body (Situación
                # posesoria), no extra fetch. #16 pujas are added later in
                # _navigate_and_extract (ver=5 tab) so lote enumeration on the
                # ver=3 DOM can run first.
                'possession_status': self._extract_label_value(
                    body_text, ['Situación posesoria', 'Situacion posesoria']
                ),
                'occupancy': self._parse_occupancy(body_text),
                # G1 — discrete bien fields (Forge's new Auction columns). Only
                # keys actually found are present (parse_bien_fields omits
                # absent labels); the adapter writes each via its info_schema
                # guard so it is safe pre-migration. property_type carries the
                # raw BOE heading type; bien_type drives the category override
                # in the caller (parse_listing's title guess is the fallback).
                'postal_code': bien_fields.get('postal_code'),
                'idufir': bien_fields.get('idufir'),
                'registry_inscription': bien_fields.get('registry_inscription'),
                'legal_title': bien_fields.get('legal_title'),
                'bien_localidad': bien_fields.get('bien_localidad'),
                'bien_provincia': bien_fields.get('bien_provincia'),
                'vivienda_habitual': bien_fields.get('vivienda_habitual'),
                'bien_type': bien_fields.get('bien_type'),
                'property_type': bien_fields.get('bien_type'),
                # G1 — building surface in m² parsed from the bien/registry prose
                # (bien block preferred, whole body as fallback). Honest-NULL when
                # no parseable surface is present; land cabida is skipped.
                'surface_m2': parse_surface_m2(bienes) or parse_surface_m2(body_text),
                # Property-portal attributes (Phase 1). Honest-NULL by default.
                'bedrooms': prop_attrs['bedrooms'],
                'bathrooms': prop_attrs['bathrooms'],
                'has_terrace': prop_attrs['has_terrace'],
                'has_garden': prop_attrs['has_garden'],
                'has_garage': prop_attrs['has_garage'],
                'has_storage_room': prop_attrs['has_storage_room'],
                'floor_level': prop_attrs['floor_level'],
                # SUSPENDIDA — "Fecha de reanudación prevista" (reuses resumeAt)
                # + the BOE suspension motive (new suspensionMotive column).
                'resume_at': resume_at,
                'suspension_motive': suspension_motive,
            }
        except Exception as e:
            self.log_warning(f"Failed to extract detail info for {boe_id}: {e}")
            return self._empty_detail_info(boe_id)

    def _extract_suspension_info(
        self, body_text: str
    ) -> "tuple[Optional[datetime], Optional[str]]":
        """
        SUSPENDIDA capture — parse the official BOE suspension block that renders
        server-side in `<div class="caja gris aviso">` (above #tabs, already in
        body_text — no JS/tab needed). Returns (resume_at, suspension_motive).

        resume_at  — "Fecha de reanudación prevista: DD-MM-YYYY HH:MM:SS CET
                      (ISO: 2026-06-08T12:00:00+02:00)". PREFER the unambiguous
                      ISO form; fall back to DD-MM-YYYY HH:MM:SS. Honest-NULL
                      when neither is present.

                      RETURNS A NAIVE datetime carrying MADRID WALL TIME — the
                      same convention every other date on this row uses.
                      `Auction.resumeAt` (like `endsAt` / `opensAt`) is
                      `timestamp without time zone`, and `_extract_detail_date`
                      stores wall time for both of its branches: the dd-mm form
                      literally, and the ISO form via a strptime whose pattern
                      stops at seconds and DISCARDS the offset.

                      TZ DEFECT FIXED (2026-08-04, found while tracing the
                      DATEFALLBACK second writer): this branch used to return
                      `datetime.fromisoformat(...)` unchanged, which is
                      tz-AWARE. Writing an aware value into a naive column
                      normalises it to UTC, so BOE's "12:00:00 CET" landed as
                      10:00:00 — every resume time stored and displayed TWO
                      HOURS EARLY. 160 of 164 stored values sat at 10:00:00.
                      The dd-mm fallback branch below was always correct, so the
                      two branches of this one function disagreed by the offset.
        motive     — the parenthetical immediately after "temporalmente
                      suspendida (...)" — the text INSIDE the parens, NOT the
                      boilerplate. Honest-NULL for a bare suspension (no parens).
                      Capped defensively at 300 chars.

        Either value is None unless BOE actually states it — NEVER a default.
        """
        if not body_text:
            return None, None

        resume_at: Optional[datetime] = None
        # Prefer the ISO form — unambiguous and timezone-correct.
        m = re.search(
            r"Fecha\s+de\s+reanudaci[oó]n\s+prevista[:\s]*"
            r"[\d:\sCETcet\-]*?\(ISO:\s*([0-9T:\+\-]+)\)",
            body_text, re.IGNORECASE)
        if m:
            try:
                parsed = datetime.fromisoformat(m.group(1).strip())
                # Keep the wall time BOE printed, drop the offset. `parsed` is
                # aware whenever the ISO string carries one; `.replace(tzinfo=
                # None)` keeps 12:00 as 12:00 instead of normalising it to
                # 10:00 UTC on write. No-op when the string had no offset.
                resume_at = parsed.replace(tzinfo=None)
            except (ValueError, TypeError):
                resume_at = None
        if resume_at is None:
            # Fallback: parse the DD-MM-YYYY HH:MM:SS literal (CET dropped).
            m = re.search(
                r"Fecha\s+de\s+reanudaci[oó]n\s+prevista[:\s]*"
                r"(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})",
                body_text, re.IGNORECASE)
            if m:
                try:
                    d, mo, y, hh, mm, ss = (int(g) for g in m.groups())
                    resume_at = datetime(y, mo, d, hh, mm, ss)
                except (ValueError, TypeError):
                    resume_at = None

        motive: Optional[str] = None
        m = re.search(
            r"temporalmente\s+suspendida\s*\(([^)]+)\)",
            body_text, re.IGNORECASE)
        if m:
            motive = m.group(1).strip()[:300] or None

        return resume_at, motive

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
                    // Skip the logged-out "Información complementaria" login
                    // footer that BOE renders INSIDE the bien section on
                    // login-gated rows (esp. AEAT): a `.caja.gris.info` box
                    // and/or an <h5> label + "... debe Iniciar sesión en el
                    // Portal de Subastas." sentence. Left in, its "Iniciar
                    // sesión" text false-positives the page-dump sanitizer
                    // and nukes the whole bien blob (address/lot/cadastral).
                    const cls = el.classList;
                    if (cls && cls.contains('caja') && cls.contains('gris') && cls.contains('info')) {
                      el = el.nextElementSibling;
                      continue;
                    }
                    if (el.tagName === 'H5' &&
                        /informaci[oó]n\\s+complementaria/i.test(el.textContent || '')) {
                      el = el.nextElementSibling;
                      continue;
                    }
                    // NOTE: when the footer is NESTED inside a section wrapper
                    // (live SUB-AT layout: h3 -> <div> -> table + h5 + .caja.
                    // gris.info) we deliberately DO NOT clone-and-strip here —
                    // a detached clone's textContent loses innerText's
                    // tab-separated table rendering that parse_bien_fields
                    // relies on. The nested footer text is stripped Python-side
                    // by _strip_login_footer before the sanitizer runs.
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

    # Page-chrome / script signatures that prove the extracted text is a raw
    # BOE-page dump (site nav + the `var hoy = new Date()` clock script + login
    # chrome) rather than the actual charges/cargas sentence. Matched
    # case-insensitively. See _sanitize_extracted_text below.
    _PAGE_DUMP_TOKENS = (
        'var hoy',
        'function reloj',
        'new date(',
        'iniciar sesi',      # "Iniciar sesión" login chrome
        'buscar ayuda',      # nav: "Inicio Buscar Ayuda"
        '<script',
        '<style',
        'document.querySelector',
        'getelementbyid',
    )
    # Real charges/warning text is a sentence or two. Anything past this is the
    # wrapper subtree being captured whole — reject it.
    _SANITIZE_MAX_LEN = 2000

    # The logged-out "Información complementaria" login footer that BOE renders
    # inside the bien block on login-gated rows. Its "Iniciar sesión" text
    # false-positives the 'iniciar sesi' page-dump token and used to nuke the
    # WHOLE bien blob (-> address/lotDescription/cadastral NULL on ~AEAT
    # batches). Stripped BEFORE _sanitize_extracted_text; the token stays in
    # _PAGE_DUMP_TOKENS as genuine page-dump protection.
    _LOGIN_FOOTER_RE = re.compile(
        r"(?:informaci[oó]n\s+complementaria(?:\s+del\s+bien)?\s*[:.]?\s*)?"
        r"para\s+consultar\s+la\s+informaci[oó]n\s+complementaria[^.]*?"
        r"iniciar\s+sesi[oó]n[^.]*?(?:\.|$)",
        re.IGNORECASE,
    )
    # A bare trailing "Información complementaria (del bien)" label line left
    # over once the sentence itself was removed (e.g. h5 captured separately).
    _LOGIN_FOOTER_LABEL_RE = re.compile(
        r"^\s*informaci[oó]n\s+complementaria(?:\s+del\s+bien)?\s*[:.]?\s*$",
        re.IGNORECASE | re.MULTILINE,
    )

    @classmethod
    def _strip_login_footer(cls, text: Optional[str]) -> Optional[str]:
        """
        Remove the legit logged-out login-footer sentence (and its bare label
        line) from an extracted bien blob so the page-dump sanitizer does not
        reject the whole block. Belt-and-braces alongside the JS-side skip in
        _extract_section_text. Returns None if nothing remains.
        """
        if not text:
            return text
        t = cls._LOGIN_FOOTER_RE.sub('', text)
        t = cls._LOGIN_FOOTER_LABEL_RE.sub('', t)
        t = t.strip()
        return t or None

    @classmethod
    def _sanitize_extracted_text(
        cls, text: Optional[str], enforce_length: bool = True
    ) -> Optional[str]:
        """
        Belt-and-braces guard against the page-dump leak: REJECT any extracted
        free-form text that carries page-chrome / inline-script signatures, or
        (when enforce_length) that is absurdly long (the whole <body> wrapper).
        Honest-NULL on reject — better an empty field than the BOE nav + JS
        clock in chargesDetail / lotDescription. Applied at the assembly site to
        every free-form BOE field that lands in the DB (warning ->
        charges_detail, bienes -> lot_description).

        enforce_length=False keeps the page-dump token rejection but DROPS the
        size cap — used for the bien block, where a legitimate multi-property
        description can run long and is also consumed for cadastral/address
        extraction. The token check alone still catches the page dump there.
        """
        if not text:
            return None
        t = text.strip()
        if not t:
            return None
        low = t.lower()
        if any(tok in low for tok in cls._PAGE_DUMP_TOKENS):
            return None
        if enforce_length and len(t) > cls._SANITIZE_MAX_LEN:
            return None
        return t

    def _extract_warning_banner(self, page: Any) -> Optional[str]:
        """
        Heading-anchored Advertencias fallback. The previous implementation did
        `querySelectorAll('body *')` filtered by "ADVERTENCIA" and returned
        candidates[0].textContent — which is the outer <body> wrapper, dumping
        the ENTIRE BOE page (nav + JS clock + login chrome) into chargesDetail.

        This version anchors on a heading/label element whose OWN text is the
        "Advertencia(s)" label, then returns ONLY the immediately following
        sibling's text (the actual charges sentence) — never an ancestor's
        textContent. Scoped, size-capped, and chrome-filtered in JS; the caller
        additionally runs _sanitize_extracted_text as a second line of defence.
        """
        try:
            raw = page.evaluate(
                """
                () => {
                  const BAD = /iniciar sesi|var hoy|function reloj|new date\\(|buscar ayuda|<script|<style/i;
                  // Anchor on a SMALL heading/label element whose own text is the
                  // Advertencias label (not an ancestor wrapper). Cap own-text so
                  // we never latch onto <body> or a big container.
                  const headings = Array.from(document.querySelectorAll(
                    'h2, h3, h4, h5, h6, strong, b, dt, .titulo, .heading, legend, caption'
                  )).filter(h => {
                    const t = (h.textContent || '').trim();
                    return /ADVERTENC/i.test(t) && t.length < 120;
                  });
                  for (const h of headings) {
                    // Walk forward over the immediate following siblings until the
                    // next heading; collect their leaf text. This is the charges
                    // sentence, NOT the whole page.
                    let el = h.nextElementSibling;
                    const parts = [];
                    while (el) {
                      const tag = (el.tagName || '').toUpperCase();
                      if (['H2','H3','H4','H5','H6'].includes(tag)) break;
                      const t = (el.innerText || el.textContent || '').trim();
                      if (t) parts.push(t);
                      el = el.nextElementSibling;
                    }
                    const text = parts.join('\\n').trim();
                    if (text && text.length > 0 && text.length < 2000 && !BAD.test(text)) {
                      return text;
                    }
                  }
                  return null;
                }
                """
            )
            return self._sanitize_extracted_text(raw)
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
