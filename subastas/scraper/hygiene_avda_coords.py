#!/usr/bin/env python3
"""
'Avda' junk-address hygiene + stale-centroid clear — 2026-07-10 (Ghost)

Two data-hygiene items (Ken dispatch, Dennis GO 2026-07-10):

1. address='Avda' sentinel junk (old-extractor leftover; ~8,266 BOE / 155 TEJU
   / 32 PLABI / 46 SS rows). Junk must never render:
     - ACTIVE source='BOE' rows: refetch the BOE detail page (same fetch path
       as backfill_address_396, incl. _strip_login_footer sanitizer). Real
       address -> write it (+ lotDescription/cadastral when present) and clear
       latitude/longitude/geocodeAttemptedAt so geocode-drain re-pins for
       real. No yield -> address=NULL (honest) + coords cleared (active row:
       drain town-fallback re-pins the municipality centroid within its
       cadence).
     - ENDED/archived BOE rows: NULL-only, NO refetch (gated on the
       sample-ended check below), coords KEPT (drain is active-only; clearing
       would leave ended rows unpinned forever — a coarse pin beats none).
     - TEJU / PLABI / SS rows: NULL-only, NEVER fetched (no BOE detail page —
       that is exactly how the 'Avda' junk got written; see 2d072bf).
       Active rows also get coords + geocodeAttemptedAt cleared (the coords
       were geocoded from the junk 'Avda' string and are not trustworthy;
       drain re-pins town centroid). Ended rows keep coords.

2. ~341 rows from the original 396 address-backfill pool that the wave122
   scheduler organically re-addressed — real address now, but the centroid-era
   latitude/longitude + geocodeAttemptedAt were never cleared, so they stay
   pinned at the town centroid forever (drain only revisits latitude-IS-NULL
   rows). No stored marker distinguishes a centroid pin, so the pool is
   selected by:
     - source='BOE', ACTIVE, real address (NOT NULL, <> '', <> 'Avda'),
       latitude/longitude NOT NULL,
     - geocodeAttemptedAt inside the regression window
       [--since 2026-06-08, --until 2026-07-09) (3f2ea9c deploy era ->
       wave122 fix deploy), i.e. geocoded while the address was NULL,
     - by default ALSO requires the (latitude,longitude) pair to be SHARED by
       >=2 rows in the table (town-fallback writes the identical municipality
       centroid for every row in a town; real-address geocodes are unique).
       --no-shared-coords drops that refinement if leg-2 dry-run counts show
       it under-selects (window-only count is also reported).
   Clearing an over-selected row is self-healing: address is real, so the
   drain main pass re-pins it properly on the next cycle. Address UNTOUCHED.

MODES (one per invocation; each has its own checkpoint + .done marker):
  --mode sample-ended   READ-ONLY leg-2 gate: fetch N (default 10)
                        CONCLUIDA_PORTAL BOE 'Avda' detail pages; verdict
                        PAGES_GONE (safe to NULL-only) or PAGES_ALIVE
                        (STOP AND REPORT — do NOT run null mode on BOE ended).
  --mode refetch        Item 1, ACTIVE source='BOE' bucket (jittered fetches).
  --mode null           Item 1, all NULL-only buckets (batched SQL). Touching
                        the BOE-ended bucket requires --confirm-ended-gone
                        (set it only after sample-ended says PAGES_GONE).
  --mode coords341      Item 2.
  --dry-run             With any mode (counts + sample boeIds, ZERO writes),
                        or alone (full per-bucket report across all modes).

Run inside the scheduler container (playwright + DATABASE_URL), workdir /app:
  python3 -u hygiene_avda_coords.py --dry-run
  python3 -u hygiene_avda_coords.py --mode sample-ended
  python3 -u hygiene_avda_coords.py --mode refetch
  python3 -u hygiene_avda_coords.py --mode null --confirm-ended-gone
  python3 -u hygiene_avda_coords.py --mode coords341
Options: --max-rows N, --since/--until ISO-date (coords341 window),
  --no-shared-coords, --sample-size N (sample-ended),
  HYGIENE_AVDA_CHECKPOINT_DIR=dir (default /tmp).

The junk predicate is EXACT address = 'Avda'. Dry-run additionally reports any
near-variants (e.g. 'Avda.', 'Avda ') so leg 2 can decide whether to widen —
this script never mutates variants on its own.
"""

import os
import sys
import json
import time
import random
import argparse
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

