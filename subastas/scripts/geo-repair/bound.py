"""Upper bound on what ANY postcode table can recover, given Ken's condition (a):
two INDEPENDENT sources must agree, and the name is the only signal independent
of the postcode field.
"""
import ine, re, json
from collections import Counter
from resolve2 import resolve, IDX, dam

SEP = '\\' + 't'
CP5 = re.compile(r'^\d{5}$')
canon, allkeys, names = ine.load_ine()

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


STOP = {'de','del','la','las','el','los','i','y','a','o','e','les','els','lo','l','da','do','das','dos'}
def toks(s):
    return set(t for t in ine.municipality_key(s).split() if t not in STOP)


cache = {}
st = Counter()
addressable_cps = set()
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
        st['no_cp -> UNRECOVERABLE'] += 1
        continue
    # does the row carry ANY name signal that a postcode could be checked against?
    has_name_signal = False
    if fuzzy_unique(prov, muni) is not None:
        has_name_signal = True
    else:
        # containment / truncation against any municipality in the province
        pk = ine.province_key(prov)
        mt = toks(muni)
        if mt and pk in canon:
            for kk in canon[pk]:
                ct = toks(kk)
                if ct and (ct <= mt or mt < ct):
                    has_name_signal = True
                    break
    if has_name_signal:
        st['HAS cp + name signal -> ADDRESSABLE'] += 1
        addressable_cps.add(cp)
    else:
        st['cp but NO name signal -> blocked by rule (a)'] += 1

for k, v in st.most_common():
    print(f'  {k:48s} {v:6d}')
print(f'\n  distinct CPs needed for the addressable set: {len(addressable_cps)}')
open('addressable_cps.txt', 'w').write('\n'.join(sorted(addressable_cps)))
