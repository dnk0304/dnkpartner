"""
Municipality → Province lookup for Spanish BOE auctions.

Built from INE (Instituto Nacional de Estadistica) official municipio codes.
The keys are lowercase-normalized municipality names for fuzzy matching.
Used by:
  1. The scraper (forward: parse province from court/municipality text)
  2. The province backfill script (reverse: fix province=Unknown rows)

Only includes municipalities that are either:
  a) Capitals or major cities (population > ~5,000) — these cover ~95% of auction activity
  b) Common municipality spellings seen in BOE listings

For exact lookups: normalize with normalize_municipality() first.
"""

from typing import Optional
import unicodedata
import re


def normalize_municipality(name: str) -> str:
    """Lowercase, strip accents, collapse whitespace."""
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", ascii_str.lower().strip())


# ---------------------------------------------------------------------------
# municipality (normalized) -> province name (matching provinces.py keys)
# ---------------------------------------------------------------------------
# Format: lowercase-no-accent municipio -> province name as in provinces.py
# Includes capitals, major cities, and common BOE text variants.

_RAW: dict[str, str] = {
    # Almería
    "almeria": "Almería",
    "roquetas de mar": "Almería",
    "el ejido": "Almería",
    "nijar": "Almería",
    "vera": "Almería",
    "adra": "Almería",
    "berja": "Almería",
    "huercal-overa": "Almería",
    "huercal overa": "Almería",
    "carboneras": "Almería",
    "viator": "Almería",
    "benahadux": "Almería",
    "pechina": "Almería",
    "cuevas del almanzora": "Almería",
    "garrucha": "Almería",
    "mojacar": "Almería",
    "pulpi": "Almería",

    # Cádiz
    "cadiz": "Cádiz",
    "jerez de la frontera": "Cádiz",
    "algeciras": "Cádiz",
    "san fernando": "Cádiz",
    "el puerto de santa maria": "Cádiz",
    "chiclana de la frontera": "Cádiz",
    "sanlucar de barrameda": "Cádiz",
    "la linea de la concepcion": "Cádiz",
    "ubrique": "Cádiz",
    "rota": "Cádiz",
    "arcos de la frontera": "Cádiz",
    "barbate": "Cádiz",
    "conil de la frontera": "Cádiz",
    "tarifa": "Cádiz",
    "medina sidonia": "Cádiz",
    "los barrios": "Cádiz",
    "puerto real": "Cádiz",
    "vejer de la frontera": "Cádiz",

    # Córdoba
    "cordoba": "Córdoba",
    "lucena": "Córdoba",
    "puente genil": "Córdoba",
    "cabra": "Córdoba",
    "montilla": "Córdoba",
    "pozoblanco": "Córdoba",
    "priego de cordoba": "Córdoba",
    "palma del rio": "Córdoba",
    "baena": "Córdoba",
    "aguilar de la frontera": "Córdoba",
    "bujalance": "Córdoba",
    "montoro": "Córdoba",
    "nueva carteya": "Córdoba",
    "penarrubia": "Córdoba",

    # Granada
    "granada": "Granada",
    "motril": "Granada",
    "almunecar": "Granada",
    "baza": "Granada",
    "guadix": "Granada",
    "loja": "Granada",
    "armilla": "Granada",
    "maracena": "Granada",
    "albolote": "Granada",
    "pinos puente": "Granada",
    "atarfe": "Granada",
    "churriana de la vega": "Granada",
    "salobrena": "Granada",
    "huescar": "Granada",
    "las gabias": "Granada",
    "ogijares": "Granada",

    # Huelva
    "huelva": "Huelva",
    "almonte": "Huelva",
    "lepe": "Huelva",
    "moguer": "Huelva",
    "ayamonte": "Huelva",
    "cartaya": "Huelva",
    "isla cristina": "Huelva",
    "punta umbria": "Huelva",
    "bollullos par del condado": "Huelva",
    "palos de la frontera": "Huelva",
    "nerva": "Huelva",

    # Jaén
    "jaen": "Jaén",
    "linares": "Jaén",
    "andujar": "Jaén",
    "ubeda": "Jaén",
    "baeza": "Jaén",
    "martos": "Jaén",
    "alcala la real": "Jaén",
    "villacarrillo": "Jaén",
    "mancha real": "Jaén",
    "jodar": "Jaén",
    "cazorla": "Jaén",

    # Málaga
    "malaga": "Málaga",
    "marbella": "Málaga",
    "fuengirola": "Málaga",
    "velez-malaga": "Málaga",
    "velez malaga": "Málaga",
    "benalmadena": "Málaga",
    "torremolinos": "Málaga",
    "mijas": "Málaga",
    "rincon de la victoria": "Málaga",
    "estepona": "Málaga",
    "antequera": "Málaga",
    "alhaurin de la torre": "Málaga",
    "nerja": "Málaga",
    "ronda": "Málaga",
    "torrox": "Málaga",
    "alhaurin el grande": "Málaga",
    "coin": "Málaga",
    "manilva": "Málaga",
    "casares": "Málaga",
    "maro": "Málaga",
    "alora": "Málaga",

    # Sevilla
    "sevilla": "Sevilla",
    "dos hermanas": "Sevilla",
    "alcala de guadaira": "Sevilla",
    "ecija": "Sevilla",
    "utrera": "Sevilla",
    "la rinconada": "Sevilla",
    "marchena": "Sevilla",
    "osuna": "Sevilla",
    "morón de la frontera": "Sevilla",
    "moron de la frontera": "Sevilla",
    "bollullos de la mitacion": "Sevilla",
    "carmona": "Sevilla",
    "lebrija": "Sevilla",
    "san juan de aznalfarache": "Sevilla",
    "tomares": "Sevilla",
    "coria del rio": "Sevilla",

    # Huesca
    "huesca": "Huesca",
    "monzon": "Huesca",
    "barbastro": "Huesca",
    "jaca": "Huesca",
    "sabinanigo": "Huesca",
    "fraga": "Huesca",
    "binaced": "Huesca",

    # Teruel
    "teruel": "Teruel",
    "alcañiz": "Teruel",
    "alcaniz": "Teruel",
    "andorra": "Teruel",
    "utrillas": "Teruel",

    # Zaragoza
    "zaragoza": "Zaragoza",
    "calatayud": "Zaragoza",
    "tarazona": "Zaragoza",
    "ejea de los caballeros": "Zaragoza",
    "caspe": "Zaragoza",
    "utebo": "Zaragoza",
    "cuarte de huerva": "Zaragoza",
    "zuera": "Zaragoza",
    "muel": "Zaragoza",
    "garrapinillos": "Zaragoza",
    "la muela": "Zaragoza",

    # Asturias
    "oviedo": "Asturias",
    "gijon": "Asturias",
    "aviles": "Asturias",
    "mieres": "Asturias",
    "langreo": "Asturias",
    "san martin del rey aurelio": "Asturias",
    "corvera de asturias": "Asturias",
    "llanera": "Asturias",
    "siero": "Asturias",
    "castrillon": "Asturias",
    "navia": "Asturias",
    "llanes": "Asturias",
    "cangas del narcea": "Asturias",

    # Illes Balears
    "palma": "Illes Balears",
    "palma de mallorca": "Illes Balears",
    "calvia": "Illes Balears",
    "llucmajor": "Illes Balears",
    "marratxi": "Illes Balears",
    "inca": "Illes Balears",
    "manacor": "Illes Balears",
    "ibiza": "Illes Balears",
    "eivissa": "Illes Balears",
    "mahon": "Illes Balears",
    "ciutadella de menorca": "Illes Balears",
    "mao": "Illes Balears",
    "soller": "Illes Balears",
    "felanitx": "Illes Balears",
    "sant antoni de portmany": "Illes Balears",
    "formentera": "Illes Balears",

    # Las Palmas
    "las palmas de gran canaria": "Las Palmas",
    "las palmas": "Las Palmas",
    "gran canaria": "Las Palmas",  # whole-island label used by scraper
    "telde": "Las Palmas",
    "santa lucia de tirajana": "Las Palmas",
    "arucas": "Las Palmas",
    "mogan": "Las Palmas",
    "ingenio": "Las Palmas",
    "guia de isora": "Las Palmas",
    "valleseco": "Las Palmas",
    "agimes": "Las Palmas",
    "puerto rico": "Las Palmas",
    "maspalomas": "Las Palmas",
    "playa del ingles": "Las Palmas",
    "galdar": "Las Palmas",
    "lanzarote": "Las Palmas",
    "arrecife": "Las Palmas",
    "fuerteventura": "Las Palmas",
    "puerto del rosario": "Las Palmas",

    # Santa Cruz de Tenerife
    "santa cruz de tenerife": "Santa Cruz de Tenerife",
    "tenerife": "Santa Cruz de Tenerife",  # whole-island label used by scraper
    "san cristobal de la laguna": "Santa Cruz de Tenerife",
    "la laguna": "Santa Cruz de Tenerife",
    "arona": "Santa Cruz de Tenerife",
    "adeje": "Santa Cruz de Tenerife",
    "san miguel de abona": "Santa Cruz de Tenerife",
    "granadilla de abona": "Santa Cruz de Tenerife",
    "santiago del teide": "Santa Cruz de Tenerife",
    "los realejos": "Santa Cruz de Tenerife",
    "puerto de la cruz": "Santa Cruz de Tenerife",
    "guia de isora (tenerife)": "Santa Cruz de Tenerife",
    "la orotava": "Santa Cruz de Tenerife",
    "la palma": "Santa Cruz de Tenerife",
    "santa cruz de la palma": "Santa Cruz de Tenerife",
    "el hierro": "Santa Cruz de Tenerife",
    "la gomera": "Santa Cruz de Tenerife",
    "valverde": "Santa Cruz de Tenerife",

    # Cantabria
    "santander": "Cantabria",
    "torrelavega": "Cantabria",
    "camargo": "Cantabria",
    "castro urdiales": "Cantabria",
    "laredo": "Cantabria",
    "colindres": "Cantabria",
    "los corrales de buelna": "Cantabria",
    "potes": "Cantabria",

    # Ávila
    "avila": "Ávila",
    "arenas de san pedro": "Ávila",
    "el tiemblo": "Ávila",

    # Burgos
    "burgos": "Burgos",
    "miranda de ebro": "Burgos",
    "aranda de duero": "Burgos",
    "villarcayo": "Burgos",

    # León
    "leon": "León",
    "ponferrada": "León",
    "san andres del rabanedo": "León",
    "astorga": "León",
    "villablino": "León",
    "fabero": "León",

    # Palencia
    "palencia": "Palencia",
    "guardo": "Palencia",
    "aguilar de campoo": "Palencia",
    "venta de banos": "Palencia",

    # Salamanca
    "salamanca": "Salamanca",
    "bejar": "Salamanca",
    "ciudad rodrigo": "Salamanca",
    "santa marta de tormes": "Salamanca",

    # Segovia
    "segovia": "Segovia",
    "cuéllar": "Segovia",
    "cuellar": "Segovia",
    "la granja de san ildefonso": "Segovia",

    # Soria
    "soria": "Soria",
    "almazan": "Soria",

    # Valladolid
    "valladolid": "Valladolid",
    "medina del campo": "Valladolid",
    "laguna de duero": "Valladolid",
    "arroyo de la encomienda": "Valladolid",
    "peñafiel": "Valladolid",
    "penafiel": "Valladolid",
    "tordesillas": "Valladolid",

    # Zamora
    "zamora": "Zamora",
    "benavente": "Zamora",
    "toro": "Zamora",

    # Albacete
    "albacete": "Albacete",
    "hellin": "Albacete",
    "villarrobledo": "Albacete",
    "almansa": "Albacete",
    "la roda": "Albacete",

    # Ciudad Real
    "ciudad real": "Ciudad Real",
    "puertollano": "Ciudad Real",
    "valdepeñas": "Ciudad Real",
    "valdepenas": "Ciudad Real",
    "tomelloso": "Ciudad Real",
    "alcazar de san juan": "Ciudad Real",
    "manzanares": "Ciudad Real",
    "daimiel": "Ciudad Real",
    "miguelturra": "Ciudad Real",

    # Cuenca
    "cuenca": "Cuenca",
    "tarancón": "Cuenca",
    "tarancon": "Cuenca",
    "motilla del palancar": "Cuenca",
    "san clemente": "Cuenca",

    # Guadalajara
    "guadalajara": "Guadalajara",
    "azuqueca de henares": "Guadalajara",
    "alovera": "Guadalajara",
    "cabanillas del campo": "Guadalajara",
    "molina de aragon": "Guadalajara",

    # Toledo
    "toledo": "Toledo",
    "talavera de la reina": "Toledo",
    "illescas": "Toledo",
    "ajofrin": "Toledo",
    "madridejos": "Toledo",
    "consuegra": "Toledo",
    "quintanar de la orden": "Toledo",
    "mora": "Toledo",

    # Barcelona
    "barcelona": "Barcelona",
    "hospitalet de llobregat": "Barcelona",
    "l'hospitalet de llobregat": "Barcelona",
    "badalona": "Barcelona",
    "terrassa": "Barcelona",
    "sabadell": "Barcelona",
    "mataro": "Barcelona",
    "sant cugat del valles": "Barcelona",
    "cornella de llobregat": "Barcelona",
    "santa coloma de gramenet": "Barcelona",
    "manresa": "Barcelona",
    "sant boi de llobregat": "Barcelona",
    "rubí": "Barcelona",
    "rubi": "Barcelona",
    "viladecans": "Barcelona",
    "el prat de llobregat": "Barcelona",
    "mollet del valles": "Barcelona",
    "cerdanyola del valles": "Barcelona",
    "ripollet": "Barcelona",
    "berga": "Barcelona",
    "vic": "Barcelona",
    "igualada": "Barcelona",
    "martorell": "Barcelona",
    "granollers": "Barcelona",
    "sitges": "Barcelona",
    "premià de mar": "Barcelona",
    "premia de mar": "Barcelona",
    "calella": "Barcelona",
    "vilanova i la geltru": "Barcelona",

    # Girona
    "girona": "Girona",
    "banyoles": "Girona",
    "blanes": "Girona",
    "lloret de mar": "Girona",
    "roses": "Girona",
    "figueres": "Girona",
    "olot": "Girona",
    "salt": "Girona",
    "santa coloma de farners": "Girona",

    # Lleida
    "lleida": "Lleida",
    "mollerussa": "Lleida",
    "balaguer": "Lleida",
    "igualada (lleida)": "Lleida",
    "artesa de segre": "Lleida",

    # Tarragona
    "tarragona": "Tarragona",
    "reus": "Tarragona",
    "salou": "Tarragona",
    "cambrils": "Tarragona",
    "tortosa": "Tarragona",
    "vila-seca": "Tarragona",
    "calafell": "Tarragona",
    "el vendrell": "Tarragona",
    "amposta": "Tarragona",
    "valls": "Tarragona",

    # Alicante
    "alicante": "Alicante",
    "elche": "Alicante",
    "torrevieja": "Alicante",
    "benidorm": "Alicante",
    "orihuela": "Alicante",
    "alcoy": "Alicante",
    "villena": "Alicante",
    "denia": "Alicante",
    "calpe": "Alicante",
    "altea": "Alicante",
    "elda": "Alicante",
    "petrer": "Alicante",
    "crevillent": "Alicante",
    "santa pola": "Alicante",
    "guardamar del segura": "Alicante",
    "ibi": "Alicante",
    "jávea": "Alicante",
    "javea": "Alicante",
    "la nucia": "Alicante",
    "pilar de la horadada": "Alicante",

    # Castellón
    "castellon de la plana": "Castellón",
    "castellon": "Castellón",
    "benicàssim": "Castellón",
    "benicasim": "Castellón",
    "vila-real": "Castellón",
    "villarreal": "Castellón",
    "almazora": "Castellón",
    "onda": "Castellón",
    "burriana": "Castellón",
    "vinaros": "Castellón",
    "peñiscola": "Castellón",
    "peniscola": "Castellón",

    # Valencia
    "valencia": "Valencia",
    "gandia": "Valencia",
    "sagunto": "Valencia",
    "torrent": "Valencia",
    "paterna": "Valencia",
    "mislata": "Valencia",
    "burjassot": "Valencia",
    "catarroja": "Valencia",
    "xativa": "Valencia",
    "denia (valencia)": "Valencia",
    "oliva": "Valencia",
    "ontinyent": "Valencia",
    "alzira": "Valencia",
    "manises": "Valencia",
    "quart de poblet": "Valencia",
    "requena": "Valencia",
    "picanya": "Valencia",
    "alboraya": "Valencia",

    # Badajoz
    "badajoz": "Badajoz",
    "merida": "Badajoz",
    "don benito": "Badajoz",
    "villanueva de la serena": "Badajoz",
    "almendralejo": "Badajoz",
    "zafra": "Badajoz",

    # Cáceres
    "caceres": "Cáceres",
    "plasencia": "Cáceres",
    "coria": "Cáceres",
    "navalmoral de la mata": "Cáceres",
    "trujillo": "Cáceres",
    "miajadas": "Cáceres",

    # A Coruña
    "a coruna": "A Coruña",
    "la coruna": "A Coruña",
    "coruna": "A Coruña",
    "santiago de compostela": "A Coruña",
    "ferrol": "A Coruña",
    "oleiros": "A Coruña",
    "narón": "A Coruña",
    "naron": "A Coruña",
    "arteixo": "A Coruña",
    "betanzos": "A Coruña",
    "cambre": "A Coruña",
    "ribeira": "A Coruña",
    "carballo": "A Coruña",

    # Lugo
    "lugo": "Lugo",
    "monforte de lemos": "Lugo",
    "vilalba": "Lugo",
    "sarria": "Lugo",
    "foz": "Lugo",
    "viveiro": "Lugo",

    # Ourense
    "ourense": "Ourense",
    "o barco de valdeorras": "Ourense",
    "verin": "Ourense",
    "xinzo de limia": "Ourense",

    # Pontevedra
    "pontevedra": "Pontevedra",
    "vigo": "Pontevedra",
    "vilagarcia de arousa": "Pontevedra",
    "cangas": "Pontevedra",
    "moana": "Pontevedra",
    "redondela": "Pontevedra",
    "poio": "Pontevedra",
    "bueu": "Pontevedra",
    "sanxenxo": "Pontevedra",
    "o grove": "Pontevedra",
    "cambados": "Pontevedra",
    "tui": "Pontevedra",
    "a guarda": "Pontevedra",
    "lalín": "Pontevedra",
    "lalin": "Pontevedra",

    # La Rioja
    "logrono": "La Rioja",
    "logroño": "La Rioja",
    "calahorra": "La Rioja",
    "arnedo": "La Rioja",
    "alfaro": "La Rioja",
    "haro": "La Rioja",
    "santo domingo de la calzada": "La Rioja",

    # Madrid
    "madrid": "Madrid",
    "móstoles": "Madrid",
    "mostoles": "Madrid",
    "alcalá de henares": "Madrid",
    "alcala de henares": "Madrid",
    "fuenlabrada": "Madrid",
    "leganés": "Madrid",
    "leganes": "Madrid",
    "getafe": "Madrid",
    "alcorcón": "Madrid",
    "alcorcon": "Madrid",
    "torrejón de ardoz": "Madrid",
    "torrejon de ardoz": "Madrid",
    "parla": "Madrid",
    "alcobendas": "Madrid",
    "majadahonda": "Madrid",
    "rivas-vaciamadrid": "Madrid",
    "rivas vaciamadrid": "Madrid",
    "pozuelo de alarcón": "Madrid",
    "pozuelo de alarcon": "Madrid",
    "colmenar viejo": "Madrid",
    "valdemoro": "Madrid",
    "san sebastian de los reyes": "Madrid",
    "coslada": "Madrid",
    "el escorial": "Madrid",
    "arganda del rey": "Madrid",
    "las rozas de madrid": "Madrid",
    "collado villalba": "Madrid",
    "arroyomolinos": "Madrid",
    "navalcarnero": "Madrid",
    "galapagar": "Madrid",
    "pinto": "Madrid",
    "villaviciosa de odón": "Madrid",
    "villaviciosa de odon": "Madrid",
    "humanes de madrid": "Madrid",
    "ciempozuelos": "Madrid",
    "san fernando de henares": "Madrid",
    "alcala la real (madrid)": "Madrid",
    "boadilla del monte": "Madrid",
    "brunete": "Madrid",

    # Murcia
    "murcia": "Murcia",
    "cartagena": "Murcia",
    "lorca": "Murcia",
    "molina de segura": "Murcia",
    "alcantarilla": "Murcia",
    "mazarron": "Murcia",
    "los alcazares": "Murcia",
    "san pedro del pinatar": "Murcia",
    "san javier": "Murcia",
    "yecla": "Murcia",
    "jumilla": "Murcia",
    "la union": "Murcia",
    "torre-pacheco": "Murcia",
    "torre pacheco": "Murcia",
    "totana": "Murcia",
    "alhama de murcia": "Murcia",
    "caravaca de la cruz": "Murcia",
    "cieza": "Murcia",
    "puerto lumbreras": "Murcia",

    # Navarra
    "pamplona": "Navarra",
    "tudela": "Navarra",
    "barañain": "Navarra",
    "baranain": "Navarra",
    "burlada": "Navarra",
    "valle de egues": "Navarra",
    "estella": "Navarra",
    "san adrián": "Navarra",
    "san adrian": "Navarra",

    # Álava
    "vitoria": "Álava",
    "vitoria-gasteiz": "Álava",
    "vitoria gasteiz": "Álava",
    "gasteiz": "Álava",
    "amurrio": "Álava",
    "llodio": "Álava",

    # Gipuzkoa
    "san sebastian": "Gipuzkoa",
    "donostia": "Gipuzkoa",
    "donostia-san sebastian": "Gipuzkoa",
    "eibar": "Gipuzkoa",
    "irún": "Gipuzkoa",
    "irun": "Gipuzkoa",
    "errenteria": "Gipuzkoa",
    "zarautz": "Gipuzkoa",
    "azpeitia": "Gipuzkoa",
    "zumaia": "Gipuzkoa",
    "ondarroa": "Gipuzkoa",
    "mondragón": "Gipuzkoa",
    "mondragon": "Gipuzkoa",
    "arrasate": "Gipuzkoa",
    "bergara": "Gipuzkoa",
    "hernani": "Gipuzkoa",
    "tolosa": "Gipuzkoa",
    "beasain": "Gipuzkoa",

    # Bizkaia
    "bilbao": "Bizkaia",
    "barakaldo": "Bizkaia",
    "getxo": "Bizkaia",
    "basauri": "Bizkaia",
    "leioa": "Bizkaia",
    "santurtzi": "Bizkaia",
    "portugalete": "Bizkaia",
    "durango": "Bizkaia",
    "ermua": "Bizkaia",
    "erandio": "Bizkaia",
    "galdakao": "Bizkaia",
    "berango": "Bizkaia",
    "mungia": "Bizkaia",
    "gernika-lumo": "Bizkaia",
    "sestao": "Bizkaia",
    "balmaseda": "Bizkaia",

    # Ceuta
    "ceuta": "Ceuta",

    # Melilla
    "melilla": "Melilla",
}