AVDA = "Avda"
ACTIVE_STATUSES = ("CELEBRANDOSE", "ACTIVE", "PROXIMA_APERTURA", "SUSPENDIDA")
NON_BOE_SOURCES = ("TEJU", "PLABI", "SEGSOCIAL")
# Regression window for the coords341 pool (see module docstring).
DEFAULT_SINCE = "2026-06-08"
DEFAULT_UNTIL = "2026-07-09"

CKPT_DIR = os.environ.get("HYGIENE_AVDA_CHECKPOINT_DIR", "/tmp")


# ---------------------------------------------------------------------------
# Pure decision helpers (unit-tested offline in tests/test_hygiene_avda.py)
# ---------------------------------------------------------------------------

def is_avda_junk(address):
    """The mutation predicate: EXACT sentinel match only."""
    return address == AVDA


def is_avda_variant(address):
    """Near-variant detector (report-only, never mutated by this script):
    short strings that start with 'Avda' case-insensitively but are not the
    exact sentinel and are not a plausible real avenue address (real
    addresses carry a street name, so they are longer than ~12 chars)."""
    if not address or address == AVDA:
        return False
    a = address.strip()
    return a.lower().startswith("avda") and len(a) <= 12


def classify_bucket(source, status, address):
    """Which hygiene bucket does an 'Avda' row belong to?
    Returns one of: 'boe-active-refetch', 'boe-ended-null',
    'nonboe-active-null', 'nonboe-ended-null', or None (not junk)."""
    if not is_avda_junk(address):
        return None
    active = status in ACTIVE_STATUSES
    if source == "BOE":
        return "boe-active-refetch" if active else "boe-ended-null"
    return "nonboe-active-null" if active else "nonboe-ended-null"


def should_clear_coords_on_null(bucket):
    """Coords/geocodeAttemptedAt handling when the address is NULLed:
    - active rows: clear (junk-address geocodes untrustworthy; drain re-pins)
    - ended rows: keep (drain is active-only; a coarse pin beats none)."""
    return bucket in ("boe-active-refetch", "nonboe-active-null")


# ---------------------------------------------------------------------------
# Infrastructure (patterns from backfill_address_396.py)
# ---------------------------------------------------------------------------

def _connect(retries=30, delay=5.0):
    import psycopg2
    last = None
    for attempt in range(1, retries + 1):
        try:
            return psycopg2.connect(os.environ["DATABASE_URL"])
        except psycopg2.OperationalError as e:
            last = e
            logger.warning(f"  connect attempt {attempt}/{retries} failed: {e}")
            time.sleep(delay)
    raise last


def _ckpt_path(mode):
    return os.path.join(CKPT_DIR, f"hygiene_avda.{mode}.checkpoint.json")


def _done_path(mode):
    return os.path.join(CKPT_DIR, f"hygiene_avda.{mode}.done")


def _load_ckpt(mode):
    try:
        with open(_ckpt_path(mode)) as f:
            return set(json.load(f).get("done", []))
    except Exception:
        return set()


def _save_ckpt(mode, done):
    try:
        with open(_ckpt_path(mode), "w") as f:
            json.dump({"done": sorted(done)}, f)
    except Exception as e:
        logger.warning(f"  checkpoint save failed: {e}")


def _mark_done(mode):
    with open(_done_path(mode), "w") as f:
        f.write(datetime.now().isoformat())


def _status_pred(active):
    # status is the Postgres enum "AuctionStatus" — cast the bound text[]
    # (a01890a; text-vs-enum has no = operator).
    op = "= ANY" if active else "<> ALL"
    return f'status {op}(%(statuses)s::"AuctionStatus"[])'


BASE_PARAMS = {"statuses": list(ACTIVE_STATUSES), "avda": AVDA}


# ---------------------------------------------------------------------------
# Bucket SQL (single source of truth for dry-run counts AND mutations)
# ---------------------------------------------------------------------------

def bucket_where(bucket):
    if bucket == "boe-active-refetch":
        return f"address = %(avda)s AND source = 'BOE' AND {_status_pred(True)}"
    if bucket == "boe-ended-null":
        return f"address = %(avda)s AND source = 'BOE' AND {_status_pred(False)}"
    if bucket == "nonboe-active-null":
        return f"address = %(avda)s AND source <> 'BOE' AND {_status_pred(True)}"
    if bucket == "nonboe-ended-null":
        return f"address = %(avda)s AND source <> 'BOE' AND {_status_pred(False)}"
    raise ValueError(bucket)


