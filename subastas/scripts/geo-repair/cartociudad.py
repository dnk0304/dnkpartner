"""Build CP -> INE municipality from CartoCiudad (IGN), the official Spanish
geographic register. Free, open (CC-BY), and independent of both our corpus and
GeoNames.

Chain per postcode: findJsonp(type=postalCode) -> POINT centroid
                 -> reverseGeocode(lon,lat)   -> muni + muniCode (INE code)

Resumable, polite (jittered ~1.2-2.4s), circuit breaker on sustained failure.
"""
import json, os, random, re, sys, time
import urllib.request as U
import urllib.error

OUT = 'cartociudad_cps.jsonl'
UA = {'User-Agent': 'Mozilla/5.0 (compatible; dnksubastas-geo-repair/1.0)'}
POINT_RE = re.compile(r'POINT\(([-\d.]+)\s+([-\d.]+)\)')
BREAKER = 25


def _get(url, timeout=25):
    return U.urlopen(U.Request(url, headers=UA), timeout=timeout).read().decode('utf-8', 'replace')


def _loads(raw):
    raw = raw.strip()
    if raw.startswith('callback(') or raw.startswith('jsonp('):
        raw = raw[raw.index('(') + 1:]
        if raw.endswith(')'):
            raw = raw[:-1]
    return json.loads(raw)


def cp_centroid(cp):
    raw = _get(f'https://www.cartociudad.es/geocoder/api/geocoder/findJsonp?q={cp}&type=postalCode')
    m = POINT_RE.search(raw)
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


def reverse(lon, lat):
    raw = _get(f'https://www.cartociudad.es/geocoder/api/geocoder/reverseGeocode?lon={lon}&lat={lat}')
    d = _loads(raw)
    return d.get('muni'), d.get('muniCode'), d.get('province')


def main():
    want = [c.strip() for c in open('need_cps.txt', encoding='utf-8') if c.strip()]
    done = set()
    if os.path.exists(OUT):
        for line in open(OUT, encoding='utf-8'):
            try:
                done.add(json.loads(line)['cp'])
            except Exception:
                pass
    todo = [c for c in want if c not in done]
    print(f'want={len(want)} done={len(done)} todo={len(todo)}', flush=True)

    fh = open(OUT, 'a', encoding='utf-8')
    fails = 0
    for i, cp in enumerate(todo, 1):
        rec = {'cp': cp}
        try:
            time.sleep(random.uniform(1.2, 2.4))
            pt = cp_centroid(cp)
            if not pt:
                rec['kind'] = 'NO_CENTROID'
            else:
                time.sleep(random.uniform(0.8, 1.6))
                muni, code, prov = reverse(*pt)
                if muni and code:
                    rec.update(kind='OK', muni=muni, ine=str(code), province=prov,
                               lon=pt[0], lat=pt[1])
                else:
                    rec['kind'] = 'NO_MUNI'
            fails = 0
        except Exception as exc:
            # transport failure is not a decision -> do not persist, retry next run
            fails += 1
            print(f'  [{i}] {cp} ERROR {type(exc).__name__} {str(exc)[:60]}', flush=True)
            if fails >= BREAKER:
                print('CIRCUIT BREAKER', flush=True)
                break
            continue
        fh.write(json.dumps(rec, ensure_ascii=False) + '\n')
        fh.flush()
        if i % 100 == 0:
            print(f'  fetched {i}/{len(todo)}', flush=True)
    fh.close()
    print('FINISHED', flush=True)


if __name__ == '__main__':
    main()