def municipality_to_province(municipality: str) -> Optional[str]:
    """
    Look up province from municipality name.
    Returns province name (matching provinces.py keys) or None if not found.
    Performs accent-insensitive, case-insensitive matching.
    """
    if not municipality:
        return None
    key = normalize_municipality(municipality)
    result = _RAW.get(key)
    if result:
        return result
    # Partial match: check if key starts with any known municipality
    # (handles " (Juzgado X)", parenthetical suffixes, etc.)
    for known_key, province in _RAW.items():
        if key.startswith(known_key) or known_key.startswith(key):
            if abs(len(key) - len(known_key)) <= 5:
                return province
    return None


def province_from_text(text: str) -> Optional[str]:
    """
    Scan arbitrary text (e.g., courtName, address, title) for a known municipality name.
    Returns the first match found, or None.
    """
    if not text:
        return None
    norm = normalize_municipality(text)
    # Try longest match first to avoid false positives from short names
    for known_key in sorted(_RAW.keys(), key=len, reverse=True):
        if known_key in norm:
            return _RAW[known_key]
    return None


# ===========================================================================
# Canonical municipality NORMALIZER (single source of truth)
# ---------------------------------------------------------------------------
# Used by every active scraper (BOE / SEGSOCIAL / PLABI / vehicle path) and by
# backfill_municipality_normalization.py so the stored `municipality` values
# that feed the /subastas province->town filter hierarchy are:
#   1. Title-cased with Spanish connectors lowercase ("las palmas de gran
#      canaria" -> "Las Palmas de Gran Canaria", "telde" -> "Telde").
#   2. De-duplicated across casing/accent variants ("las palmas" / "LAS PALMAS"
#      / "Las Palmas" all collapse to ONE canonical display spelling).
#   3. Free of LICENSE-PLATE / pure-numeric / other junk that vehicle auctions
#      leaked into the town field (e.g. "6789jmg", "3875dvk", "12345").
#      Junk -> None (honest "unknown"), NEVER kept as a town.
# It NEVER fabricates a town.
# ===========================================================================

