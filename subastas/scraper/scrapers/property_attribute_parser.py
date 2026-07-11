"""
property_attribute_parser — extract idealista-style property attributes from the
BOE (and off-BOE) prose we already store.

Phase 1 of the property-portal build (Dennis-approved 2026-07-11). Feasibility
(ken/PROJECTS/dnksubastas/property-portal-feasibility/GHOST-FINDINGS.md) showed
that on the data we scrape today ~30% of active Viviendas state a bedroom count,
~24% a bathroom count, and terraza/garaje/trastero/jardín/planta appear in the
same registry prose — numbers included ("TRES DORMITORIOS"), zero external calls.

This module reads the concatenated prose columns (lotDescription +
propertyDescription + cadastralData + title) and returns:

  bedrooms          int   — dormitorio / alcoba / (numbered) habitación
  bathrooms         int   — baño + aseo (summed when both enumerated)
  has_terrace       bool  — terraza
  has_garden        bool  — jardín / zona ajardinada
  has_garage        bool  — garaje / aparcamiento / parking / cochera
  has_storage_room  bool  — trastero
  floor_level       str   — planta / piso ("bajo", "1", "ático", "sótano"…)

HONEST-NULL everywhere. Absence of a mention is None, NEVER 0 / False — "the
listing doesn't say" is not "there are zero bedrooms". Negation ("sin garaje",
"sin trastero") is handled explicitly and yields False for booleans / is skipped
for counts. A bare singular room noun counts as 1 ONLY when it sits inside a
room enumeration (a distribución list: adjacent comma or " y "); an unqualified
plural with no number is not counted (we cannot know how many) → None.

Spanish number words are converted with a small self-contained cardinal map
(uno..treinta) rather than importing boe_scraper._spanish_words_to_int: room and
floor counts never exceed ~30, and this keeps the module a true LEAF (no import
of the Playwright-heavy boe_scraper), so boe_scraper can import THIS module at
top level with no cycle and the tests run fully offline.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, Optional


def _norm(s: str) -> str:
    """Lowercase + strip accents + collapse whitespace (ñ preserved as n)."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).lower()


# Single-token Spanish cardinals 0..30 — the full realistic range for a room
# count or a floor number. Mirrors boe_scraper._ES_UNITS/_ES_TENS for the small
# range we need; kept local so this module imports nothing heavy.
_CARDINALS = {
    "cero": 0, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4,
    "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
    "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15,
    "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19,
    "veinte": 20, "veintiuno": 21, "veintiun": 21, "veintiuna": 21,
    "veintidos": 22, "veintitres": 23, "veinticuatro": 24, "veinticinco": 25,
    "veintiseis": 26, "veintisiete": 27, "veintiocho": 28, "veintinueve": 29,
    "treinta": 30,
}


def _word_to_int(tok: str) -> Optional[int]:
    """Single Spanish cardinal token (or digits) -> int, else None."""
    if not tok:
        return None
    if tok.isdigit():
        try:
            return int(tok)
        except ValueError:
            return None
    return _CARDINALS.get(tok)


# A room enumeration ("distribución"/"compuesta de …") is signalled by list
# punctuation near the noun. Used to decide whether a bare singular ("… , baño ,
# …" / "… y aseo") should count as one room.
def _in_enumeration(t: str, start: int, end: int) -> bool:
    pre = t[max(0, start - 25):start]
    post = t[end:end + 25]
    return ("," in pre or "," in post
            or re.search(r"\by\s*$", pre) is not None
            or re.match(r"\s*y\b", post) is not None
            or re.search(r"\b(de|con)\s*$", pre) is not None)


def _count_rooms(t: str, noun_group: str, allow_bare_singular: bool) -> Optional[int]:
    """
    Sum room counts for a noun family. `noun_group` is a regex alternation
    (e.g. 'dormitorio|alcoba'). A numbered mention ("tres X"/"3 X") contributes
    its number; a bare singular contributes 1 only inside an enumeration (and
    only when `allow_bare_singular`). Negated mentions ("sin X") contribute 0.
    Returns the total, or None when nothing countable was found.
    """
    # Optional leading number, optional "cuarto(s) de" (for "un cuarto de baño"),
    # the noun, optional plural suffix. Regex backtracking lets group(1) stay
    # empty for a bare "cuarto de baño".
    pattern = re.compile(
        r"(?:(\d{1,2}|[a-zñ]+)\s+)?(?:cuartos?\s+de\s+)?(" + noun_group + r")(es|s)?\b"
    )
    total = 0
    found = False
    for m in pattern.finditer(t):
        numtok, plural = m.group(1), m.group(3)
        # Negation window: "sin" (optionally "sin ningun") right before the match.
        pre = t[max(0, m.start() - 14):m.start()]
        if re.search(r"\bsin(?:\s+ning[uú]n\w*)?\s*$", pre):
            found = True  # an explicit "sin baño" is a real (zero) signal
            continue
        n = _word_to_int(numtok) if numtok else None
        if n is not None and 1 <= n <= 30:
            total += n
            found = True
            continue
        # No usable number. Count a bare SINGULAR only when it reads as a list
        # item; skip unqualified plurals ("dormitorios" with no count) and
        # generic nouns outside an enumeration — honest-NULL over a guess.
        if allow_bare_singular and not plural and _in_enumeration(t, m.start(), m.end()):
            total += 1
            found = True
    if not found or total == 0:
        return None
    return total


