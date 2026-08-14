"""Re-validate the applied T6_CP_UNIQUE rows under Ken's new evidence rule
(2026-08-14): postcode-vs-province agreement is circular and no longer counts.
Only NAME + POSTCODE agreement counts.

Independent name signal used here: the canonical municipality's own tokens appear
inside the stored string (e.g. "La Llera Villaviciosa" contains "Villaviciosa",
"Quenxe-Corcubion" contains "Corcubion"). That is the row's own name field
agreeing with the postcode -- two independent fields.

Rows with no such agreement are REVERTED to their original value.
"""
import ine, json
from collections import Counter

canon, allkeys, names = ine.load_ine()
INE_NAME = {c: n for c, (n, p) in names.items()}
SEP = '\\' + 't'

STOP = {'de', 'del', 'la', 'las', 'el', 'los', 'i', 'y', 'a', 'o', 'e',
        'les', 'els', 'lo', 'l', 'da', 'do', 'das', 'dos'}


def toks(s):
    return [t for t in ine.municipality_key(s).split() if t not in STOP]


from resolve2 import IDX, dam


def fuzzy_unique(prov, muni, maxd=3):
    """Best unique register candidate for the stored string, ignoring the gate.
    Used here only as an AGREEMENT test against the postcode, never to assign."""
    pk = ine.province_key(prov)
    if pk not in IDX:
        return None
    pool = IDX[pk][0]
    mk = ine.municipality_key(muni)
    best, bd = [], 99
    for k, (nm, c) in pool.items():
        d = dam(mk, k)
        if d < bd:
            bd, best = d, [c]
        elif d == bd and c not in best:
            best.append(c)
    return best[0] if bd <= maxd and len(best) == 1 else None


keep, revert = [], []
reasons = Counter()
for line in open('t6_rows.tsv', encoding='utf-8'):
    p = line.rstrip('\n').split(SEP)
    if len(p) != 6:
        continue
    _id, prov, old, new, code, cp = p
    old_t, new_t = set(toks(old)), set(toks(new))
    why = None
    # (a) the canonical name appears inside the stored string
    if new_t and new_t <= old_t:
        why = 'NAME_CONTAINS_CANONICAL'
    # (b) the stored string is a truncation of the canonical name
    elif old_t and old_t < new_t:
        why = 'NAME_IS_TRUNCATION'
    # (c) the stored string's unique fuzzy candidate is the same municipality
    elif fuzzy_unique(prov, old) == code:
        why = 'NAME_FUZZY_AGREES'
    if why:
        reasons[why] += 1
        keep.append((_id, old, new, why))
    else:
        revert.append((_id, old, new, cp))
print('name-agreement basis:', dict(reasons))

print(f'T6_CP_UNIQUE rows            : {len(keep) + len(revert)}')
print(f'  KEEP  (name+postcode agree): {len(keep)}')
print(f'  REVERT(postcode alone)     : {len(revert)}')
print('\nsample KEEP:')
for k in keep[:8]:
    print(f'   "{k[1][:34]:34s}" -> {k[2][:26]}')
print('\nsample REVERT:')
for r in revert[:12]:
    print(f'   "{r[1][:34]:34s}" -> {r[2][:26]:26s} (cp {r[3]})')

json.dump(revert, open('t6_revert.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(f'\nwrote t6_revert.json ({len(revert)})')