# Spanish connectors that stay lowercase unless they lead the name.
_MUNI_MINOR = {"de", "del", "la", "las", "el", "los", "y", "i", "a", "da", "do",
               "les", "dels", "e", "o"}

# Spanish license-plate formats (must match the WHOLE trimmed value):
#   - Post-2000 format:  4 digits + 3 letters       "6789 JMG" / "6789jmg"
#   - Pre-2000 provincial: 1-2 letters + 4 digits + 1-2 letters  "M 1234 AB"
#   - Bare matricula-ish:  letters+digits with no space and no real word
_PLATE_RES = [
    re.compile(r"^\d{4}\s*[A-Za-z]{3}$"),                     # 6789JMG
    re.compile(r"^[A-Za-z]{1,2}\s*\d{4}\s*[A-Za-z]{1,2}$"),   # M1234AB / VA 1234 K
    re.compile(r"^[A-Za-z]{1,3}-?\d{3,4}-?[A-Za-z]{0,3}$"),   # AB-1234 etc.
]

# Curated accent-correct / multi-word official display forms for the towns
# whose plain title-case (or accent-stripped source) would otherwise produce a
# wrong or duplicate spelling. Keyed by normalize_municipality() (lowercase, no
# accent). This is the dedup ANCHOR: any variant that normalizes to one of these
# keys is rewritten to the official display value, killing casing/accent dups.
# Extend conservatively — an absent key just falls through to title-case, which
# preserves accents already present in the raw BOE/portal value.
_CANONICAL_DISPLAY: dict[str, str] = {
    "las palmas de gran canaria": "Las Palmas de Gran Canaria",
    "las palmas": "Las Palmas de Gran Canaria",
    "palmas de gran canaria": "Las Palmas de Gran Canaria",
    "palma": "Palma",
    "palma de mallorca": "Palma",
    "santa cruz de tenerife": "Santa Cruz de Tenerife",
    "nijar": "Níjar",
    "velez-malaga": "Vélez-Málaga",
    "velez malaga": "Vélez-Málaga",
    "huercal-overa": "Huércal-Overa",
    "huercal overa": "Huércal-Overa",
    "mojacar": "Mojácar",
    "pulpi": "Pulpí",
    "malaga": "Málaga",
    "cadiz": "Cádiz",
    "cordoba": "Córdoba",
    "almeria": "Almería",
    "jaen": "Jaén",
    "leon": "León",
    "caceres": "Cáceres",
    "alava": "Álava",
    "a coruna": "A Coruña",
    "la coruna": "A Coruña",
    "coruna": "A Coruña",
    "alcala de henares": "Alcalá de Henares",
    "alcazar de san juan": "Alcázar de San Juan",
    "l'eliana": "l'Eliana",
    "l eliana": "l'Eliana",
    "l'hospitalet de llobregat": "l'Hospitalet de Llobregat",
    "elx": "Elx",
    "elche": "Elche",
    "alacant": "Alicante",
    "alicante": "Alicante",
    "gijon": "Gijón",
    "aviles": "Avilés",
    "logrono": "Logroño",
    "castello de la plana": "Castelló de la Plana",
    "castellon de la plana": "Castelló de la Plana",
    "donostia": "Donostia-San Sebastián",
    "donostia-san sebastian": "Donostia-San Sebastián",
    "san sebastian": "Donostia-San Sebastián",
    "vitoria-gasteiz": "Vitoria-Gasteiz",
    "vitoria": "Vitoria-Gasteiz",
}


