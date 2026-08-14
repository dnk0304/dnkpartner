"""Tiered municipality resolver. Deterministic tiers first, fuzzy last and gated."""
import ine, json, re
from collections import Counter, defaultdict

canon, allkeys, names = ine.load_ine()

# Spanish/Catalan/Galician connective particles that the BOE corpus drops or alters.
STOP = {'de', 'del', 'la', 'las', 'el', 'los', 'i', 'y', 'a', 'o', 'e',
        'les', 'els', 'lo', 'l', 'da', 'do', 'das', 'dos', 'san', 'santa'}
# 'san'/'santa' are NOT dropped for content comparison - too load-bearing. Remove them:
STOP -= {'san', 'santa'}


def content(mk):
    """Token multiset with connective particles removed."""
    toks = [t for t in mk.split() if t not in STOP]
    return tuple(sorted(toks))


# Islands are not municipalities. In the island provinces a bare island name is a
# region, not a truncation of the island capital -- the 08-10 province-token trap.
ISLANDS = {'tenerife', 'gran canaria', 'mallorca', 'menorca', 'ibiza', 'eivissa',
           'fuerteventura', 'lanzarote', 'la palma', 'palma', 'la gomera', 'gomera',
           'el hierro', 'hierro', 'formentera', 'canarias', 'baleares'}
ISLAND_PROVINCES = {'santa cruz de tenerife', 'las palmas', 'illes balears'}


def province_tokens(pk):
    """Token set of the province's own name (both co-official halves)."""
    return set(t for t in pk.split() if t not in STOP)


def build_index(pk):
    pool = canon.get(pk, {})
    content_idx = defaultdict(set)   # content tuple -> {ine}
    tok_idx = defaultdict(set)       # ine -> token set
    head_idx = defaultdict(set)      # ine -> {head token of each name form}
    byine = {}
    for k, (name, code) in pool.items():
        content_idx[content(k)].add(code)
        toks = [t for t in k.split() if t not in STOP]
        tok_idx[code] |= set(toks)
        if toks:
            head_idx[code].add(toks[0])
        byine[code] = name
    return pool, content_idx, tok_idx, byine, head_idx


IDX = {pk: build_index(pk) for pk in canon}

PAREN = re.compile(r'^(.*?)\s*\(([^)]+)\)\s*$')
ARTICLES = ine.TRAILING_ARTICLES


def deparen(muni):
    """'Rozas de Madrid (las)' -> 'las Rozas de Madrid'. Deterministic un-inversion."""
    m = PAREN.match(muni.strip())
    if not m:
        return None
    head, tail = m.group(1).strip(), m.group(2).strip()
    if head and ine.municipality_key(tail) in ARTICLES:
        return f'{tail} {head}'
    return None


def dam(a, b, maxd=3):
    if abs(len(a) - len(b)) > maxd:
        return 99
    la, lb = len(a), len(b)
    d = [[0] * (lb + 1) for _ in range(la + 1)]
    for i in range(la + 1):
        d[i][0] = i
    for j in range(lb + 1):
        d[0][j] = j
    for i in range(1, la + 1):
        for j in range(1, lb + 1):
            c = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[la][lb]


def resolve(prov, muni):
    """-> (tier, ine_code, canonical, note) or (None, ...) """
    pk = ine.province_key(prov)
    if pk not in canon:
        return ('NO_PROVINCE', None, None, '')
    pool, content_idx, tok_idx, byine, head_tokens = IDX[pk]
    mk = ine.municipality_key(muni)
    if not mk:
        return ('EMPTY', None, None, '')

    # T1 exact (incl. comma-inverted + co-official, via municipalityKey)
    if mk in pool:
        return ('T1_EXACT', pool[mk][1], pool[mk][0], '')

    # T2 parenthesised article un-inversion  ->  re-test exact
    dp = deparen(muni)
    if dp:
        k2 = ine.municipality_key(dp)
        if k2 in pool:
            return ('T2_PAREN_ARTICLE', pool[k2][1], pool[k2][0], f'{muni} => {dp}')

    # T3 content-token match (dropped/added connective particles), must be unique
    ct = content(mk)
    if ct and ct in content_idx:
        codes = content_idx[ct]
        if len(codes) == 1:
            c = next(iter(codes))
            return ('T3_PARTICLES', c, byine[c], f'tokens={" ".join(ct)}')

    # T4 unique token-subset (truncation: 'Arganda' < 'Arganda del Rey'), must be unique.
    # GUARDED: a bare province name or island name is NOT a truncation of its capital,
    # and a truncation must retain the HEAD token of the canonical name.
    if ct:
        s = set(ct)
        if s <= province_tokens(pk):
            return (None, None, None, 'T4_REJECT_PROVINCE_NAME')
        if pk in ISLAND_PROVINCES and ' '.join(ct) in ISLANDS:
            return (None, None, None, 'T4_REJECT_ISLAND_NAME')
        hits = [c for c, toks in tok_idx.items() if s and s < toks]
        if len(hits) == 1:
            if not (head_tokens[hits[0]] & s):
                return (None, None, None, f'T4_REJECT_NO_HEAD cand={byine[hits[0]]}')
            return ('T4_TRUNCATION', hits[0], byine[hits[0]], f'{mk} < {byine[hits[0]]}')
        if len(hits) > 1:
            return (None, None, None, f'T4_AMBIGUOUS n={len(hits)}')

    # T5 fuzzy, gated: unique best candidate + length gate
    best, bestd = [], 99
    for k, (name, code) in pool.items():
        d = dam(mk, k)
        if d < bestd:
            bestd, best = d, [(k, name, code)]
        elif d == bestd and code not in [b[2] for b in best]:
            best.append((k, name, code))
    if bestd < 99 and len(best) == 1:
        L = len(mk)
        # gate derived from the measured collision floor among REAL municipalities
        ok = (bestd == 1 and L >= 8) or (bestd == 2 and L >= 14)
        if ok:
            return ('T5_FUZZY', best[0][2], best[0][1], f'd={bestd} len={L}')
        return (None, None, None, f'FUZZY_BELOW_BAR d={bestd} len={L} cand={best[0][1]}')
    if bestd < 99:
        return (None, None, None, f'FUZZY_TIE d={bestd} n={len(best)}')
    return (None, None, None, 'NO_CANDIDATE')


if __name__ == '__main__':
    rows = []
    with open('muni_census.txt', encoding='utf-8') as f:
        for line in f:
            p = line.rstrip('\n').split('|')
            if len(p) == 3:
                rows.append((p[0], p[1], int(p[2])))

    tiers = Counter(); trows = Counter(); unres = []
    res = []
    for prov, muni, cnt in rows:
        t, code, cname, note = resolve(prov, muni)
        key = t if t else note.split()[0]
        tiers[key] += 1; trows[key] += cnt
        res.append({'province': prov, 'municipality': muni, 'count': cnt,
                    'tier': t, 'ine': code, 'canonical': cname, 'note': note})
        if not t:
            unres.append((prov, muni, cnt, note))

    print(f'{"tier":22s} {"pairs":>6s} {"rows":>7s}')
    for k, v in tiers.most_common():
        print(f'{k:22s} {v:6d} {trows[k]:7d}')
    print(f'{"TOTAL":22s} {sum(tiers.values()):6d} {sum(trows.values()):7d}')
    json.dump(res, open('resolved.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print('\nwrote resolved.json')