def _bedrooms(t: str) -> Optional[int]:
    # dormitorio/alcoba are unambiguous bedrooms; bare "habitación" is generic
    # ("habitaciones, servicios, terraza") so it counts ONLY when numbered —
    # handled by running it without bare-singular permission and merging.
    core = _count_rooms(t, r"dormitorio|alcoba", allow_bare_singular=True)
    hab = _count_rooms(t, r"habitacion", allow_bare_singular=False)
    if core is None and hab is None:
        return None
    # Prefer the explicit dormitorio/alcoba count; only fall back to a numbered
    # "habitaciones" when no dormitorio/alcoba was stated (avoid double-counting
    # a description that says both "tres dormitorios" and "habitaciones").
    return core if core is not None else hab


def _bathrooms(t: str) -> Optional[int]:
    return _count_rooms(t, r"ba[nñ]o|aseo", allow_bare_singular=True)


def _has(t: str, present_pat: str, noun_for_neg: str) -> Optional[bool]:
    """
    Tri-state amenity: True when mentioned, False when explicitly negated
    ("sin <noun>"), None when not mentioned at all (honest-NULL).
    """
    if not re.search(present_pat, t):
        return None
    # Explicit negation "sin <noun>" (e.g. "sin garaje", "sin trastero").
    if re.search(r"\bsin\s+(?:ning[uú]n\w*\s+)?(?:" + noun_for_neg + r")\b", t):
        # Only report False when the ONLY mention is the negated one.
        # Strip the negated span and re-test for a surviving positive mention.
        stripped = re.sub(r"\bsin\s+(?:ning[uú]n\w*\s+)?(?:" + noun_for_neg + r")\b", " ", t)
        if not re.search(present_pat, stripped):
            return False
    return True


_ORDINAL_FLOOR = {
    "baja": "bajo", "bajo": "bajo", "bajos": "bajo",
    "entresuelo": "entresuelo", "entreplanta": "entresuelo",
    "principal": "principal",
    "primera": "1", "primero": "1", "primer": "1",
    "segunda": "2", "segundo": "2",
    "tercera": "3", "tercero": "3", "tercer": "3",
    "cuarta": "4", "cuarto": "4",
    "quinta": "5", "quinto": "5",
    "sexta": "6", "sexto": "6",
    "septima": "7", "septimo": "7",
    "octava": "8", "octavo": "8",
    "novena": "9", "noveno": "9",
    "decima": "10", "decimo": "10",
    "atico": "atico", "sotano": "sotano", "sotanos": "sotano",
}

# "planta baja" / "planta 2" / "planta 1a" / "piso segundo" / "Pl:00" / "Pl 3".
_FLOOR_RE = re.compile(
    r"\b(?:planta|piso|pl)\s*[:\.]?\s*"
    r"(baja|bajos?|entresuelo|entreplanta|principal|atico|sotanos?|"
    r"primer[ao]?|segund[ao]|tercer[ao]?|cuart[ao]|quint[ao]|sext[ao]|"
    r"septim[ao]|octav[ao]|noven[ao]|decim[ao]|\d{1,2})"
    r"\s*[aoªº]?\b"
)


def _floor_level(t: str) -> Optional[str]:
    """
    Extract a single floor label ("bajo", "1", "atico", "sotano") from the FIRST
    clear "planta/piso <ordinal|number>" anchor. Conservative: only the mapped
    ordinal set + a 1-2 digit number are accepted; "planta alta"/"planta baja y
    alta" (no single storey) yields the first concrete storey it finds. Returns
    None when no clean anchor is present.
    """
    for m in _FLOOR_RE.finditer(t):
        raw = m.group(1)
        if raw.isdigit():
            n = int(raw)
            return "bajo" if n == 0 else str(n)
        val = _ORDINAL_FLOOR.get(raw)
        if val:
            return val
    return None


def parse_property_attributes(text: Optional[str]) -> Dict[str, Any]:
    """
    Parse property attributes from concatenated prose. Returns a dict with keys
    bedrooms / bathrooms / has_terrace / has_garden / has_garage /
    has_storage_room / floor_level — every value honest-NULL (None) when the
    prose carries no signal. NEVER 0 / False as a default.
    """
    out: Dict[str, Any] = {
        "bedrooms": None, "bathrooms": None,
        "has_terrace": None, "has_garden": None,
        "has_garage": None, "has_storage_room": None,
        "floor_level": None,
    }
    if not text:
        return out
    t = _norm(text)

    out["bedrooms"] = _bedrooms(t)
    out["bathrooms"] = _bathrooms(t)
    out["has_terrace"] = _has(t, r"\bterraza", r"terrazas?")
    out["has_garden"] = _has(t, r"\bjardin|\bajardinad", r"jardines?|zonas?\s+ajardinadas?")
    out["has_garage"] = _has(
        t,
        r"\bgaraje|\baparcamiento|\bparking|\bcochera|plaza\s+de\s+garaje",
        r"garajes?|aparcamientos?|parking|cocheras?",
    )
    out["has_storage_room"] = _has(t, r"\btrastero", r"trasteros?")
    out["floor_level"] = _floor_level(t)
    return out


def set_property_attribute_fields(record: Dict[str, Any]) -> None:
    """
    In-place helper (mirrors set_surface_occupancy_fields / set_vehicle_fields):
    populate the seven property-attribute keys on a record dict from its already-
    captured prose, reused by the BOE ingest, the SEGSOCIAL + PLABI scrapers, and
    the active-pool backfill so the paths never drift.

    Honest-NULL / fill-only: a field is written ONLY when the parser found a
    value AND the record does not already carry one — a transient parse miss or a
    re-run never blanks a good column. Source prose = lot_description +
    property_description + cadastral_data + title (whatever the record carries).
    """
    prose = " ".join(filter(None, [
        record.get("lot_description"),
        record.get("property_description"),
        record.get("cadastral_data"),
        record.get("title"),
    ])) or None
    if not prose:
        return
    attrs = parse_property_attributes(prose)
    for key, val in attrs.items():
        if val is not None and record.get(key) is None:
            record[key] = val