def _title_case_municipality(name: str) -> str:
    """Title-case with Spanish connectors lowercase; preserve hyphen compounds
    (Vélez-Málaga, Huércal-Overa) and apostrophes (l'Eliana). Accents already in
    the input are preserved (we only change casing)."""
    cleaned = " ".join(str(name).split())
    parts = cleaned.split(" ")
    out = []
    for idx, w in enumerate(parts):
        low = w.lower()
        if "-" in w:
            out.append("-".join(seg[:1].upper() + seg[1:].lower() if seg else seg
                                 for seg in w.split("-")))
        elif "'" in w and len(w) > 1:
            # l'Eliana, d'Aro: lowercase leading article, capitalize remainder.
            head, _, tail = w.partition("'")
            out.append(head.lower() + "'" + (tail[:1].upper() + tail[1:].lower() if tail else ""))
        elif idx > 0 and low in _MUNI_MINOR:
            out.append(low)
        else:
            out.append(w[:1].upper() + w[1:].lower() if w else w)
    return " ".join(out)


def is_plate_or_junk_municipality(name: Optional[str]) -> bool:
    """True when `name` is a license plate, a pure number, or otherwise not a
    real municipality (so the caller writes None instead of a fake town)."""
    if not name:
        return False
    s = " ".join(str(name).split())
    if not s:
        return False
    low = s.lower()
    # Pure numeric (postal codes, lot ids leaked into the field)
    if re.fullmatch(r"[\d\.\-\/]+", s):
        return True
    # License plate formats
    compact = s.replace(" ", "")
    for rx in _PLATE_RES:
        if rx.match(s) or rx.match(compact):
            return True
    # Mixed digit+letter token with NO whitespace and NO real word vowel-run:
    # plates like "6789jmg" survive above; this catches "1234ABCD5" style noise.
    if " " not in s and re.search(r"\d", s) and re.search(r"[A-Za-z]", s) \
            and not re.search(r"[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{4,}", s):
        return True
    # Obvious non-town sentinels
    if low in {"sin localidad", "no consta", "desconocido", "desconocida",
               "n/a", "na", "-", "--", "varios", "varias", "espana", "españa"}:
        return True
    return False


