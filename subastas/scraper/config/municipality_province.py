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
# Tokenisation helpers for the whole-string address matcher + compound handling.
# Defined early so the gazetteer loader can build word/content/component indexes.
# ---------------------------------------------------------------------------
# Any run of non-alphanumerics is a token separator (accents already folded, and
# apostrophes in "d'Aro" / "l'Alcúdia" split into separate tokens).
_NONWORD_RE = re.compile(r'[^a-z0-9]+')
# Articles + prepositions that link the parts of a compound town name. Dropping
# these makes "Polinyà DEL Xúquer" and "Polinyà DE Xúquer" (co-official vs es)
# match, and lets an article-inverted gazetteer form ("Pobla de Vallbona, la")
# match the natural address order ("la Pobla de Vallbona").
_CONNECTORS = frozenset({'de', 'del', 'la', 'las', 'el', 'los', 'l', 'd',
                         'y', 'e', 'i', 'o', 'u', 'dels', 'els', 'les',
                         'des', 'lo', 'as', 'os', 'da', 'do'})
# The subset that can lead/trail a name as a definite article (for inversion).
_ARTICLES = frozenset({'la', 'el', 'els', 'les', 'los', 'las', 'l',
                       'lo', 'as', 'os', 'a', 'o'})


def _address_words(text):
    """Fold to lowercase/accent-stripped tokens (punctuation -> separator)."""
    if not text:
        return []
    norm = normalize_municipality(text)  # lowercase, accents removed, ws collapsed
    return [w for w in _NONWORD_RE.sub(' ', norm).split() if w]


def _wordkey(name):
    """Gazetteer key in the SAME token form the address scan produces, so
    "Vélez-Málaga" (key "velez malaga") matches address n-gram "velez malaga"."""
    return ' '.join(_address_words(name))


def _content_key(name):
    """Connector-stripped key ("pobla vallbona") so de/del/d' article variation
    between the co-official and Castilian forms can't block a compound match."""
    return ' '.join(w for w in _address_words(name) if w not in _CONNECTORS)


def _word_variants(name):
    """All word-form keys a name should be indexed under: the natural form plus
    article-inversion variants, so both "la Pobla de Vallbona" and the
    register's inverted "Pobla de Vallbona, la" resolve."""
    base = _wordkey(name)
    if not base:
        return set()
    out = {base}
    w = base.split()
    if len(w) > 1 and w[-1] in _ARTICLES:      # "pobla de vallbona la"
        out.add(' '.join([w[-1]] + w[:-1]))     # -> "la pobla de vallbona"
        out.add(' '.join(w[:-1]))               # -> "pobla de vallbona"
    if len(w) > 1 and w[0] in _ARTICLES:        # "la pobla de vallbona"
        out.add(' '.join(w[1:]))                # -> "pobla de vallbona"
    return out


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


# ===========================================================================
# FULL INE MUNICIPALITY REGISTER
# ---------------------------------------------------------------------------
# The COMPLETE official Spanish municipality list, so province-less rows become
# fillable. Sourced from INE's own register — "Relación de municipios y códigos
# por comunidades autónomas y provincias", diccionario{YY}.xlsx — NOT from
# Wikidata/Wikipedia/a scrape. 8,132 municipalities across all 52 provinces
# (incl. Ceuta / Melilla). Regenerate with:
#
#     python scripts/build-ine-gazetteer.py
#
# The exact edition, its date and its sha256 are written into the `#` banner at
# the top of each CSV — read the file to learn how old it is. Committed
# alongside this module (no network at runtime). The province of each town is
# the INE code prefix (first 2 digits), resolved via provinces.py.
#
# HISTORY: until 2026-08-04 this was a Wikidata-derived list carrying pre-1989
# Castilian-only names ("Alegría de Álava", "Aramayona") and invented 11-digit
# sub-municipal rows. Every downstream municipality URL resolves against this
# file, so it is now generated from the official register only.
#
# CRITICAL — DUPLICATE NAMES: some town names exist in >1 province (e.g.
# Arroyomolinos = Madrid AND Cáceres). A bare name is AMBIGUOUS for those, so
# `_AMBIGUOUS_TOWNS` holds every normalized name appearing in >1 province and
# municipality_to_province() REFUSES to resolve them from the name alone — the
# address must carry a disambiguator (postal-code prefix or an explicit province
# name, both higher-priority signals in derive_province_from_address). Only
# UNAMBIGUOUS names (single province) resolve directly. Correctness > coverage.
# ===========================================================================

import csv as _csv
import os as _os
from collections import defaultdict as _defaultdict

