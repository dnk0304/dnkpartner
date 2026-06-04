"""
Provinces Module
All 50 Spanish provinces with BOE codes and metadata
"""

import unicodedata as _unicodedata

PROVINCES = {
    # Andalucía (8 provinces)
    'Almería': {
        'code': '04',
        'community': 'Andalucía',
        'capital': 'Almería'
    },
    'Cádiz': {
        'code': '11',
        'community': 'Andalucía',
        'capital': 'Cádiz'
    },
    'Córdoba': {
        'code': '14',
        'community': 'Andalucía',
        'capital': 'Córdoba'
    },
    'Granada': {
        'code': '18',
        'community': 'Andalucía',
        'capital': 'Granada'
    },
    'Huelva': {
        'code': '21',
        'community': 'Andalucía',
        'capital': 'Huelva'
    },
    'Jaén': {
        'code': '23',
        'community': 'Andalucía',
        'capital': 'Jaén'
    },
    'Málaga': {
        'code': '29',
        'community': 'Andalucía',
        'capital': 'Málaga'
    },
    'Sevilla': {
        'code': '41',
        'community': 'Andalucía',
        'capital': 'Sevilla'
    },
    
    # Aragón (3 provinces)
    'Huesca': {
        'code': '22',
        'community': 'Aragón',
        'capital': 'Huesca'
    },
    'Teruel': {
        'code': '44',
        'community': 'Aragón',
        'capital': 'Teruel'
    },
    'Zaragoza': {
        'code': '50',
        'community': 'Aragón',
        'capital': 'Zaragoza'
    },
    
    # Asturias (1 province)
    'Asturias': {
        'code': '33',
        'community': 'Asturias',
        'capital': 'Oviedo'
    },
    
    # Islas Baleares (1 province)
    'Illes Balears': {
        'code': '07',
        'community': 'Illes Balears',
        'capital': 'Palma de Mallorca'
    },
    
    # Canarias (2 provinces)
    'Las Palmas': {
        'code': '35',
        'community': 'Canarias',
        'capital': 'Las Palmas de Gran Canaria'
    },
    'Santa Cruz de Tenerife': {
        'code': '38',
        'community': 'Canarias',
        'capital': 'Santa Cruz de Tenerife'
    },
    
    # Cantabria (1 province)
    'Cantabria': {
        'code': '39',
        'community': 'Cantabria',
        'capital': 'Santander'
    },
    
    # Castilla y León (9 provinces)
    'Ávila': {
        'code': '05',
        'community': 'Castilla y León',
        'capital': 'Ávila'
    },
    'Burgos': {
        'code': '09',
        'community': 'Castilla y León',
        'capital': 'Burgos'
    },
    'León': {
        'code': '24',
        'community': 'Castilla y León',
        'capital': 'León'
    },
    'Palencia': {
        'code': '34',
        'community': 'Castilla y León',
        'capital': 'Palencia'
    },
    'Salamanca': {
        'code': '37',
        'community': 'Castilla y León',
        'capital': 'Salamanca'
    },
    'Segovia': {
        'code': '40',
        'community': 'Castilla y León',
        'capital': 'Segovia'
    },
    'Soria': {
        'code': '42',
        'community': 'Castilla y León',
        'capital': 'Soria'
    },
    'Valladolid': {
        'code': '47',
        'community': 'Castilla y León',
        'capital': 'Valladolid'
    },
    'Zamora': {
        'code': '49',
        'community': 'Castilla y León',
        'capital': 'Zamora'
    },
    
    # Castilla-La Mancha (5 provinces)
    'Albacete': {
        'code': '02',
        'community': 'Castilla-La Mancha',
        'capital': 'Albacete'
    },
    'Ciudad Real': {
        'code': '13',
        'community': 'Castilla-La Mancha',
        'capital': 'Ciudad Real'
    },
    'Cuenca': {
        'code': '16',
        'community': 'Castilla-La Mancha',
        'capital': 'Cuenca'
    },
    'Guadalajara': {
        'code': '19',
        'community': 'Castilla-La Mancha',
        'capital': 'Guadalajara'
    },
    'Toledo': {
        'code': '45',
        'community': 'Castilla-La Mancha',
        'capital': 'Toledo'
    },
    
    # Cataluña (4 provinces)
    'Barcelona': {
        'code': '08',
        'community': 'Cataluña',
        'capital': 'Barcelona'
    },
    'Girona': {
        'code': '17',
        'community': 'Cataluña',
        'capital': 'Girona'
    },
    'Lleida': {
        'code': '25',
        'community': 'Cataluña',
        'capital': 'Lleida'
    },
    'Tarragona': {
        'code': '43',
        'community': 'Cataluña',
        'capital': 'Tarragona'
    },
    
    # Comunidad Valenciana (3 provinces)
    'Alicante': {
        'code': '03',
        'community': 'Comunidad Valenciana',
        'capital': 'Alicante'
    },
    'Castellón': {
        'code': '12',
        'community': 'Comunidad Valenciana',
        'capital': 'Castellón de la Plana'
    },
    'Valencia': {
        'code': '46',
        'community': 'Comunidad Valenciana',
        'capital': 'Valencia'
    },
    
    # Extremadura (2 provinces)
    'Badajoz': {
        'code': '06',
        'community': 'Extremadura',
        'capital': 'Badajoz'
    },
    'Cáceres': {
        'code': '10',
        'community': 'Extremadura',
        'capital': 'Cáceres'
    },
    
    # Galicia (4 provinces)
    'A Coruña': {
        'code': '15',
        'community': 'Galicia',
        'capital': 'A Coruña'
    },
    'Lugo': {
        'code': '27',
        'community': 'Galicia',
        'capital': 'Lugo'
    },
    'Ourense': {
        'code': '32',
        'community': 'Galicia',
        'capital': 'Ourense'
    },
    'Pontevedra': {
        'code': '36',
        'community': 'Galicia',
        'capital': 'Pontevedra'
    },
    
    # La Rioja (1 province)
    'La Rioja': {
        'code': '26',
        'community': 'La Rioja',
        'capital': 'Logroño'
    },
    
    # Madrid (1 province)
    'Madrid': {
        'code': '28',
        'community': 'Comunidad de Madrid',
        'capital': 'Madrid'
    },
    
    # Región de Murcia (1 province)
    'Murcia': {
        'code': '30',
        'community': 'Región de Murcia',
        'capital': 'Murcia'
    },
    
    # Navarra (1 province)
    'Navarra': {
        'code': '31',
        'community': 'Navarra',
        'capital': 'Pamplona'
    },
    
    # País Vasco (3 provinces)
    'Álava': {
        'code': '01',
        'community': 'País Vasco',
        'capital': 'Vitoria-Gasteiz'
    },
    'Gipuzkoa': {
        'code': '20',
        'community': 'País Vasco',
        'capital': 'San Sebastián'
    },
    'Bizkaia': {
        'code': '48',
        'community': 'País Vasco',
        'capital': 'Bilbao'
    },
}