def canonical_municipality_name(name: Optional[str]) -> Optional[str]:
    """
    THE normalizer. Returns the canonical, deduplicated, title-cased municipality
    DISPLAY string for the `municipality` column, or None when the value is a
    plate / pure number / junk / empty (honest "unknown" — never a fake town).

    Dedup: variants that normalize to the same key (case + accent insensitive)
    collapse to ONE spelling — the curated official form when known, else the
    title-cased input (which keeps accents already present in the source).
    """
    if not name:
        return None
    s = " ".join(str(name).split())
    if not s:
        return None
    if is_plate_or_junk_municipality(s):
        return None
    key = normalize_municipality(s)
    if not key:
        return None
    # 1) Curated official spelling (kills casing AND accent duplicates).
    if key in _CANONICAL_DISPLAY:
        return _CANONICAL_DISPLAY[key]
    # 2) Otherwise title-case the source value (accents preserved from input).
    return _title_case_municipality(s) or None


def municipality_province_consistent(municipality: Optional[str],
                                     province: Optional[str]) -> Optional[bool]:
    """
    Cross-check that a town belongs to its province in the hierarchy.
    Returns True/False when the town is in the INE map, None when the town is
    unknown to the map (cannot judge — caller should NOT act on None).
    """
    if not municipality or not province:
        return None
    mapped = municipality_to_province(municipality)
    if mapped is None:
        return None
    return normalize_municipality(mapped) == normalize_municipality(province)