# Base name->province maps (keyed by normalize_municipality) used by
# municipality_to_province(), the court tiebreaker, and _ambiguous_candidates().
_INE_UNAMBIGUOUS: dict[str, str] = {}
_AMBIGUOUS_TOWNS: set[str] = set()
# normalized ambiguous town name -> the frozenset of provinces it exists in.
_AMBIGUOUS_CANDIDATES: dict[str, frozenset] = {}

# Word-form indexes for the whole-string address scan (keyed by _wordkey, incl.
# article-inversion variants).
_TOWN_WORD_UNAMBIG: dict[str, str] = {}
_TOWN_WORD_AMBIG: dict[str, frozenset] = {}
# Connector-stripped ("content") indexes so de/del/d' variation between the
# co-official and Castilian compound forms still matches (multi-token only).
_TOWN_CONTENT_UNAMBIG: dict[str, str] = {}
_TOWN_CONTENT_AMBIG: dict[str, frozenset] = {}
# Word/content key -> the canonical INE municipality NAME it matched. Lets the
# address scan return the TOWN (for the `municipality` column), not just the
# province. Only populated for keys that resolve to exactly one province, so a
# name that exists in several provinces never yields a confident town.
_TOWN_DISPLAY: dict[str, str] = {}
# Single tokens that are a component of some MULTI-word municipality name — used
# by the sub-token hijack guard (a bare "Vallbona"/"Cristina"/"Móra" must not
# fill when it is a fragment of a longer compound town in the address).
_COMPONENT_TOKENS: set = set()

# The gazetteer data files (committed alongside this module — no runtime network):
#   ine_municipalities.csv             — 8,132 municipalities, primary official
#                                        denomination + INE code + province
#   ine_municipalities_coofficial.csv  — every OTHER official written form of the
#                                        same INE code: the co-official-language
#                                        denominations INE stores slash-separated
#                                        ("Agurain/Salvatierra", "Elx/Elche") and
#                                        INE's inverted-article filing form
#                                        ("Coruña, A"). Derived mechanically from
#                                        the official NOMBRE — nothing invented.
_GAZETTEER_FILES = ("ine_municipalities.csv", "ine_municipalities_coofficial.csv")


def _load_ine_register() -> None:
    """Load the committed gazetteer(s) and build every index the matcher uses:
    base name->province, word-form (incl. article variants), connector-stripped
    content-form, and the compound-component token set. Duplicate names across
    provinces become AMBIGUOUS (never silently wrong). Failure is non-fatal."""
    base: dict[str, set] = _defaultdict(set)
    word: dict[str, set] = _defaultdict(set)
    content: dict[str, set] = _defaultdict(set)
    # key -> the distinct canonical INE names that produced it (for _TOWN_DISPLAY)
    word_name: dict[str, set] = _defaultdict(set)
    content_name: dict[str, set] = _defaultdict(set)
    here = _os.path.dirname(_os.path.abspath(__file__))
    loaded_any = False
    for fname in _GAZETTEER_FILES:
        try:
            fh = open(_os.path.join(here, fname), encoding="utf-8")
        except OSError:
            continue
        loaded_any = True
        with fh:
            # The generated files carry a `#` provenance banner (source URL,
            # INE edition date, sha256) so "how old is this?" is answerable
            # from the file itself. Strip it before the CSV reader sees it.
            body = (ln for ln in fh if not ln.startswith("#") and ln.strip())
            for row in _csv.DictReader(body):
                nom = (row.get("municipio") or "").strip()
                prov = (row.get("provincia") or "").strip()
                if not nom or not prov:
                    continue
                base[normalize_municipality(nom)].add(prov)
                for k in _word_variants(nom):
                    word[k].add(prov)
                    word_name[k].add(nom)
                toks = [w for w in _address_words(nom) if w not in _CONNECTORS]
                if len(toks) >= 2:
                    content[' '.join(toks)].add(prov)
                    content_name[' '.join(toks)].add(nom)
                    for t in toks:
                        if len(t) >= 3:
                            _COMPONENT_TOKENS.add(t)
    if not loaded_any:
        return
    for name, provs in base.items():
        if len(provs) == 1:
            _INE_UNAMBIGUOUS[name] = next(iter(provs))
        else:
            _AMBIGUOUS_TOWNS.add(name)
            _AMBIGUOUS_CANDIDATES[name] = frozenset(provs)
    for k, provs in word.items():
        if len(provs) == 1:
            _TOWN_WORD_UNAMBIG[k] = next(iter(provs))
        else:
            _TOWN_WORD_AMBIG[k] = frozenset(provs)
    for k, provs in content.items():
        if len(provs) == 1:
            _TOWN_CONTENT_UNAMBIG[k] = next(iter(provs))
        else:
            _TOWN_CONTENT_AMBIG[k] = frozenset(provs)
    # Display names: only for keys that are province-unambiguous AND map to a
    # single canonical INE spelling. A key produced by two different towns is
    # left out entirely -> the scan returns a province but no town, which is the
    # honest answer rather than an arbitrary pick.
    for k, names in word_name.items():
        if len(word.get(k, ())) == 1 and len(names) == 1:
            _TOWN_DISPLAY[k] = next(iter(names))
    for k, names in content_name.items():
        if len(content.get(k, ())) == 1 and len(names) == 1:
            _TOWN_DISPLAY.setdefault(k, next(iter(names)))


