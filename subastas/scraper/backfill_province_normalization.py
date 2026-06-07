#!/usr/bin/env python3
"""
Province NORMALIZATION backfill (wave D1).

Surfaces ~47k BOE auctions (+ 144 LIVE PLABI/SegSocial rows) that are hidden
from the province / municipality filters because their stored `province` value
is DIRTY and therefore never matches the API's case-sensitive exact-match
against the 52-province allowlist (see wave59-counts-fold 94cfbe1).

Dirty values observed by QC-B (2026-06-07):
  - province = 'Unknown'                      34,458 rows  (sentinel -> re-derive)
  - 'mapa de la zona'                          1,662 rows  (UI leak  -> re-derive)
  - 'mapa del municipio'                         848 rows  (UI leak  -> re-derive)
  - 'Madrid</p>'                                 479 rows  (HTML leak -> strip -> Madrid)
  - lowercase / accent dupes                  11,460 rows  (e.g. 'cantabria','castellón',
                                                            'vizcaya','pontevedra' -> fold)

Two-stage fix per dirty row (NEVER fabricates a province):

  STAGE A — SANITIZE the existing `province` string:
    1. strip HTML tags ('</p>', '<br>', '<...>') + entities.
    2. drop UI-noise prefixes ('mapa de ...', 'mapa del ...').
    3. casefold + NFD accent-strip, then fold against the 52-province allowlist
       via config.provinces.canonical_province (the SAME fn the scrapers use, so
       'cantabria'->'Cantabria', 'castellón'->'Castellón', 'vizcaya'->'Bizkaia').
    -> if it resolves to a real province, SET province = canonical. Done.

  STAGE B — RE-DERIVE (only when Stage A yields nothing, i.e. the value was a
  missing/sentinel/noise token: 'Unknown' / 'España' / 'No consta' / 'mapa ...'):
    Same precedence the scrapers use, PLUS the free-text `address` field:
      1. bienProvincia            -> canonical_province
      2. postalCode prefix (2dg)  -> province_by_code_strict (no Las-Palmas default)
      3. bienLocalidad            -> INE municipality_to_province
      4. address: 5-digit postcode embedded in address -> province_by_code_strict
      5. address: known municipality scan -> province_from_text
    -> first hit wins; SET province (+ municipality from bienLocalidad if present).
    -> NOTHING resolves (location-less vehicles, PII-stripped sources) -> leave
       the canonical Unknown sentinel ('Unknown'). HONEST. Never guessed.

Idempotent + re-runnable (a clean row is already canonical -> out of scope, or
Stage A returns the same value -> no write). NO migration: rewrites the existing
`province` (NOT NULL String) / `municipality` (String?) columns only.

Run detached on the Hetzner scheduler container (workdir /app), reads DATABASE_URL:

  # 1. PREVIEW — counts only, writes nothing
  python3 -u backfill_province_normalization.py --dry-run
  # 2. fast smoke-test on the 144 live PLABI/SEGSOCIAL Unknown rows
  python3 -u backfill_province_normalization.py --dry-run --active-only
  python3 -u backfill_province_normalization.py --apply --active-only
  # 3. full apply (all ~47k dirty rows)
  python3 -u backfill_province_normalization.py --apply

Flags:
  --dry-run        compute + report only, write NOTHING (default if no --apply)
  --apply          actually write the UPDATEs (in id-cursor batches)
  --active-only    restrict to live rows (CELEBRANDOSE/PROXIMA_APERTURA/SUSPENDIDA)
                   -- the Phase-3 smoke test for the 144 hidden actives
  --source S       restrict to one source ('BOE'|'PLABI'|'SEGSOCIAL') -- testing
  --limit N        cap rows scanned (testing)

NOTE on the STATUS ENUM TRAP (wave58 a01890a): when filtering by status we cast
the bound array to ::"AuctionStatus"[] -- psycopg2 binds a Python list as text[]
and there is no AuctionStatus = text operator. Default scope does NOT touch
status, so the cast only appears on the --active-only path.
"""

import os
import re
import sys
import html
import argparse
import logging
from collections import Counter

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