# ===========================================================================
# PROVINCE RESOLUTION FROM address / municipality (2026-07-28)
# ---------------------------------------------------------------------------
# Ken's prod dry-run showed the province-less rows have EMPTY bienProvincia /
# postalCode / bienLocalidad but a POPULATED `address` (93%) and sometimes
# `municipality`. So the recoverable signal lives in the FREE-FORM address
# string and the town column, not the structured bien* fields.
#
# These two helpers are the SINGLE source of the address/municipality-based
# derivation — used by BOTH the backfill (backfill_province_less.py) AND the
# ingestion path (boe_scraper) so a new row and a backfilled row resolve
# identically. They live in THIS light module (no scraper/browser imports) so
# the backfill + unit tests import them without pulling the heavy scraper stack.
#
# HARD RULE: NEVER guess. A province is returned only when it is proven by
#   (a) a postal-code prefix, (b) an explicit province name, or (c) a town in
# the INE town->province map. No confident signal -> (None, None) = UNKNOWABLE.
# ===========================================================================

# Import the province-code + canonical-name helpers across the known layouts.
try:  # cwd = subastas/scraper/
    from config.provinces import canonical_province as _canon_prov, province_by_code_strict as _prov_by_code
except ImportError:
    try:  # cwd = subastas/  (repo + pytest: `scraper` package)
        from scraper.config.provinces import canonical_province as _canon_prov, province_by_code_strict as _prov_by_code
    except ImportError:  # /app container
        from app.config.provinces import canonical_province as _canon_prov, province_by_code_strict as _prov_by_code