_load_ine_register()


def municipality_to_province(municipality: str) -> Optional[str]:
    """
    Look up province from municipality name.
    Returns province name (matching provinces.py keys) or None if not found.
    Performs accent-insensitive, case-insensitive matching.

    Resolution order (correctness first — NEVER guesses an ambiguous name):
      1. AMBIGUITY GUARD — a name in >1 province (INE) resolves to None here;
         the address parser must disambiguate via postal/explicit-province.
      2. curated `_RAW` (capitals + BOE text variants, single-province).
      3. full INE register (unambiguous names only).
      4. partial-match fallback against `_RAW` (parenthetical suffixes), skipping
         any ambiguous key.
    """
    if not municipality:
        return None
    key = normalize_municipality(municipality)
    if not key:
        return None
    # 1. Ambiguous name -> refuse (needs a disambiguator). Overrides even a
    #    curated `_RAW` guess (e.g. arroyomolinos / cieza) so no fill is wrong.
    if key in _AMBIGUOUS_TOWNS:
        return None
    # 2. Curated map (major cities + BOE spellings).
    result = _RAW.get(key)
    if result:
        return result
    # 3. Full INE register (single-province names).
    ine = _INE_UNAMBIGUOUS.get(key)
    if ine:
        return ine
    # 4. Partial match against curated keys (handles " (Juzgado X)" etc.).
    for known_key, province in _RAW.items():
        if known_key in _AMBIGUOUS_TOWNS:
            continue
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
    from config import provinces as _prov_mod
except ImportError:
    try:  # cwd = subastas/  (repo + pytest: `scraper` package)
        from scraper.config import provinces as _prov_mod
    except ImportError:  # /app container
        from app.config import provinces as _prov_mod
_canon_prov = _prov_mod.canonical_province
_prov_by_code = _prov_mod.province_by_code_strict

# All normalized province NAMES + co-official aliases -> canonical province, for
# scanning a court/juzgado string for an explicit province mention (the
# tiebreaker). Built from provinces.py's own lookup tables so it never drifts.
_PROVINCE_NAME_TO_CANON: dict[str, str] = {}
_PROVINCE_NAME_TO_CANON.update(getattr(_prov_mod, "_NORM_TO_CANONICAL", {}))
_PROVINCE_NAME_TO_CANON.update(getattr(_prov_mod, "_PROVINCE_ALIASES", {}))

# 5-digit Spanish postal code — first 2 digits = INE province code.
_POSTAL5_RE = re.compile(r'\b(\d{2})\d{3}\b')
# A leading house number / postal digits to strip off an address token.
_LEADING_NUM_RE = re.compile(r'^\s*\d[\d\s\-\.º/]*')

# ---------------------------------------------------------------------------
# WHOLE-STRING address town matcher (2026-07-28, parse-recovery pass)
# ---------------------------------------------------------------------------
# The old parser only matched a whole comma-segment, so a town embedded in the
# string ("Calle Mayor 5 Torrevieja", "Partida Els Frares - Ondara") or written
# with punctuation/hyphens ("Vélez-Málaga") was missed. This matcher tokenizes
# the ENTIRE address (accent/case/punctuation-insensitive) and scans every
# n-gram (up to 6 words, to cover "San Lorenzo de El Escorial") against the
# 8,229-town gazetteer + province names, longest-match-wins, rightmost as the
# tiebreak. Correctness is preserved by strong FALSE-POSITIVE GUARDS:
#   - a single-word match must be >=4 chars and not a street-type word;
#   - a match used as a STREET NAME ("Avenida de Alicante", "Calle Sevilla") is
#     rejected via the street-context guard;
#   - an AMBIGUOUS town never fills from the name alone (postal / explicit
#     province / court tiebreaker still required).