# Autonomous cities
AUTONOMOUS_CITIES = {
    'Ceuta': {
        'code': '51',
        'community': 'Ceuta',
        'capital': 'Ceuta'
    },
    'Melilla': {
        'code': '52',
        'community': 'Melilla',
        'capital': 'Melilla'
    },
}

# Combine all
ALL_PROVINCES = {**PROVINCES, **AUTONOMOUS_CITIES}


def get_province_code(province_name: str) -> str:
    """
    Get BOE code for a province name
    Returns '35' (Las Palmas) as default if not found
    """
    province_data = ALL_PROVINCES.get(province_name)
    if province_data:
        return province_data['code']
    
    # Try case-insensitive match
    for name, data in ALL_PROVINCES.items():
        if name.lower() == province_name.lower():
            return data['code']
    
    # Default to Las Palmas
    return '35'


def get_province_by_code(code: str) -> str:
    """Get province name from code"""
    for name, data in ALL_PROVINCES.items():
        if data['code'] == code:
            return name
    return 'Las Palmas'


def get_provinces_by_community(community: str) -> list:
    """Get all provinces in an autonomous community"""
    return [
        name for name, data in ALL_PROVINCES.items()
        if data['community'] == community
    ]


def get_all_province_names() -> list:
    """Get list of all province names"""
    return list(ALL_PROVINCES.keys())