# 5-digit Spanish postal code — first 2 digits = INE province code.
_POSTAL5_RE = re.compile(r'\b(\d{2})\d{3}\b')
# A leading house number / postal digits to strip off an address token.
_LEADING_NUM_RE = re.compile(r'^\s*\d[\d\s\-\.º/]*')


def derive_province_from_address(address: Optional[str]):
    """
    Parse a Spanish province from a free-form address string.

    Strategy (all conservative — never guesses):
      1. A 5-digit postal code ANYWHERE -> INE province code (most reliable).
      2. Tokenize on commas / parentheses and scan RIGHT-TO-LEFT (the town and
         province almost always TRAIL the street in a Spanish address, e.g.
         "avinguda de alicante, 20, Torrevieja" or "..., Torrevieja (Alicante)").
         For each trailing token, after stripping a leading house number:
            a. an explicit province name       -> canonical_province
            b. a town in the INE town map       -> municipality_to_province
         The right-to-left order makes the trailing town/province win over a
         street that merely CONTAINS a province word ("calle Sevilla, Madrid"
         resolves to Madrid, not Sevilla).

    Returns (province_name, method) where method is one of
    'address-postal' | 'address-province' | 'address-town', or (None, None) when
    nothing authoritative is found.
    """
    if not address:
        return None, None
    raw = str(address).strip()
    if not raw:
        return None, None

    # 1. postal code anywhere in the string.
    m = _POSTAL5_RE.search(raw)
    if m:
        p = _prov_by_code(m.group(1))
        if p:
            return p, 'address-postal'

    # 2. trailing-token scan (right to left).
    parts = [t.strip() for t in re.split(r'[,()]', raw) if t and t.strip()]
    for tok in reversed(parts):
        clean = _LEADING_NUM_RE.sub('', tok).strip()
        if len(clean) < 3:
            continue
        pv = _canon_prov(clean)
        if pv:
            return pv, 'address-province'
        mp = municipality_to_province(clean)
        if mp:
            return mp, 'address-town'
    return None, None


