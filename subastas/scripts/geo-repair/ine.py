"""Shared INE gazetteer loader + municipalityKey port (must match src/lib/geo/municipality-key.ts)."""
import csv, re, unicodedata, os

BASE = r"C:\Users\D\worktrees\dnkpartner\ghost-muni-normalisation\subastas\scraper\config"

TRAILING_ARTICLES = {'el','la','los','las','l','els','les','a','as','o','os','lo','es','sa','ses','sos'}

def normalize_text(s):
    s = unicodedata.normalize('NFD', s.lower())
    # strip combining marks but KEEP enye (ts normalizeText keeps n~? check) -> ts keeps [a-z0-9ñ]
    out = []
    for ch in s:
        if unicodedata.combining(ch):
            continue
        out.append(ch)
    s = ''.join(out)
    return re.sub(r'\s+', ' ', s).strip()

def municipality_key(value):
    if not value:
        return ''
    working = value.strip()
    comma = working.rfind(',')
    if comma > 0:
        head = working[:comma].strip()
        tail = working[comma+1:].strip()
        tail_key = normalize_text(tail).replace("'", '').replace('\u2019', '')
        if head and tail_key and tail_key in TRAILING_ARTICLES:
            working = f"{tail} {head}"
    s = normalize_text(working)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def province_key(p):
    if not p:
        return ''
    k = municipality_key(p)
    # DB<->INE province vocabulary reconciliation (verified against both lists)
    ALIAS = {
        'baleares': 'illes balears',
        'islas baleares': 'illes balears',
        'guipuzcoa': 'gipuzkoa',
        'vizcaya': 'bizkaia',
        'alava': 'araba alava',
        'araba': 'araba alava',
        'la coruna': 'a coruna',
        'coruna': 'a coruna',
        'gerona': 'girona',
        'lerida': 'lleida',
        'orense': 'ourense',
        'alicante alacant': 'alicante',
        'castellon castello': 'castellon',
        'valencia valencia': 'valencia',
    }
    return ALIAS.get(k, k)


def load_ine():
    """Return: canon[prov_key][muni_key] = (canonical_name, ine_code)
       and allkeys[muni_key] = set(prov_key)"""
    canon = {}
    allkeys = {}

    def add(prov, name, code, muni_key_src=None):
        pk = province_key(prov)
        mk = municipality_key(muni_key_src if muni_key_src else name)
        if not pk or not mk:
            return
        canon.setdefault(pk, {})
        # first writer wins (official form before co-official alias)
        if mk not in canon[pk]:
            canon[pk][mk] = (name, code)
        allkeys.setdefault(mk, set()).add(pk)

    def rows(path):
        with open(path, encoding='utf-8-sig') as f:
            lines = [l for l in f if not l.startswith('#') and l.strip()]
        return list(csv.DictReader(lines))

    ine_names = {}
    for r in rows(os.path.join(BASE, 'ine_municipalities.csv')):
        if not r.get('ine'):
            continue
        ine_names[r['ine']] = (r['nombre_ine'], r['provincia'])
        add(r['provincia'], r['nombre_ine'], r['ine'], r['municipio'])
        add(r['provincia'], r['nombre_ine'], r['ine'], r['nombre_ine'])

    for r in rows(os.path.join(BASE, 'ine_municipalities_coofficial.csv')):
        if not r.get('ine'):
            continue
        nm = ine_names.get(r['ine'], (r.get('nombre_ine', ''), r['provincia']))
        add(r['provincia'], nm[0], r['ine'], r['municipio'])

    return canon, allkeys, ine_names