# Street-type lead words (Spanish + co-official). A town appearing right after
# one of these (optionally through a connector) is a STREET NAME, not the town.
_STREET_WORDS = frozenset({
    'calle', 'c', 'cl', 'avenida', 'avda', 'avd', 'av', 'avinguda', 'plaza',
    'pza', 'plza', 'pl', 'placa', 'placeta', 'plazuela', 'camino', 'cami',
    'carretera', 'ctra', 'cr', 'paseo', 'pso', 'passeig', 'poligono', 'pol',
    'pg', 'urbanizacion', 'urb', 'partida', 'ronda', 'rda', 'travesia', 'trav',
    'tr', 'callejon', 'glorieta', 'via', 'rua', 'carrer', 'barrio', 'bda',
    'barriada', 'bloque', 'portal', 'escalera', 'esc', 'piso', 'puerta',
    'parcela', 'finca', 'sector', 'fase', 'edificio', 'edif', 'residencial',
    'grupo', 'conjunto', 'lugar', 'paraje', 'diseminado', 'pasaje', 'senda',
    'vereda', 'canada', 'muelle', 'cuesta', 'bajada', 'subida', 'rambla',
    'apartamento', 'apto', 'chalet', 'nave', 'local',
})

# Province NAME index for the scan (own map — curated `_RAW` towns + province
# names overlaid onto the CSV-built word/content indexes below).
_PROV_WORD: dict[str, str] = {}
for _n, _p in _RAW.items():  # curated capitals + BOE variants (single-province)
    _k = _wordkey(_n)
    if _k and _k not in _TOWN_WORD_AMBIG:
        _TOWN_WORD_UNAMBIG.setdefault(_k, _p)
for _n, _p in _PROVINCE_NAME_TO_CANON.items():
    _k = _wordkey(_n)
    if _k:
        _PROV_WORD.setdefault(_k, _p)

_MAX_NGRAM = 6  # longest Spanish town names ("San Lorenzo de El Escorial")


def _street_context(words, i):
    """True when words[i] is the object of a street phrase (e.g. 'avenida de X',
    'calle X') — i.e. a place name used as a STREET name, not the town."""
    j = i - 1
    steps = 0
    while j >= 0 and words[j] in _CONNECTORS and steps < 3:
        j -= 1
        steps += 1
    return j >= 0 and words[j] in _STREET_WORDS


def _connector_neighbor(words, i):
    """True when words[i] is linked by a connector (de/del/d'/la…) to another
    content word on either side — i.e. it is part of a longer "A de B" place
    expression (a compound town), not a standalone town."""
    n = len(words)
    left = (i - 1 >= 0 and words[i - 1] in _CONNECTORS
            and i - 2 >= 0 and not words[i - 2].isdigit())
    right = (i + 1 < n and words[i + 1] in _CONNECTORS
             and i + 2 < n and not words[i + 2].isdigit())
    return left or right