def resolve_province_less(address: Optional[str] = None,
                          municipality: Optional[str] = None,
                          bien_provincia: Optional[str] = None,
                          postal_code: Optional[str] = None,
                          bien_localidad: Optional[str] = None,
                          court_province: Optional[str] = None):
    """
    Best-effort REAL province for a row whose `province` column is empty/junk.

    Source order (Ken 2026-07-28 — address/municipality are the populated fields
    on the province-less rows; the bien* fields are kept as later fallbacks):
        address -> municipality -> bienProvincia -> postalCode -> bienLocalidad

    Returns (province, source) or (None, None) = UNKNOWABLE (leave untouched).
    `court_province` is accepted for signature symmetry but is NEVER used to
    fill (a junk/court province is exactly what we are replacing — never guess).
    """
    # 1. address (primary — populated on ~93% of province-less rows).
    p, method = derive_province_from_address(address)
    if p:
        return p, method

    # 2. municipality column (secondary).
    if municipality:
        mp = municipality_to_province(municipality)
        if mp and _canon_prov(mp):
            return mp, 'municipality'

    # 3. bienProvincia (rarely present on these rows, but authoritative if so).
    pv = _canon_prov(bien_provincia)
    if pv:
        return pv, 'bienProvincia'

    # 4. postalCode column prefix.
    if postal_code:
        mm = re.match(r'^\s*(\d{2})\d{3}\s*$', str(postal_code))
        if mm:
            pc = _prov_by_code(mm.group(1))
            if pc:
                return pc, 'postalCode'

    # 5. bienLocalidad town map.
    if bien_localidad:
        bl = municipality_to_province(normalize_municipality(bien_localidad))
        if bl:
            return bl, 'bienLocalidad'

    return None, None
