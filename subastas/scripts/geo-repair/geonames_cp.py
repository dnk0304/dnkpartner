"""Rebuild CP -> INE municipality from GeoNames ES (carries admin3_code = INE code),
then validate it against clean corpus rows exactly as the old table was validated.

Rule 1 of the amendment: the CP table must come from a register, not from our own
scraped rows. The existing src/data/cp-municipality.json was voted on by the corpus,
so it inherited the corpus's dirt (CP 12550 missing entirely; Castellon's CP marked
'ambiguous' because dirty rows voted against each other) and then could not be used
to clean it.
"""
import zipfile, io, json, ine, re
from collections import defaultdict, Counter
from resolve2 import resolve

z = zipfile.ZipFile('ES.zip')
txt = z.read('ES.txt').decode('utf-8')

canon, allkeys, names = ine.load_ine()
VALID_INE = set(names)

cp2ine = defaultdict(set)
cp_places = defaultdict(set)
bad = Counter()
for line in txt.strip().split('\n'):
    f = line.split('\t')
    if len(f) < 10:
        continue
    cp, place, admin3, admin3_code = f[1], f[2], f[7], f[8]
    if not re.match(r'^\d{5}$', cp):
        bad['cp_malformed'] += 1
        continue
    code = admin3_code.strip()
    if len(code) == 4:          # GeoNames sometimes drops the leading zero
        code = '0' + code
    if code in VALID_INE:
        cp2ine[cp].add(code)
        cp_places[cp].add(admin3)
    else:
        bad['ine_code_unknown'] += 1

print(f'GeoNames rows -> CPs: {len(cp2ine)}   rejected: {dict(bad)}')
uni = {cp: next(iter(s)) for cp, s in cp2ine.items() if len(s) == 1}
print(f'  unanimous CPs (1 municipality): {len(uni)}')
print(f'  ambiguous CPs (>1):            {len(cp2ine) - len(uni)}')

old = json.load(open(r'C:\Users\D\worktrees\dnkpartner\ghost-muni-normalisation\subastas'
                    r'\src\data\cp-municipality.json', encoding='utf-8'))['entries']
print(f'  old table CPs: {len(old)}  (new adds {len(set(cp2ine)-set(old))} unseen CPs)')

# ---- validate against clean corpus rows (same method as the old table) ----
SEP = '\\' + 't'
CP5 = re.compile(r'^\d{5}$')
cache = {}
res = Counter()
mism = []
for line in open('rows.tsv', encoding='utf-8'):
    p = line.rstrip('\n').split(SEP)
    if len(p) != 4:
        continue
    _id, prov, muni, cp = p
    cp = (cp or '').strip()
    if not CP5.match(cp):
        continue
    k = (prov, muni)
    if k not in cache:
        cache[k] = resolve(prov, muni)
    tier, code, cname, note = cache[k]
    if tier != 'T1_EXACT' or not code:
        continue
    # new table
    if cp in uni:
        if uni[cp] == code:
            res['new_agree'] += 1
        else:
            res['new_disagree'] += 1
            if len(mism) < 8:
                mism.append((prov, muni, cp, names[uni[cp]][0]))
    elif cp in cp2ine:
        res['new_ambiguous'] += 1
    else:
        res['new_absent'] += 1
    # old table
    e = old.get(cp)
    if e and e.get('unanimous'):
        res['old_agree' if e['ine'] == code else 'old_disagree'] += 1
    elif e:
        res['old_ambiguous'] += 1
    else:
        res['old_absent'] += 1

def pct(a, d):
    return f'{100*a/(a+d):.3f}%' if a + d else '-'

print('\n=== VALIDATION against clean (T1_EXACT) rows ===')
print(f'  NEW (GeoNames): agree={res["new_agree"]:6d} disagree={res["new_disagree"]:4d} '
      f'precision={pct(res["new_agree"], res["new_disagree"])}  '
      f'ambiguous={res["new_ambiguous"]} absent={res["new_absent"]}')
print(f'  OLD (corpus)  : agree={res["old_agree"]:6d} disagree={res["old_disagree"]:4d} '
      f'precision={pct(res["old_agree"], res["old_disagree"])}  '
      f'ambiguous={res["old_ambiguous"]} absent={res["old_absent"]}')
print('\n  sample NEW disagreements:')
for m in mism:
    print(f'    [{m[0][:12]:12s}] {m[1][:24]:24s} cp={m[2]} geonames={m[3][:24]}')

json.dump({'generatedAt': 'geonames-ES', 'unanimous': uni,
           'ambiguous': {k: sorted(v) for k, v in cp2ine.items() if len(v) > 1}},
          open('cp_geonames.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('\nwrote cp_geonames.json')