def _scan_address(address):
    """
    Whole-string town/province scan with false-positive guards. Returns
    (province, method, candidates, town) where `town` is the canonical INE
    municipality name of the winning match when that match was an unambiguous
    TOWN with a single canonical spelling, else None (a province-name match or
    an ambiguous/multi-spelling key yields no town). Otherwise:
      - (province, 'address-province'|'address-town', None) for a confident
        UNAMBIGUOUS match;
      - (None, None, frozenset) when the best match is an AMBIGUOUS town (its
        candidate provinces are returned for the postal/explicit/court tiebreaker);
      - (None, None, None) when nothing matches.
    Longest n-gram wins; ties broken by the RIGHTMOST position (trailing town
    beats a street-name town earlier in the string).

    Compound-town correctness (v6): a multi-word n-gram matches the gazetteer in
    its natural, article-inverted, OR connector-stripped ("content") form, so a
    co-official compound ("La Pobla de Vallbona", "Santa Cristina d'Aro",
    "Polinyà del Xúquer") matches its own entry and longest-wins picks it. And a
    SUB-TOKEN GUARD stops a bare component ("Vallbona"/"Cristina"/"Móra") filling
    a different province when it is a fragment of a longer compound in the string.
    """
    words = _address_words(address)
    n = len(words)
    # (L, i, method_or_None, province_or_None, candidates_or_None, town_key_or_None)
    best = None
    # Best TOWN hit, tracked SEPARATELY from `best`. A trailing province name
    # ("..., Getafe, Madrid") is rightmost and therefore wins `best`, which is
    # correct for the province but would otherwise suppress the town. Province
    # resolution is untouched; this only feeds the returned town.
    best_town = None
    for i in range(n):
        if words[i].isdigit():
            continue
        if _street_context(words, i):
            continue
        maxL = min(_MAX_NGRAM, n - i)
        for L in range(maxL, 0, -1):
            seg = words[i:i + L]
            if any(w.isdigit() for w in seg):
                continue
            if L == 1:
                w = seg[0]
                if len(w) < 4 or w in _STREET_WORDS:
                    continue
            key = ' '.join(seg)
            method = province = candidates = town_key = None
            if key in _PROV_WORD:
                method, province = 'address-province', _PROV_WORD[key]
            elif key in _TOWN_WORD_UNAMBIG:
                method, province = 'address-town', _TOWN_WORD_UNAMBIG[key]
                town_key = key
            elif key in _TOWN_WORD_AMBIG:
                candidates = _TOWN_WORD_AMBIG[key]
            else:
                # Connector-stripped ("content") match for compounds whose
                # de/del/d' differs from the gazetteer (multi content-word only).
                content = [w for w in seg if w not in _CONNECTORS]
                if len(content) >= 2:
                    ck = ' '.join(content)
                    if ck in _TOWN_CONTENT_UNAMBIG:
                        method, province = 'address-town', _TOWN_CONTENT_UNAMBIG[ck]
                        town_key = ck
                    elif ck in _TOWN_CONTENT_AMBIG:
                        candidates = _TOWN_CONTENT_AMBIG[ck]
                    else:
                        continue
                else:
                    continue
            # SUB-TOKEN HIJACK GUARD: a bare single-token TOWN match that is a
            # known component of a longer municipality AND sits in a connector
            # context ("…de X" / "X de …") is a compound fragment — never fill
            # from it (leave for a longer match / UNKNOWABLE). Never applies to
            # province-name matches (distinctive) or multi-word matches.
            if (L == 1 and province is not None and method == 'address-town'
                    and seg[0] in _COMPONENT_TOKENS and _connector_neighbor(words, i)):
                continue
            hit = (L, i, method, province, candidates, town_key)
            if best is None or hit[0] > best[0] or (hit[0] == best[0] and hit[1] > best[1]):
                best = hit
            if town_key is not None and (
                    best_town is None or hit[0] > best_town[0]
                    or (hit[0] == best_town[0] and hit[1] > best_town[1])):
                best_town = hit
            break  # took the longest n-gram at this start
    if best is None:
        return None, None, None, None
    town = None
    # Only surface the town when it is consistent with the province we resolved
    # (or when no province resolved). A town whose province contradicts the
    # winning province match is a false positive — drop it rather than pick.
    if best_town is not None:
        if best[3] is None or _canon_prov(best_town[3]) == _canon_prov(best[3]):
            town = _TOWN_DISPLAY.get(best_town[5])
    return best[3], best[2], best[4], town


def derive_province_from_address(address: Optional[str]):
    """
    Parse a Spanish province from a free-form address string. Conservative —
    NEVER guesses.

    Strategy:
      1. A 5-digit postal code ANYWHERE -> INE province code (most reliable).
      2. Whole-string town/province scan (see _scan_address): every n-gram is
         matched against the full gazetteer + province names, longest-wins /
         rightmost, with street-context + single-word guards. An unambiguous
         match fills; an ambiguous match is left for the tiebreaker.

    Returns (province_name, method) where method is
    'address-postal' | 'address-province' | 'address-town', or (None, None).
    """
    if not address:
        return None, None
    raw = str(address).strip()
    if not raw:
        return None, None

    # 1. postal code anywhere in the string (strongest signal).
    m = _POSTAL5_RE.search(raw)
    if m:
        p = _prov_by_code(m.group(1))
        if p:
            return p, 'address-postal'

    # 2. whole-string town/province scan.
    province, method, _cands, _town = _scan_address(raw)
    if province:
        return province, method
    return None, None


def derive_municipality_from_address(address: Optional[str]):
    """
    Parse the PROPERTY's town out of a free-form address string, conservatively.

    Returns (town, province, method) where `town` is a canonical INE
    municipality name and method is 'address-town', or (None, None, None) when
    the address yields no unambiguous single-spelling town.

    NEVER guesses. A postal code alone gives a province but NOT a town (many
    municipalities share a postcode), so a postal-only hit returns no town —
    this is the asymmetry that keeps municipality a strictly weaker signal than
    province. An ambiguous name (exists in >1 province) is rejected outright
    rather than resolved by proximity or by the court.

    This REPLACES the 18-big-city substring scan that used to read the court's
    city off the page chrome.
    """
    if not address:
        return None, None, None
    raw = str(address).strip()
    if not raw:
        return None, None, None
    province, _method, _cands, town = _scan_address(raw)
    if not town:
        return None, None, None
    # Prefer the postal-derived province when present (deterministic), else the
    # scan's. _scan_address already guarantees the town does not contradict it.
    prov = None
    m = _POSTAL5_RE.search(raw)
    if m:
        prov = _prov_by_code(m.group(1))
    prov = prov or province
    town = canonical_municipality_name(town)
    if not town:
        return None, None, None
    # Final consistency gate: a postal-derived province that disagrees with the
    # town's own province means one of the two is wrong -> return neither.
    tprov = municipality_to_province(normalize_municipality(town))
    if prov and tprov and _canon_prov(prov) != _canon_prov(tprov):
        return None, None, None
    return town, prov, 'address-town'