# Allow running from scraper/ root (and the /app container layout).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    logger.error("psycopg2 not installed. pip install psycopg2-binary")
    sys.exit(1)

# Reuse the SAME derivation helpers the scrapers use so the two never drift.
try:
    from config.provinces import (
        canonical_province, province_by_code_strict, ALL_PROVINCES,
    )
    from config.municipality_province import (
        municipality_to_province, normalize_municipality, province_from_text,
    )
    from scrapers.boe_scraper import canonical_municipality
except ImportError:
    # Container layout: package rooted at /app as `app`.
    sys.path.insert(0, "/")
    from app.config.provinces import (  # noqa: F401
        canonical_province, province_by_code_strict, ALL_PROVINCES,
    )
    from app.config.municipality_province import (  # noqa: F401
        municipality_to_province, normalize_municipality, province_from_text,
    )
    from app.scrapers.boe_scraper import canonical_municipality  # noqa: F401

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL. Set DATABASE_URL env var.")
    sys.exit(1)

ACTIVE_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "SUSPENDIDA")
UNKNOWN_SENTINEL = "Unknown"
DONE_MARKER = "/data/dnksubastas-deploy/scheduler-logs/backfill_province_norm.done"

# Canonical 52-province allowlist (folded keys), matching the API's lookup.
_ALLOWLIST_FOLDED = {normalize_municipality(name) for name in ALL_PROVINCES}

# HTML tag / entity stripping and UI-noise prefixes.
_TAG_RE = re.compile(r"<[^>]*>")
_MAPA_RE = re.compile(r"^\s*mapa\s+de(l)?\b.*$", re.IGNORECASE)
# 5-digit Spanish postcode embedded anywhere in a free-text address.
_POSTAL_IN_TEXT_RE = re.compile(r"\b(\d{2})\d{3}\b")


def _sanitize_province_string(raw):
    """Strip HTML + entities + collapse whitespace from a stored province value."""
    if not raw:
        return ""
    s = html.unescape(str(raw))
    s = _TAG_RE.sub(" ", s)            # 'Madrid</p>' -> 'Madrid '
    s = " ".join(s.split())
    return s


def _is_already_canonical(raw):
    """True iff the stored value is EXACTLY a canonical allowlist key (clean)."""
    return raw in ALL_PROVINCES


def _province_from_address(address):
    """Best-effort province from a free-text address: embedded postcode first,
    then a known-municipality scan. Returns (province, signal) or (None, None).
    Never fabricates — both lookups are strict."""
    if not address:
        return None, None
    m = _POSTAL_IN_TEXT_RE.search(address)
    if m:
        p = province_by_code_strict(m.group(1))
        if p:
            return p, "address-postal"
    p = province_from_text(address)   # scans for a known municipality token
    if p:
        return p, "address-municipality"
    return None, None


def resolve_province(cur_prov, bien_prov, bien_loc, postal, address):
    """
    Resolve a dirty row to (new_province_or_None, new_municipality_or_None, signal).

    new_province is None when nothing changes (keep current). signal is one of:
      'sanitize-fold'    Stage A: HTML/noise-stripped value folded to allowlist
      'bienProvincia' | 'postalCode' | 'bienLocalidad'
      'address-postal' | 'address-municipality'   Stage B re-derivation
      'unresolved'       no authoritative signal -> leave Unknown sentinel
    """
    # STAGE A — sanitize + fold the EXISTING province string.
    cleaned = _sanitize_province_string(cur_prov)
    if cleaned and not _MAPA_RE.match(cleaned):
        folded = canonical_province(cleaned)
        if folded:
            new_muni = canonical_municipality(bien_loc)
            # Only return a province write when it actually changes the column.
            prov_out = folded if folded != cur_prov else None
            muni_out = new_muni if new_muni and new_muni != bien_loc else None
            # muni write decided by caller against current municipality; pass canon.
            return prov_out, new_muni, "sanitize-fold"

    # STAGE B — the value is missing/sentinel/noise. RE-DERIVE.
    # 1. bienProvincia
    p = canonical_province(bien_prov)
    if p:
        return p, canonical_municipality(bien_loc), "bienProvincia"
    # 2. postalCode prefix (strict)
    if postal:
        m = re.match(r"^\s*(\d{2})\d{3}\s*$", str(postal))
        if m:
            p = province_by_code_strict(m.group(1))
            if p:
                return p, canonical_municipality(bien_loc), "postalCode"
    # 3. bienLocalidad -> INE map
    if bien_loc:
        p = municipality_to_province(normalize_municipality(bien_loc))
        if p:
            return p, canonical_municipality(bien_loc), "bienLocalidad"
    # 4 + 5. free-text address (postcode, then known-municipality scan)
    p, sig = _province_from_address(address)
    if p:
        return p, canonical_municipality(bien_loc), sig
    # nothing resolves -> leave the honest Unknown sentinel.
    return None, None, "unresolved"