def get_all_province_codes() -> list:
    """Get list of all province codes"""
    return [data['code'] for data in ALL_PROVINCES.values()]


# ---------------------------------------------------------------------------
# Canonicalization — fold a raw province string (from BOE "Datos del bien
# subastado → Provincia", or a case/accent-variant already stored in the DB)
# to the EXACT province key used above (and by the website filters).
# Used by the scraper forward path AND the province/municipality backfill so
# the two stay byte-identical (no drift). NEVER guesses — returns None when the
# string does not resolve to a real Spanish province.
# ---------------------------------------------------------------------------

def _strip_accents_lower(name: str) -> str:
    """Lowercase, strip accents, collapse whitespace — for fuzzy key matching."""
    if not name:
        return ""
    nfkd = _unicodedata.normalize("NFKD", str(name))
    ascii_str = "".join(c for c in nfkd if not _unicodedata.combining(c))
    return " ".join(ascii_str.lower().split())


# Accent/case-folded province key -> canonical provinces.py name.
# Built once from ALL_PROVINCES so it always tracks the dict above.
_NORM_TO_CANONICAL = {
    _strip_accents_lower(name): name for name in ALL_PROVINCES
}

# Co-official / BOE spelling variants -> canonical Castilian key.
# BOE's "Provincia" field occasionally renders the co-official or alternate
# form; map those to the single key the website filters on. Keys are
# accent/case-folded (matched after _strip_accents_lower).
_PROVINCE_ALIASES = {
    # Comunidad Valenciana
    "alacant": "Alicante",
    "alicante/alacant": "Alicante",
    "valencia/valencia": "Valencia",
    "valencia": "Valencia",
    "castello": "Castellón",
    "castellon/castello": "Castellón",
    # Galicia
    "a coruna": "A Coruña",
    "la coruna": "A Coruña",
    "coruna": "A Coruña",
    "coruna, a": "A Coruña",
    "orense": "Ourense",
    # Illes Balears
    "baleares": "Illes Balears",
    "islas baleares": "Illes Balears",
    "illes balears": "Illes Balears",
    "balears, illes": "Illes Balears",
    # País Vasco
    "guipuzcoa": "Gipuzkoa",
    "vizcaya": "Bizkaia",
    "alava": "Álava",
    "araba": "Álava",
    "araba/alava": "Álava",
    # Cataluña
    "lerida": "Lleida",
    "gerona": "Girona",
    # Article-prefixed / inverted forms seen in BOE text
    "rioja, la": "La Rioja",
    "rioja": "La Rioja",
    "palmas, las": "Las Palmas",
    "palmas": "Las Palmas",
}


def canonical_province(raw):
    """
    Fold a raw province string to the exact provinces.py key.

    Resolution order (all accent/case-insensitive):
      1. exact fold against a real province name
      2. co-official / BOE variant alias map
    Returns the canonical province name, or None when the input does not
    resolve to a real Spanish province (caller must NOT guess).
    """
    if not raw:
        return None
    key = _strip_accents_lower(raw)
    if not key:
        return None
    hit = _NORM_TO_CANONICAL.get(key)
    if hit:
        return hit
    return _PROVINCE_ALIASES.get(key)


def province_by_code_strict(code):
    """
    Province name from a 2-digit INE code, or None on a true miss.

    Unlike get_province_by_code (which defaults to 'Las Palmas' for
    backward-compatible callers), this returns None when the code is not a
    real 01–52 province code — so the province-derivation chain can fall
    through to the next signal instead of silently stamping Las Palmas.
    """
    if not code:
        return None
    code = str(code).strip()
    if len(code) != 2 or not code.isdigit():
        return None
    for name, data in ALL_PROVINCES.items():
        if data['code'] == code:
            return name
    return None