def geo_cross_check(province: Optional[str],
                    municipality: Optional[str],
                    address: Optional[str]):
    """
    Ken's permanent guard (RULING 2026-08-03 §1): the address string is a
    CROSS-CHECK, never a silent override.

    Given the geo we are about to persist and the row's address, return
    (agrees, detail):
      - (True,  None)      the address corroborates, or is silent / ambiguous
                           (silence is not disagreement).
      - (False, "...")     the address unambiguously resolves to a DIFFERENT
                           province or town than what we are about to write.

    A False result means FLAG THE ROW — do not silently pick a side. The caller
    quarantines it rather than minting a confident wrong URL.
    """
    if not address:
        return True, None
    a_prov, a_method = derive_province_from_address(address)
    if a_prov and province:
        if _canon_prov(a_prov) != _canon_prov(province):
            return False, (f"address->{a_prov} ({a_method}) "
                           f"contradicts province={province}")
    a_town, _tp, _tm = derive_municipality_from_address(address)
    if a_town and municipality:
        if normalize_municipality(a_town) != normalize_municipality(municipality):
            return False, (f"address->town {a_town} "
                           f"contradicts municipality={municipality}")
    return True, None


def court_province_hint(court_name: Optional[str]):
    """
    Best-effort province from a court / juzgado string, or None. PRECISION over
    recall — only used to disambiguate an ambiguous town, and only accepted when
    it matches ONE of that town's candidate provinces.

    BOE court text looks like "Juzgado de Primera Instancia N.º 3 de Nules" or
    "Juzgado de lo Mercantil N.º 1 de Alicante". Resolution:
      1. An explicit PROVINCE NAME anywhere in the text (word-boundary match;
         distinctive, e.g. "de Cáceres", and capitals like "de Madrid" whose city
         name IS the province).
         -> If exactly ONE distinct province name appears, return it; if several
            conflicting ones appear, return None (don't guess).
      2. Otherwise the court CITY (trailing tokens after the boilerplate),
         resolved through the guarded town map (an ambiguous court city -> None,
         so we never emit a wrong province).
    Returns a canonical province name or None.
    """
    if not court_name:
        return None
    norm = normalize_municipality(court_name)
    if not norm:
        return None

    # 1. explicit province name(s) in the text.
    hits = set()
    for pv_norm, canon in _PROVINCE_NAME_TO_CANON.items():
        if len(pv_norm) < 4:
            continue  # avoid tiny tokens producing spurious word hits
        if re.search(r'(?<![0-9a-z])' + re.escape(pv_norm) + r'(?![0-9a-z])', norm):
            hits.add(canon)
    if len(hits) == 1:
        return next(iter(hits))
    if len(hits) > 1:
        return None  # conflicting province mentions -> unsafe

    # 2. court city = trailing tokens (city may itself contain " de ", e.g.
    #    "Jerez de la Frontera"), resolved via the GUARDED town map.
    words = norm.split()
    for k in (4, 3, 2, 1):
        if len(words) >= k:
            cand = ' '.join(words[-k:])
            p = municipality_to_province(cand)  # ambiguous city -> None (safe)
            if p:
                return p
    return None


# ===========================================================================
# DETERMINISTIC COURT-TOWN -> PROVINCE (2026-07-28, structured-signal pass)
# ---------------------------------------------------------------------------
# Ken's read-only source breakdown of the 10,421 province-less inScope rows:
# 99.9% BOE judicial; `courtName` present on 8,651; 7,450 carry a clean
# "JUZGADO … - <TOWN>" suffix; only 320 DISTINCT court-towns cover all 7,450.
#
# A Spanish Juzgado de Primera Instancia has territorial jurisdiction over a
# partido judicial within ONE province, and the properties it auctions sit in
# that province. So the COURT-TOWN -> PROVINCE map is a SAFE, bounded (320-row,
# human-reviewable) lookup — fill at PROVINCE LEVEL only. This is jurisdictional
# mapping, NOT the fuzzy free-text address parsing that was withheld: we never
# derive the property's municipality from the court town.
#
# AEAT / tax-agency "courts" (~1,194) carry no juzgado town suffix -> NULL.
# An ambiguous court-town (name in >1 province) or one that doesn't map to a
# real province -> NULL + flagged for review. NEVER guess.
# ===========================================================================