def run_backfill(apply=False, active_only=False, source=None, limit=None):
    dry_run = not apply
    logger.info("Connecting to Postgres...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # SCOPE: dirty rows only -> province IS NULL OR NOT in the canonical allowlist.
    # We compute the allowlist membership in SQL with a lowered/unaccented compare?
    # No -- the API matches EXACT canonical keys, so a row is "clean" only when its
    # province is EXACTLY a canonical key. Anything else (NULL, lowercase dupe,
    # HTML leak, 'Unknown', 'mapa ...') is in scope. We fetch with a broad SQL
    # predicate (NOT in the exact allowlist) and let resolve_province decide.
    preds = ['(province IS NULL OR province <> ALL(%(allow)s))']
    params = {"allow": list(ALL_PROVINCES.keys())}

    if active_only:
        preds.append('status = ANY(%(statuses)s::"AuctionStatus"[])')
        params["statuses"] = list(ACTIVE_STATUSES)
    if source:
        preds.append("source = %(source)s")
        params["source"] = source
    where = " AND ".join(preds)

    cur.execute(f'SELECT COUNT(*) FROM "Auction" WHERE {where}', params)
    total = cur.fetchone()[0]
    logger.info(f"Dirty rows in scope: {total:,} "
                f"(active_only={active_only}, source={source or 'ALL'})")

    BATCH = 2000
    last_id = ""
    scanned = 0
    by_signal = Counter()       # how each row resolved
    by_source = Counter()       # CHANGED rows per source
    by_target = Counter()       # CHANGED rows per resulting province
    unresolved_by_source = Counter()
    muni_set = 0
    sample = []                 # (boeId, old, new, signal) preview

    while True:
        p = dict(params)
        p["last_id"] = last_id
        p["lim"] = BATCH
        cur.execute(
            f'''
            SELECT id, "boeId", source, province, municipality,
                   "bienProvincia", "bienLocalidad", "postalCode", address
            FROM "Auction"
            WHERE {where} AND id > %(last_id)s
            ORDER BY id
            LIMIT %(lim)s
            ''',
            p,
        )
        rows = cur.fetchall()
        if not rows:
            break

        updates = []  # (province_or_None, municipality_or_None, id)

        for (rid, boe_id, src, cur_prov, cur_muni,
             bien_prov, bien_loc, postal, address) in rows:
            scanned += 1
            src = src or "?"

            new_prov, new_muni_canon, signal = resolve_province(
                cur_prov, bien_prov, bien_loc, postal, address
            )
            by_signal[signal] += 1

            prov_to_write = new_prov  # None when unchanged / unresolved
            muni_to_write = None
            if new_muni_canon and new_muni_canon != cur_muni:
                muni_to_write = new_muni_canon

            if signal == "unresolved":
                unresolved_by_source[src] += 1

            if prov_to_write is not None:
                by_source[src] += 1
                by_target[prov_to_write] += 1
                if len(sample) < 40:
                    sample.append((boe_id, cur_prov, prov_to_write, signal))
            if muni_to_write is not None:
                muni_set += 1

            if prov_to_write is not None or muni_to_write is not None:
                updates.append((prov_to_write, muni_to_write, rid))

        last_id = rows[-1][0]

        if updates and apply:
            # COALESCE keeps the existing column when this row only changes the
            # other one. updatedAt bumped so downstream geocode/refresh notices.
            psycopg2.extras.execute_batch(
                cur,
                '''
                UPDATE "Auction"
                SET province = COALESCE(%s, province),
                    municipality = COALESCE(%s, municipality),
                    "updatedAt" = NOW()
                WHERE id = %s
                ''',
                updates,
                page_size=500,
            )
            conn.commit()

        if scanned and scanned % 10000 < BATCH:
            logger.info(f"  ...{scanned:,}/{total:,} scanned")

        if limit and scanned >= limit:
            logger.info(f"--limit {limit} reached, stopping.")
            break

    total_changed = sum(by_source.values())
    logger.info("=" * 64)
    logger.info("Province normalization backfill complete")
    logger.info(f"  Mode:                   {'APPLY (written)' if apply else 'DRY RUN (no writes)'}")
    logger.info(f"  Rows scanned (dirty):   {scanned:,}")
    logger.info(f"  Province RECOVERED:     {total_changed:,}")
    logger.info(f"  Municipality also set:  {muni_set:,}")
    logger.info(f"  Left Unknown (honest):  {by_signal.get('unresolved', 0):,}")
    logger.info("  --- recovered by signal ---")
    for sig, n in by_signal.most_common():
        if sig == "unresolved":
            continue
        logger.info(f"    {sig:<22} {n:,}")
    logger.info("  --- recovered by source ---")
    for s, n in by_source.most_common():
        logger.info(f"    {s:<12} {n:,}")
    logger.info("  --- still-Unknown by source ---")
    for s, n in unresolved_by_source.most_common():
        logger.info(f"    {s:<12} {n:,}")
    logger.info("  --- top 25 target provinces ---")
    for prov, n in by_target.most_common(25):
        logger.info(f"    {prov:<26} {n:,}")
    logger.info("  --- sample (boeId : old -> new [signal]) ---")
    for boe_id, old, new, sig in sample[:20]:
        logger.info(f"    {boe_id}: {old!r} -> {new!r} [{sig}]")

    # Post-apply sanity checks (the QC-B acceptance gates).
    if apply:
        for label, sql in (
            ("province = 'madrid' (lowercase dupe)",
             "SELECT COUNT(*) FROM \"Auction\" WHERE province = 'madrid'"),
            ("province LIKE '%</%' OR 'mapa de%'",
             "SELECT COUNT(*) FROM \"Auction\" WHERE province LIKE '%</%' "
             "OR province LIKE 'mapa de%'"),
            ("province IS NULL OR 'Unknown' (residual)",
             "SELECT COUNT(*) FROM \"Auction\" WHERE province IS NULL "
             "OR province = 'Unknown'"),
        ):
            cur.execute(sql)
            logger.info(f"  POST-CHECK {label}: {cur.fetchone()[0]:,}")

    cur.close()
    conn.close()

    if apply:
        try:
            os.makedirs(os.path.dirname(DONE_MARKER), exist_ok=True)
            with open(DONE_MARKER, "w") as f:
                f.write(
                    f"scanned={scanned} recovered={total_changed} "
                    f"muni={muni_set} unresolved={by_signal.get('unresolved', 0)} "
                    f"active_only={active_only} source={source or 'ALL'}\n"
                )
            logger.info(f"Done-marker written: {DONE_MARKER}")
        except OSError as e:
            logger.warning(f"Could not write done-marker ({e}) — non-fatal.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="compute + report only (default when --apply omitted)")
    ap.add_argument("--apply", action="store_true",
                    help="actually write the UPDATEs")
    ap.add_argument("--active-only", action="store_true",
                    help="restrict to live rows (the 144-row smoke test)")
    ap.add_argument("--source", default=None,
                    help="restrict to one source: BOE | PLABI | SEGSOCIAL")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    if args.apply and args.dry_run:
        logger.error("Pass either --dry-run OR --apply, not both.")
        sys.exit(2)
    if not args.apply:
        logger.info("DRY RUN mode — no changes will be written (pass --apply to write)")
    run_backfill(
        apply=args.apply,
        active_only=args.active_only,
        source=args.source,
        limit=args.limit,
    )
