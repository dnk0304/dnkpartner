"""Final repair ladder under Ken's 2026-08-14 conditions.

(a) a postcode source NEVER assigns alone -- the row's own NAME must independently
    agree with it. Province/postcode-prefix agreement is NOT evidence (circular:
    province was derived from postcode on 08-04); province is used only to scope
    the candidate pool, never as confirmation.
(b) repair only -- writes the municipality column; URL routing is Forge's.
(c) 100 recoveries hand-checked before this ran: 100/100.
(d) anything unmatched stays unmatched.

Postcode sources, in order: CartoCiudad (IGN, official) then GeoNames. Both are
independent of our corpus. They disagree with each other on ~15% of shared
postcodes, which is exactly why neither may assign alone.
"""
import ine, json, re
from collections import Counter
from resolve2 import resolve, IDX, dam

canon, allkeys, names = ine.load_ine()
INE_NAME = {c: n for c, (n, p) in names.items()}
SEP = '\\' + 't'
CP5 = re.compile(r'^\d{5}$')
STOP = {'de','del','la','las','el','los','i','y','a','o','e','les','els','lo','l','da','do','das','dos'}

GN = json.load(open('cp_geonames.json', encoding='utf-8'))['unanimous']
CARTO = {}
for line in open('cartociudad_cps.jsonl', encoding='utf-8'):
    line = line.strip()
    if not line:
        continue
    try:
        r = json.loads(line)
    except Exception:
        continue
    if r.get('kind') == 'OK':
        CARTO[r['cp']] = str(r['ine'])


def cp_says(cp):
    """(ine_code, source). CartoCiudad preferred: official IGN."""
    if cp in CARTO:
        return CARTO[cp], 'cartociudad'
    if cp in GN:
        return GN[cp], 'geonames'
    return None, None


def toks(s):
    return set(t for t in ine.municipality_key(s).split() if t not in STOP)


fz_cache = {}
def fuzzy_unique(prov, muni, maxd=3):
    k = (prov, muni)
    if k in fz_cache:
        return fz_cache[k]
    pk = ine.province_key(prov)
    out = None
    if pk in IDX:
        pool = IDX[pk][0]
        mk = ine.municipality_key(muni)
        best, bd = [], 99
        for kk, (nm, c) in pool.items():
            d = dam(mk, kk)
            if d < bd:
                bd, best = d, [c]
            elif d == bd and c not in best:
                best.append(c)
        if bd <= maxd and len(best) == 1:
            out = best[0]
    fz_cache[k] = out
    return out


def name_agrees(prov, muni, code):
    """Does the row's own NAME independently point at `code`?"""
    if fuzzy_unique(prov, muni) == code:
        return 'NAME_FUZZY'
    cn = INE_NAME.get(code)
    if not cn:
        return None
    mt, ct = toks(muni), toks(cn)
    if ct and ct <= mt:
        return 'NAME_CONTAINS'
    if mt and mt < ct:
        return 'NAME_TRUNCATION'
    return None


def uninvert(name):
    if '/' in name:
        return '/'.join(uninvert(p) for p in name.split('/'))
    c = name.rfind(',')
    if c > 0:
        head, tail = name[:c].strip(), name[c+1:].strip()
        if ine.municipality_key(tail) in {'el','la','los','las','l','els','les','a','as','o','os','sa','ses','lo','es'}:
            sep = '' if tail.endswith(("'", '’')) else ' '
            return f'{tail}{sep}{head}'
    return name


cache = {}
st = Counter()
wins = []
for line in open('rows_now.tsv', encoding='utf-8'):
    p = line.rstrip('\n').split(SEP)
    if len(p) != 4:
        continue
    _id, prov, muni, cp = p
    k = (prov, muni)
    if k not in cache:
        cache[k] = resolve(prov, muni)
    t, code, cn, note = cache[k]
    if t == 'T1_EXACT':
        continue
    st['unresolved'] += 1
    cp = (cp or '').strip()
    if not CP5.match(cp):
        st['still: no postcode'] += 1
        continue
    c2, src = cp_says(cp)
    if not c2:
        st['still: postcode in no source'] += 1
        continue
    why = name_agrees(prov, muni, c2)
    if not why:
        st['still: name does not agree (rule a)'] += 1
        continue
    new = uninvert(INE_NAME[c2])
    if new == muni:
        st['already equal'] += 1
        continue
    st[f'RECOVERED via {src}+{why}'] += 1
    wins.append((_id, prov, muni, new, c2, src, why, cp))

print('=== FINAL LADDER over the remaining unresolved rows ===')
for k, v in st.most_common():
    print(f'  {k:44s} {v:6d}')
rec = sum(v for k, v in st.items() if k.startswith('RECOVERED'))
print(f'\n  RECOVERED total   : {rec}')
print(f'  STILL UNRESOLVED  : {st["unresolved"] - rec - st["already equal"]}')

agg = Counter((w[2], w[3]) for w in wins)
print(f'\n  distinct mappings: {len(agg)}')
for (o, n), c in agg.most_common(20):
    print(f'    n={c:4d} {o[:32]:32s} -> {n[:30]}')
json.dump(wins, open('ladder2_wins.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(f'\nwrote ladder2_wins.json ({len(wins)})')