# The BOE court-name -> town suffix separator ("JUZGADO … - TORREVIEJA").
_COURT_SUFFIX_RE = re.compile(r'\s[-–—]\s')
# Trailing parenthetical / roman-ordinal noise sometimes glued to the town.
_COURT_TOWN_TRIM_RE = re.compile(r'\s*\((?:[^)]*)\)\s*$')

# Curated, HUMAN-VERIFIED partido-judicial court-town -> province overrides for
# short/regional court spellings the gazetteer doesn't resolve cleanly (or where
# an altLabel truncation would resolve WRONG). Checked FIRST. Loaded from the
# committed court_town_overrides.csv; a row with an invalid province is dropped
# (fail-closed). Keyed by normalize_municipality of the court-town.
_COURT_TOWN_OVERRIDES: dict[str, str] = {}


def _load_court_town_overrides() -> None:
    path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)),
                         "court_town_overrides.csv")
    try:
        with open(path, encoding="utf-8") as fh:
            for row in _csv.DictReader(fh):
                town = (row.get("court_town") or "").strip()
                prov = (row.get("province") or "").strip()
                if not town or town.startswith("#") or not prov:
                    continue
                # Fail-closed: only accept a canonical province (never a typo).
                canon = _canon_prov(prov) or (prov if prov in _INE_UNAMBIGUOUS.values() else None)
                if canon:
                    _COURT_TOWN_OVERRIDES[normalize_municipality(town)] = canon
    except OSError:
        pass


_load_court_town_overrides()


def court_town_from_name(court_name: Optional[str]):
    """Extract the town from a "JUZGADO … - <TOWN>" courtName suffix, or None.

    Returns the RAW town string (last dash-delimited segment). AEAT / tax bodies
    and any courtName without a " - <TOWN>" suffix return None (-> NULL fill).
    """
    if not court_name:
        return None
    s = str(court_name).strip()
    if not s:
        return None
    # AEAT / administrative tax bodies are not partido-judicial courts.
    low = s.lower()
    if 'agencia' in low and 'tributaria' in low:
        return None
    parts = _COURT_SUFFIX_RE.split(s)
    if len(parts) < 2:
        return None
    town = _COURT_TOWN_TRIM_RE.sub('', parts[-1]).strip()
    # A juzgado town suffix is a place name, not a number/section fragment.
    if not town or town.isdigit() or len(town) < 3:
        return None
    return town


def _resolve_court_town(town):
    """Resolve a CLEAN single court-town name to a province via the FULL
    co-official INE index (word-form + article-inversion variants, and the
    connector-stripped "content" form), returning (province, flag).

    This is SAFE here — unlike a free-text address — because the court suffix is
    ONE clean town token after "JUZGADO … -"; there is no street/lindero/surname
    to hijack, so the co-official normalisation + connector-stripping only ever
    resolve the intended town. A name in >1 province -> ('ambiguous'); a name in
    exactly one -> ('ok'); nothing -> ('unmappable'). NEVER guesses.
    """
    # 0. HUMAN-VERIFIED override (partido abbreviations / co-official spellings the
    #    gazetteer can't resolve, or would resolve WRONG via an altLabel truncation).
    ov = _COURT_TOWN_OVERRIDES.get(normalize_municipality(town))
    if ov:
        return ov, 'ok'
    key = _wordkey(town)                    # normalised, punctuation-folded
    # 1. bare province name in the suffix ("… - BARCELONA" / "… - GIRONA").
    if key in _PROV_WORD:
        return _PROV_WORD[key], 'ok'
    # 2. word-form (incl. article-inversion variants: "el ejido" ⇄ "ejido").
    if key in _TOWN_WORD_UNAMBIG:
        return _TOWN_WORD_UNAMBIG[key], 'ok'
    if key in _TOWN_WORD_AMBIG:
        return None, 'ambiguous'
    # 3. connector-stripped content form ("jerez frontera" -> "jerez de la
    #    frontera", "vilafranca penedes" -> "vilafranca del penedès").
    content = [w for w in key.split() if w not in _CONNECTORS]
    if content:
        ck = ' '.join(content)
        if ck in _TOWN_CONTENT_UNAMBIG:
            return _TOWN_CONTENT_UNAMBIG[ck], 'ok'
        if ck in _TOWN_CONTENT_AMBIG:
            return None, 'ambiguous'
    # 4. legacy guarded map (curated + partial) as a final resolver.
    p = municipality_to_province(town)
    if p:
        return p, 'ok'
    if normalize_municipality(town) in _AMBIGUOUS_CANDIDATES:
        return None, 'ambiguous'
    return None, 'unmappable'


