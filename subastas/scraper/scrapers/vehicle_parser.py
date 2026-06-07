"""
Vehicle make / model / year parser (wave E2 -> v2, 2026-06-07).

v2 (wave66) — coverage lift over v1 (v1 enriched only 371/6218 = 6%):
  1. TITLE-FIRST make/model: most BOE/TGSS/PLABI vehicle titles read
     "MARCA MODELO 1.9 TDI (1234ABC)" — the make/model live in the card TITLE,
     not the description. v1 blended title+description into one blob and the
     first make token won, so a description make token could shadow the real
     title make. v2 searches the TITLE ALONE with the make dictionary first
     (and takes the model from the title run after the make); only if the title
     yields no known make do we fall back to the combined-text search.
  2. WIDENED make dictionary (~40 added): more car brands (Lexus, Infiniti,
     Cupra, Tata, Mahindra, Maxus, MG, etc.), more vans/trucks (Pegaso, Ebro,
     Avia, Nissan/Renault/Ford commercial via the base brand), more motos
     (Benelli, Royal Enfield, Sherco, Beta, Keeway, etc.), and boat / outboard
     brands (Zodiac, Quicksilver, Bayliner, Sea-Doo, Mercury, Mariner, Yanmar,
     Volvo Penta, etc.). Multi-word entries stay ordered longest-first.
  3. "PRIMERA MATRICULACIÓN" priority year: a dedicated higher-priority regex
     captures "Primera matriculación" / "1ª matriculación" / "Fecha de primera
     matriculación" and wins over the generic año / matriculación label. Order:
     primera-matriculación -> generic año/matriculación label -> bare year.

Single source of truth for extracting a vehicle's MAKE, MODEL and YEAR from the
free text BOE / SEGSOCIAL / PLABI publish for a vehicle bien (the listing title
plus the bien description / ficha blob). Used by:
  - boe_scraper._merge_bien_fields  (live BOE pulls)
  - segsocial_scraper / plabi_scraper (live pulls, via set_vehicle_fields)
  - backfill_vehicle_fields.py       (existing rows, from stored title + desc)

EXTRACTION CONTRACT (Forge E2):
  vehicleMake  — TEXT, trimmed, original case OK ("SEAT", "Honda"). NULL when unparseable.
  vehicleModel — TEXT, trimmed ("León", "CBR 600"). NULL when unparseable.
  vehicleYear  — INTEGER, 4-digit. Range guard: <1900 or >currentYear+1 -> NULL.
                 NEVER 2-digit.
  Only VEHICLE rows. PARTIAL extraction OK (make+model, year NULL).
  Honest-NULL: a field we cannot parse stays None; we never fabricate.

Design notes:
  * The primary signal is the BOE/TGSS bien layout "Marca: X   Modelo: Y" plus a
    matriculación / año field. These are TAB- or newline- or comma-separated.
  * When there is no explicit "Marca" label (common on terse titles like
    "SEAT LEON 1.9 TDI (3450KTC)"), we fall back to a curated make dictionary:
    the first known manufacturer token in the text is the make, the run of
    tokens after it (up to a plate / displacement / year) is the model.
  * We do NOT over-fit: unknown text -> all None (the card helper falls back to
    "{Tipo} en {town}"). Better an honest NULL than a wrong make.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, Optional, Tuple

# ---------------------------------------------------------------------------
# Vehicle category set — the categories on which make/model/year are written.
# Superset of config.categories vehicle subcategories + the historical /
# source-specific labels (Embarcaciones, Vehículos Industriales, Otros
# vehículos). Accent/case-insensitive membership via _norm().
# ---------------------------------------------------------------------------
VEHICLE_CATEGORIES = {
    "turismos",
    "motocicletas",
    "camiones",
    "vehiculos industriales",
    "barcos",
    "embarcaciones",
    "aeronaves",
    "otros vehiculos",
}


def _norm(s: Optional[str]) -> str:
    if not s:
        return ""
    return (s.strip().lower()
            .replace("á", "a").replace("é", "e").replace("í", "i")
            .replace("ó", "o").replace("ú", "u").replace("ü", "u"))


def is_vehicle_category(category: Optional[str]) -> bool:
    """True when `category` is one of the vehicle subcategories."""
    return _norm(category) in VEHICLE_CATEGORIES


# ---------------------------------------------------------------------------
# Known manufacturers. Used (a) to validate a "Marca:" capture and (b) as the
# no-label fallback. Multi-word makes listed BEFORE single-word so the longer
# match wins. Case-preserving canonical spelling is the dict VALUE.
# ---------------------------------------------------------------------------
_MAKES_CANONICAL = [
    # --- multi-word / hyphenated FIRST (longest match wins) -----------------
    ("mercedes benz", "Mercedes-Benz"), ("mercedes-benz", "Mercedes-Benz"),
    ("land rover", "Land Rover"), ("range rover", "Land Rover"),
    ("alfa romeo", "Alfa Romeo"),
    ("aston martin", "Aston Martin"), ("rolls royce", "Rolls-Royce"),
    ("rolls-royce", "Rolls-Royce"),
    ("harley davidson", "Harley-Davidson"), ("harley-davidson", "Harley-Davidson"),
    ("gas gas", "Gas Gas"), ("royal enfield", "Royal Enfield"),
    ("moto guzzi", "Moto Guzzi"), ("can am", "Can-Am"), ("can-am", "Can-Am"),
    ("sea doo", "Sea-Doo"), ("sea-doo", "Sea-Doo"),
    ("volvo penta", "Volvo Penta"), ("renault trucks", "Renault Trucks"),
    ("great wall", "Great Wall"),
    # --- single-word CARS ---------------------------------------------------
    ("mercedes", "Mercedes-Benz"), ("volkswagen", "Volkswagen"), ("vw", "Volkswagen"),
    ("seat", "SEAT"), ("cupra", "Cupra"), ("audi", "Audi"), ("bmw", "BMW"),
    ("ford", "Ford"), ("renault", "Renault"), ("peugeot", "Peugeot"),
    ("citroen", "Citroën"), ("citroën", "Citroën"), ("ds", "DS"),
    ("opel", "Opel"), ("toyota", "Toyota"), ("nissan", "Nissan"),
    ("honda", "Honda"), ("hyundai", "Hyundai"), ("kia", "Kia"),
    ("fiat", "Fiat"), ("lancia", "Lancia"), ("volvo", "Volvo"),
    ("mazda", "Mazda"), ("mitsubishi", "Mitsubishi"), ("suzuki", "Suzuki"),
    ("dacia", "Dacia"), ("skoda", "Škoda"), ("škoda", "Škoda"),
    ("chevrolet", "Chevrolet"), ("jeep", "Jeep"), ("lexus", "Lexus"),
    ("infiniti", "Infiniti"), ("porsche", "Porsche"), ("jaguar", "Jaguar"),
    ("mini", "Mini"), ("smart", "Smart"), ("subaru", "Subaru"),
    ("chrysler", "Chrysler"), ("dodge", "Dodge"), ("tesla", "Tesla"),
    ("daihatsu", "Daihatsu"), ("ssangyong", "SsangYong"), ("isuzu", "Isuzu"),
    ("saab", "Saab"), ("rover", "Rover"), ("mg", "MG"), ("byd", "BYD"),
    ("tata", "Tata"), ("mahindra", "Mahindra"), ("maxus", "Maxus"),
    ("ldv", "Maxus"), ("aixam", "Aixam"), ("microcar", "Microcar"),
    ("bentley", "Bentley"), ("maserati", "Maserati"), ("ferrari", "Ferrari"),
    ("lamborghini", "Lamborghini"), ("cadillac", "Cadillac"),
    ("hummer", "Hummer"), ("acura", "Acura"),
    # --- vans / trucks / industrial ----------------------------------------
    ("iveco", "Iveco"), ("man", "MAN"), ("daf", "DAF"), ("scania", "Scania"),
    ("pegaso", "Pegaso"), ("ebro", "Ebro"), ("avia", "Avia"),
    ("nissan trade", "Nissan"), ("santana", "Santana"),
    ("hino", "Hino"), ("kenworth", "Kenworth"), ("mack", "Mack"),
    ("freightliner", "Freightliner"), ("volkswagen comercial", "Volkswagen"),
    # --- motorcycles --------------------------------------------------------
    ("yamaha", "Yamaha"), ("kawasaki", "Kawasaki"), ("ducati", "Ducati"),
    ("ktm", "KTM"), ("aprilia", "Aprilia"), ("piaggio", "Piaggio"),
    ("vespa", "Vespa"), ("derbi", "Derbi"), ("gilera", "Gilera"),
    ("husqvarna", "Husqvarna"), ("husaberg", "Husaberg"),
    ("triumph", "Triumph"), ("bultaco", "Bultaco"), ("montesa", "Montesa"),
    ("rieju", "Rieju"), ("sym", "SYM"), ("kymco", "Kymco"),
    ("benelli", "Benelli"), ("sherco", "Sherco"), ("beta", "Beta"),
    ("keeway", "Keeway"), ("daelim", "Daelim"), ("hyosung", "Hyosung"),
    ("indian", "Indian"), ("buell", "Buell"), ("mv agusta", "MV Agusta"),
    ("zontes", "Zontes"), ("voge", "Voge"), ("macbor", "Macbor"),
    ("ossa", "Ossa"), ("scott", "Scott"), ("lambretta", "Lambretta"),
    # --- boats / outboards / marine ----------------------------------------
    ("zodiac", "Zodiac"), ("quicksilver", "Quicksilver"), ("bayliner", "Bayliner"),
    ("beneteau", "Beneteau"), ("jeanneau", "Jeanneau"), ("sessa", "Sessa"),
    ("sea ray", "Sea Ray"), ("sea-ray", "Sea Ray"), ("searay", "Sea Ray"),
    ("mercury", "Mercury"), ("mariner", "Mariner"), ("yanmar", "Yanmar"),
    ("johnson", "Johnson"), ("evinrude", "Evinrude"), ("selva", "Selva"),
    ("yamarin", "Yamarin"), ("rodman", "Rodman"), ("astondoa", "Astondoa"),
    ("fairline", "Fairline"), ("sunseeker", "Sunseeker"), ("azimut", "Azimut"),
    ("waverunner", "Yamaha"), ("jet ski", "Kawasaki"),
]

# Build a single alternation regex (longest-first) for the make fallback.
_MAKE_ALT = "|".join(re.escape(k) for k, _ in _MAKES_CANONICAL)
_MAKE_FALLBACK_RE = re.compile(r"\b(" + _MAKE_ALT + r")\b", re.IGNORECASE)
_MAKE_CANON_LOOKUP = {k: v for k, v in _MAKES_CANONICAL}

# Explicit "Marca: <value>" capture (value runs to the next tab / newline /
# the start of a "Modelo" label / comma). Accent-insensitive on the label.
# Negative lookbehind rejects negations like "sin marca", "no consta marca" so
# "sin marca legible" never yields make="legible".
_MARCA_RE = re.compile(
    r"(?<!sin )(?<!no consta )\bMarca\b\s*[:\t]?\s*([^\t\n,;]+?)"
    r"(?=\s*(?:\t|\n|,|;|Modelo|Matr[ií]cula|Bastidor|A[ñn]o|$))",
    re.IGNORECASE,
)
# Negation tokens that invalidate a "Marca <value>" capture even past lookbehind.
_MARCA_NEG_RE = re.compile(r"\bsin\s+marca\b|\bmarca\s+(?:no\s+consta|ilegible|"
                           r"desconocida|sin\s+identificar|no\s+legible|legible)\b",
                           re.IGNORECASE)
# "Modelo: <value>" capture.
_MODELO_RE = re.compile(
    r"\bModelo\b\s*[:\t]?\s*([^\t\n,;]+?)"
    r"(?=\s*(?:\t|\n|,|;|Matr[ií]cula|Bastidor|A[ñn]o|Combustible|Color|Cilindrada|$))",
    re.IGNORECASE,
)

# Year — HIGHEST priority: "primera matriculación" (Dennis's clarification: the
# year we should specifically target). Variants: "Primera matriculación",
# "1ª/1a/1.ª matriculación", "Fecha de (la) primera matriculación". Optional
# leading dd/mm before the 4-digit year ("Primera matriculación: 12/03/2008").
_PRIMERA_MATR_RE = re.compile(
    r"(?:(?:Fecha\s+de\s+(?:la\s+)?)?Primera\s+matriculaci[óo]n|"
    r"1[.ªa]?\s*[ªa]?\s*matriculaci[óo]n)"
    r"\s*[:\t]?\s*(?:\d{1,2}[/.\-]\s?)?(?:\d{1,2}[/.\-]\s?)?(\d{4})\b",
    re.IGNORECASE,
)
# Year — second priority: generic año / matriculación / fecha de matriculación
# label. ("fecha matriculación" with no "de", per Dennis's fallback note.)
_YEAR_LABEL_RE = re.compile(
    r"(?:A[ñn]o(?:\s+de)?(?:\s+(?:fabricaci[óo]n|matriculaci[óo]n))?|"
    r"Fecha\s+(?:de\s+)?matriculaci[óo]n|Matriculaci[óo]n|Matriculado|"
    r"Fabricaci[óo]n)"
    r"\s*[:\t]?\s*(?:\d{1,2}[/.\-]\s?)?(?:\d{1,2}[/.\-]\s?)?(\d{4})\b",
    re.IGNORECASE,
)
# Fallback bare 4-digit year token (only used when no labelled year found).
_YEAR_BARE_RE = re.compile(r"\b(19\d{2}|20\d{2})\b")

# Junk tokens that must never be treated as a make/model value.
_VALUE_BLANK = {"", "-", "n/a", "no consta", "no costa", "sin datos",
                "desconocido", "desconocida", "desconocidos", "desconocidas",
                "se desconoce", "varios", "varias"}

# Spanish licence plate (modern 4-digit + 3-letter, and older PROV-NNNN-LL).
_PLATE_RE = re.compile(r"\b\d{4}\s?[A-Z]{3}\b|\b[A-Z]{1,2}-?\d{4}-?[A-Z]{0,2}\b")


def _clean(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = re.sub(r"\s+", " ", v).strip(" :;-.\t\n")
    if not v or _norm(v) in _VALUE_BLANK:
        return None
    return v


def _valid_year(token: Optional[str]) -> Optional[int]:
    """4-digit -> int with the contract range guard (<1900 or >currentYear+1 -> None)."""
    if not token:
        return None
    try:
        y = int(token)
    except (TypeError, ValueError):
        return None
    if len(str(token)) != 4:
        return None
    if y < 1900 or y > datetime.now().year + 1:
        return None
    return y


def _make_from_fallback(text: str) -> Tuple[Optional[str], Optional[int]]:
    """Return (canonical_make, match_end_index) for the first known make token,
    or (None, None)."""
    m = _MAKE_FALLBACK_RE.search(text)
    if not m:
        return None, None
    canon = _MAKE_CANON_LOOKUP.get(_norm(m.group(1)))
    return canon, m.end()


def _model_after_make(text: str, start: int) -> Optional[str]:
    """Model = the run of tokens immediately after the make, truncated at the
    first plate / displacement / year / separator. Conservative."""
    tail = text[start:]
    # cut at a licence plate, an opening paren (plate is often parenthesised),
    # a year, a slash-displacement like "1.9", or a strong separator.
    cut_patterns = [
        _PLATE_RE,
        re.compile(r"\("),
        re.compile(r"\b(19\d{2}|20\d{2})\b"),
        re.compile(r"[,;\t\n]"),
        re.compile(r"\bmatr[ií]cula\b", re.IGNORECASE),
        re.compile(r"\bbastidor\b", re.IGNORECASE),
        re.compile(r"\ba[ñn]o\b", re.IGNORECASE),
        re.compile(r"\bmatriculaci[óo]n\b", re.IGNORECASE),
    ]
    end = len(tail)
    for cp in cut_patterns:
        cm = cp.search(tail)
        if cm and cm.start() < end:
            end = cm.start()
    model = _clean(tail[:end])
    if not model:
        return None
    # guard: a lone displacement / trim like "1.9 TDI" with no real model word
    # is acceptable as a model; but a pure number is not.
    if re.fullmatch(r"[\d.\s]+", model):
        return None
    return model[:120]


def parse_vehicle_fields(title: Optional[str],
                         description: Optional[str] = None
                         ) -> Dict[str, Optional[object]]:
    """
    Extract {make, model, year} from a vehicle's title + description.

    Returns a dict with keys 'make' (str|None), 'model' (str|None),
    'year' (int|None). Partial results are expected and fine.
    Caller is responsible for only invoking this on VEHICLE-category rows.
    """
    title_text = (title or "").strip()
    parts = [p for p in (title, description) if p]
    text = "\n".join(parts)
    if not text.strip():
        return {"make": None, "model": None, "year": None}

    make: Optional[str] = None
    model: Optional[str] = None

    # --- 1. explicit labels (most reliable) -------------------------------
    mm = _MARCA_RE.search(text)
    if mm and not _MARCA_NEG_RE.search(text):
        cand = _clean(mm.group(1))
        if cand:
            # canonicalise if it's a known make, else keep the raw label value.
            make = _MAKE_CANON_LOOKUP.get(_norm(cand), cand[:60])
    md = _MODELO_RE.search(text)
    if md:
        model = _clean(md.group(1))
        if model:
            model = model[:120]

    # --- 2. TITLE-FIRST make/model dictionary fallback --------------------
    # v2: most vehicle TITLES read "MARCA MODELO 1.9 TDI (1234ABC)" — the make
    # and model live in the card title, not the description. Search the title
    # ALONE first so a description make token never shadows the title's. Only
    # if the title yields no known make do we fall back to the combined text.
    if not make and title_text:
        fb_make, fb_end = _make_from_fallback(title_text)
        if fb_make:
            make = fb_make
            if not model and fb_end is not None:
                model = _model_after_make(title_text, fb_end)

    # --- 2b. combined-text make dictionary (no make in the title) ---------
    if not make:
        fb_make, fb_end = _make_from_fallback(text)
        if fb_make:
            make = fb_make
            if not model and fb_end is not None:
                model = _model_after_make(text, fb_end)

    # --- 3. year (priority: primera matriculación -> label -> bare) -------
    year = None
    pm = _PRIMERA_MATR_RE.search(text)
    if pm:
        year = _valid_year(pm.group(1))
    if year is None:
        ym = _YEAR_LABEL_RE.search(text)
        if ym:
            year = _valid_year(ym.group(1))
    if year is None:
        # bare year fallback — only trust it if we already identified a make
        # (avoids grabbing a postcode / amount from unrelated text).
        if make:
            for bm in _YEAR_BARE_RE.finditer(text):
                year = _valid_year(bm.group(1))
                if year is not None:
                    break

    return {"make": make, "model": model, "year": year}


def set_vehicle_fields(record: Dict[str, object],
                       title_key: str = "title",
                       desc_keys: Tuple[str, ...] = (
                           "lot_description", "property_description",
                           "description", "bienes_info"),
                       ) -> None:
    """
    In-place helper for the live scrapers: if `record['category']` is a vehicle
    category, parse make/model/year from the record's title + first available
    description field and set record['vehicle_make' / 'vehicle_model' /
    'vehicle_year'] (only when parsed — honest-NULL). No-op on non-vehicle rows.
    """
    if not is_vehicle_category(record.get("category")):
        return
    desc = None
    for k in desc_keys:
        v = record.get(k)
        if v:
            desc = v
            break
    fields = parse_vehicle_fields(record.get(title_key), desc)
    if fields["make"] is not None:
        record["vehicle_make"] = fields["make"]
    if fields["model"] is not None:
        record["vehicle_model"] = fields["model"]
    if fields["year"] is not None:
        record["vehicle_year"] = fields["year"]