def coords341_where(shared_coords, since, until):
    base = f"""source = 'BOE'
          AND {_status_pred(True)}
          AND address IS NOT NULL AND btrim(address) <> '' AND address <> %(avda)s
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND "geocodeAttemptedAt" >= %(since)s::timestamp
          AND "geocodeAttemptedAt" < %(until)s::timestamp"""
    if shared_coords:
        base += """
          AND (latitude, longitude) IN (
                SELECT latitude, longitude FROM "Auction"
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                GROUP BY latitude, longitude HAVING COUNT(*) >= 2)"""
    return base


def _count_and_sample(cur, where, params, sample=5):
    cur.execute(f'SELECT COUNT(*) FROM "Auction" WHERE {where}', params)
    n = cur.fetchone()[0]
    cur.execute(
        f'SELECT "boeId" FROM "Auction" WHERE {where} ORDER BY "boeId" LIMIT {sample}',
        params,
    )
    return n, [r[0] for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------

def run_dry_run_report(cur, args):
    params = dict(BASE_PARAMS, since=args.since, until=args.until)
    logger.info("=== DRY-RUN REPORT (zero writes) ===")
    for bucket in ("boe-active-refetch", "boe-ended-null",
                   "nonboe-active-null", "nonboe-ended-null"):
        n, ids = _count_and_sample(cur, bucket_where(bucket), params)
        logger.info(f"  {bucket}: {n:,} rows  sample={ids}")

    # per-source split of the non-BOE junk
    cur.execute(
        'SELECT source, COUNT(*) FROM "Auction" WHERE address = %(avda)s '
        "GROUP BY source ORDER BY 2 DESC", params)
    logger.info(f"  avda-by-source: {cur.fetchall()}")

    # near-variant report (report-only; never mutated)
    cur.execute(
        'SELECT address, COUNT(*) FROM "Auction" '
        "WHERE lower(btrim(address)) LIKE 'avda%%' AND address <> %(avda)s "
        "AND length(btrim(address)) <= 12 GROUP BY address ORDER BY 2 DESC LIMIT 20",
        params)
    variants = cur.fetchall()
    if variants:
        logger.info(f"  NEAR-VARIANTS FOUND (not mutated; leg-2 decision): {variants}")
    else:
        logger.info("  near-variants: none")

    # coords341 pool, both selectors
    for label, shared in (("window+shared-coords (default)", True),
                          ("window-only", False)):
        n, ids = _count_and_sample(cur, coords341_where(shared, args.since, args.until), params)
        logger.info(f"  coords341 [{label}]: {n:,} rows  sample={ids}")
    logger.info(f"  coords341 window: [{args.since}, {args.until})  expected ~341")
    logger.info("=== END DRY-RUN REPORT ===")


def run_sample_ended(cur, args):
    """READ-ONLY leg-2 gate: do ended BOE 'Avda' pages still serve detail?"""
    params = dict(BASE_PARAMS)
    cur.execute(
        f"""SELECT "boeId" FROM "Auction"
            WHERE {bucket_where('boe-ended-null')} AND status = 'CONCLUIDA_PORTAL'
            ORDER BY "updatedAt" DESC LIMIT %(n)s""",
        dict(params, n=args.sample_size))
    ids = [r[0] for r in cur.fetchall()]
    if not ids:
        logger.info("  no CONCLUIDA_PORTAL BOE 'Avda' rows found; nothing to sample")
        return
    os.environ.setdefault("BOE_FETCH_DETAIL", "1")
    sys.path.insert(0, "/")
    from app.scrapers.boe_scraper import BOEScraper, extract_address
    scraper = BOEScraper()
    alive = 0
    for i, boe_id in enumerate(ids, 1):
        try:
            info = scraper._fetch_detail_info(boe_id)
            addr = info.get("address") or extract_address(info.get("bienes_info"))
            usable = bool(addr or info.get("bienes_info"))
            alive += 1 if usable else 0
            logger.info(f"  [{i}/{len(ids)}] {boe_id}: "
                        f"{'ALIVE addr=' + repr(addr)[:80] if usable else 'gone/empty'}")
        except Exception as e:
            logger.info(f"  [{i}/{len(ids)}] {boe_id}: fetch failed ({e})")
        time.sleep(random.uniform(1.0, 2.0))
    if alive:
        logger.info(f"  VERDICT: PAGES_ALIVE ({alive}/{len(ids)} usable) — "
                    "STOP AND REPORT to Ken; do NOT run null mode with "
                    "--confirm-ended-gone until cost/benefit is decided.")
    else:
        logger.info(f"  VERDICT: PAGES_GONE (0/{len(ids)} usable) — safe to run "
                    "--mode null --confirm-ended-gone")


def run_null(cur, conn, args):
    """Batched SQL NULL legs. Idempotent (predicate self-clears)."""
    params = dict(BASE_PARAMS)
    buckets = ["nonboe-active-null", "nonboe-ended-null"]
    if args.confirm_ended_gone:
        buckets.append("boe-ended-null")
    else:
        logger.info("  boe-ended-null SKIPPED (needs --confirm-ended-gone after "
                    "a PAGES_GONE sample-ended verdict)")
    total = 0
    for bucket in buckets:
        where = bucket_where(bucket)
        set_clause = "address = NULL"
        if should_clear_coords_on_null(bucket):
            set_clause += (", latitude = NULL, longitude = NULL, "
                           '"geocodeAttemptedAt" = NULL')
        set_clause += ', "updatedAt" = NOW()'
        n, ids = _count_and_sample(cur, where, params)
        logger.info(f"  {bucket}: {n:,} rows -> "
                    f"{'NULL addr + clear coords' if should_clear_coords_on_null(bucket) else 'NULL addr only'}"
                    f"  sample={ids}")
        if args.dry_run or n == 0:
            continue
        limit = f'AND "boeId" IN (SELECT "boeId" FROM "Auction" WHERE {where} LIMIT {args.max_rows})' \
            if args.max_rows else ""
        cur.execute(f'UPDATE "Auction" SET {set_clause} WHERE {where} {limit}', params)
        logger.info(f"  {bucket}: UPDATED {cur.rowcount:,}")
        conn.commit()
        total += cur.rowcount
    logger.info(f"  NULL legs done: {total:,} rows updated (dry_run={args.dry_run})")
    if not args.dry_run:
        _mark_done("null")


def run_coords341(cur, conn, args):
    """Clear stale centroid coords on the organically-fixed pool. Address
    untouched. Idempotent: geocodeAttemptedAt=NULL drops rows from the pool."""
    params = dict(BASE_PARAMS, since=args.since, until=args.until)
    where = coords341_where(not args.no_shared_coords, args.since, args.until)
    n, ids = _count_and_sample(cur, where, params, sample=10)
    logger.info(f"  coords341 pool ({'window-only' if args.no_shared_coords else 'window+shared-coords'}, "
                f"[{args.since},{args.until})): {n:,} rows  sample={ids}")
    if n > 800:
        logger.warning("  pool is >2x the expected ~341 — selector likely "
                       "over-broad. Refusing to mutate; re-run dry-run, tighten "
                       "--since/--until, and report to Ken. (--force overrides.)")
        if not args.force:
            return
    if args.dry_run or n == 0:
        return
    limit = f'AND "boeId" IN (SELECT "boeId" FROM "Auction" WHERE {where} LIMIT {args.max_rows})' \
        if args.max_rows else ""
    cur.execute(
        f'''UPDATE "Auction" SET latitude = NULL, longitude = NULL,
            "geocodeAttemptedAt" = NULL, "updatedAt" = NOW()
            WHERE {where} {limit}''', params)
    logger.info(f"  coords341: UPDATED {cur.rowcount:,} (drain re-pins from real address)")
    conn.commit()
    if not args.max_rows:
        _mark_done("coords341")


def run_refetch(cur, conn, args):
    """ACTIVE source='BOE' 'Avda' rows: jittered refetch, same path/behavior
    as backfill_address_396 (incl. its 11cfe0e/2d072bf fixes). Whatever the
    fetch yields, the junk 'Avda' never survives: real address or NULL."""
    import psycopg2
    params = dict(BASE_PARAMS)
    cur.execute(
        f'SELECT "boeId" FROM "Auction" WHERE {bucket_where("boe-active-refetch")} '
        'ORDER BY "boeId" ASC', params)
    boe_ids = [r[0] for r in cur.fetchall()]
    logger.info(f"  {len(boe_ids):,} active BOE 'Avda' rows (re-queried live)")
    done = _load_ckpt("refetch")
    if done:
        logger.info(f"  resuming: {len(done):,} already done per checkpoint")
    queue = [b for b in boe_ids if b not in done]
    if args.max_rows:
        queue = queue[: args.max_rows]
    logger.info(f"  {len(queue):,} this run (cap={args.max_rows}, dry_run={args.dry_run})")
    if not queue:
        logger.info("  QUEUE_EMPTY")
        return
    if args.dry_run:
        logger.info(f"  dry-run: would refetch {len(queue):,}; sample={queue[:10]}")
        return

    os.environ.setdefault("BOE_FETCH_DETAIL", "1")
    sys.path.insert(0, "/")
    from app.scrapers.boe_scraper import BOEScraper, extract_address
    scraper = BOEScraper()

    populated = nulled = errors = 0
    for i, boe_id in enumerate(queue, 1):
        try:
            addr = None
            updates = {}
            try:
                info = scraper._fetch_detail_info(boe_id)
                addr = info.get("address") or extract_address(info.get("bienes_info"))
                if addr == AVDA:          # never re-write the sentinel
                    addr = None
                if info.get("bienes_info"):
                    updates['"lotDescription"'] = info["bienes_info"]
                if info.get("cadastral_ref"):
                    updates['"cadastralRef"'] = info["cadastral_ref"]
                if info.get("cadastral_data"):
                    cd = info["cadastral_data"]
                    updates['"cadastralData"'] = cd if isinstance(cd, str) else json.dumps(cd)
            except Exception as fe:
                errors += 1
                logger.warning(f"  [{i}/{len(queue)}] {boe_id} fetch failed ({fe}) "
                               "-> junk still NULLed")
            # Junk never survives: real address or NULL. Either way the
            # coords (geocoded off 'Avda') are untrustworthy -> clear; row is
            # ACTIVE so drain re-pins (real address or town centroid).
            updates["address"] = addr  # None -> NULL
            if addr:
                populated += 1
                logger.info(f"  [{i}/{len(queue)}] {boe_id} ADDRESS: {addr[:80]}")
            else:
                nulled += 1
                logger.info(f"  [{i}/{len(queue)}] {boe_id} no address -> NULL (honest)")
            set_clause = ", ".join(f"{k} = %s" for k in updates)
            set_clause += (', latitude = NULL, longitude = NULL, '
                           '"geocodeAttemptedAt" = NULL, "updatedAt" = NOW()')
            vals = tuple(list(updates.values()) + [boe_id])
            try:
                cur.execute(f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s', vals)
                conn.commit()
            except psycopg2.OperationalError:
                logger.warning("  DB connection lost; reconnecting...")
                conn = _connect(); conn.autocommit = False; cur = conn.cursor()
                cur.execute(f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s', vals)
                conn.commit()
            except Exception:
                conn.rollback()   # 11cfe0e lesson: never poison the shared txn
                raise
            done.add(boe_id)
            if i % 25 == 0:
                _save_ckpt("refetch", done)
                logger.info(f"  progress {i}/{len(queue)}: populated={populated} "
                            f"nulled={nulled} errors={errors}")
            time.sleep(random.uniform(1.0, 2.0))
        except Exception as e:
            errors += 1
            logger.warning(f"  row failed for {boe_id}: {e}")
            try:
                conn.rollback()
            except Exception:
                pass
    _save_ckpt("refetch", done)
    logger.info(f"  REFETCH DONE: populated={populated} nulled={nulled} "
                f"errors={errors} (dry_run={args.dry_run})")
    if not queue or (not args.max_rows and errors == 0):
        _mark_done("refetch")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mode", choices=["sample-ended", "refetch", "null", "coords341"])
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--max-rows", type=int)
    p.add_argument("--since", default=DEFAULT_SINCE)
    p.add_argument("--until", default=DEFAULT_UNTIL)
    p.add_argument("--no-shared-coords", action="store_true")
    p.add_argument("--confirm-ended-gone", action="store_true")
    p.add_argument("--sample-size", type=int, default=10)
    p.add_argument("--force", action="store_true")
    args = p.parse_args()

    if not args.mode and not args.dry_run:
        p.error("pick --mode, or --dry-run for the full report")

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url or db_url.startswith("file:"):
        logger.error("DATABASE_URL must be a Postgres URL.")
        sys.exit(1)

    conn = _connect()
    conn.autocommit = False
    cur = conn.cursor()

    if not args.mode:
        run_dry_run_report(cur, args)
    elif args.mode == "sample-ended":
        run_sample_ended(cur, args)
    elif args.mode == "null":
        run_null(cur, conn, args)
    elif args.mode == "coords341":
        run_coords341(cur, conn, args)
    elif args.mode == "refetch":
        run_refetch(cur, conn, args)
    conn.close()


if __name__ == "__main__":
    main()