def court_province_from_name(court_name: Optional[str]):
    """Deterministically resolve a courtName to a PROVINCE via its town suffix.

    Returns (province, town, flag):
      flag 'ok'          -> province is a valid single province (fillable)
      flag 'no-town'     -> no juzgado town suffix (AEAT / administrative) -> NULL
      flag 'ambiguous'   -> town exists in >1 province -> NULL (flagged for review)
      flag 'unmappable'  -> town not found in the gazetteer -> NULL (flagged)

    The town->province lookup routes through the FULL co-official INE index
    (17,578 rows: altLabels/native names + article-inversion + connector-stripped
    keys) so short/regional court-town spellings ("ELX", "JEREZ FRONTERA",
    "EJIDO", "VILAFRANCA PENEDES", "VIELHA") resolve — safe because the suffix is
    a single clean town token, not a free-text address.
    """
    town = court_town_from_name(court_name)
    if not town:
        return None, None, 'no-town'
    province, flag = _resolve_court_town(town)
    return province, town, flag


def _ambiguous_candidates(address: Optional[str], municipality: Optional[str]):
    """
    When neither the address nor the municipality field resolved confidently,
    find an AMBIGUOUS town among them and return its candidate provinces
    (frozenset), or None if there is no ambiguous town to disambiguate.

    Only reached after derive_province_from_address()/municipality_to_province()
    both returned nothing, so any ambiguous town present IS the blocking signal.
    """
    # municipality field first (a single clean token).
    if municipality:
        c = _AMBIGUOUS_CANDIDATES.get(normalize_municipality(municipality))
        if c:
            return c
    # then the whole-string address scan — returns the ambiguous town's
    # candidates when the best (longest/rightmost, guard-passing) match is an
    # ambiguous name. Same scan derive_province_from_address uses, so the token
    # the tiebreaker disambiguates is exactly the one that blocked the fill.
    if address:
        _p, _m, cands, _t = _scan_address(str(address))
        if cands:
            return cands
    return None


def resolve_province_less(address: Optional[str] = None,
                          municipality: Optional[str] = None,
                          bien_provincia: Optional[str] = None,
                          postal_code: Optional[str] = None,
                          bien_localidad: Optional[str] = None,
                          court_province: Optional[str] = None,
                          court_name: Optional[str] = None):
    """
    Best-effort REAL province for a row whose `province` column is empty/junk.

    Source order (address/municipality are the populated fields on the
    province-less rows; the bien* fields are later fallbacks):
        address -> municipality -> COURT tiebreaker (ambiguous town) ->
        bienProvincia -> postalCode -> bienLocalidad

    Returns (province, source) or (None, None) = UNKNOWABLE (leave untouched).
    Sources include 'court-disambig' when an ambiguous town was resolved by the
    court signal. `court_province` is accepted for back-compat but NEVER used to
    fill; `court_name` (the juzgado text) IS the second signal.

    A special return `(None, 'court-conflict')` flags the rare case where the
    court points to a province that is NOT among the ambiguous town's candidates
    — the caller logs it and leaves the row UNKNOWABLE (never a wrong override).
    """
    # 1. address (primary — populated on ~93% of province-less rows).
    p, method = derive_province_from_address(address)
    if p:
        return p, method

    # 2. municipality column (secondary; ambiguous -> None here).
    if municipality:
        mp = municipality_to_province(municipality)
        if mp and _canon_prov(mp):
            return mp, 'municipality'

    # 3. COURT/SOURCE TIEBREAKER for an ambiguous town (deep pass, 2026-07-28).
    #    Only fires when an ambiguous town blocked 1 & 2. Resolve ONLY when the
    #    court signal unambiguously matches ONE candidate province; if it points
    #    outside the candidates, flag a conflict (never override); no signal ->
    #    unknowable.
    candidates = _ambiguous_candidates(address, municipality)
    if candidates:
        hint = court_province_hint(court_name)
        if hint is not None:
            if hint in candidates:
                return hint, 'court-disambig'
            return None, 'court-conflict'  # court disagrees with all candidates
        return None, None  # no usable court signal -> unknowable

    # 4. bienProvincia (rarely present on these rows, but authoritative if so).
    pv = _canon_prov(bien_provincia)
    if pv:
        return pv, 'bienProvincia'

    # 5. postalCode column prefix.
    if postal_code:
        mm = re.match(r'^\s*(\d{2})\d{3}\s*$', str(postal_code))
        if mm:
            pc = _prov_by_code(mm.group(1))
            if pc:
                return pc, 'postalCode'

    # 6. bienLocalidad town map.
    if bien_localidad:
        bl = municipality_to_province(normalize_municipality(bien_localidad))
        if bl:
            return bl, 'bienLocalidad'

    return None, None
