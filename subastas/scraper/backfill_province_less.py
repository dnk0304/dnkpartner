#!/usr/bin/env python3
"""
backfill_province_less.py — SURGICAL province backfill for province-LESS rows.

Fixes the ~35.7k `inScope=true` rows whose `province` column is EMPTY / junk
('', 'Unknown', 'desconocida', sentinels, length<=1) so the home "TOTAL SUBASTAS"
headline and the province grid stop dropping them.

Ken's prod dry-run (2026-07-28) proved the earlier bien*/postal derivation filled
only 13/35,740 — those structured columns are EMPTY on these rows. The recoverable
signal is in `address` (populated on 93%) and `municipality`. Derivation now reads,
via the SHARED resolve_province_less() (the SAME helper the ingestion path uses so
a backfilled row and a freshly-ingested row resolve identically):

    1. address       -> postal code / explicit province / town->province map
    2. municipality  -> INE town->province map
    3. bienProvincia -> postalCode -> bienLocalidad   (structured fallbacks)
    -> otherwise LEFT UNTOUCHED and reported as UNKNOWABLE. NEVER fabricates.

How this differs from the broader `backfill_province_municipality.py` (which
re-derives province for EVERY row and also rewrites municipality/casing):
    - TARGETS ONLY province-less rows (tight blast radius — never touches a row
      that already has a valid province).
    - Writes ONLY the `province` column (never municipality).
    - dry-run is the DEFAULT (must pass --apply to write).
    - Fully REVERSIBLE via an append-only audit log (--revert).

Contract:
    python3 backfill_province_less.py                 # DRY RUN (default) — reports only
    python3 backfill_province_less.py --apply         # writes province + audit log
    python3 backfill_province_less.py --revert         # restores from the audit log
    python3 backfill_province_less.py --limit 5000    # cap rows scanned (testing)
    python3 backfill_province_less.py --audit PATH     # override audit-log path

Idempotent:
    - Re-running --apply is safe: a row filled on a prior run no longer matches the
      junk-province predicate, so it is not re-processed.
    - --revert only restores rows whose province STILL equals the value this script
      wrote (guards against clobbering a later legitimate edit); re-running --revert
      is a no-op.

Reads DATABASE_URL (Postgres). NO migration (province column exists).
"""

import os
import sys
import json
import argparse
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

# Make the derivation helpers importable no matter how this file is launched:
#   - `_here`   = subastas/scraper/   -> enables `config.*` / `scrapers.*`
#   - `_parent` = subastas/ (or /app) -> enables `scraper.*` / `app.*`
_here = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
for _p in (_parent, _here):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    logger.error("psycopg2 not installed. pip install psycopg2-binary")
    sys.exit(1)

# Reuse the EXACT derivation helper the scraper + operational backfill use, so
# the province we write here is identical to what those paths would write.
# Import the derivation from the LIGHT config module (no scraper/browser stack).
# Ken's prod dry-run (2026-07-28) proved the province-less rows have EMPTY
# bien*/postal fields but a POPULATED `address` (93%) / `municipality`, so the
# derivation now reads address -> municipality -> bien* via resolve_province_less
# (the SAME helper the ingestion path uses). Tried across the three run layouts:
#   1. cwd = subastas/          -> `scraper.*`   (repo + pytest convention)
#   2. cwd = subastas/scraper/  -> `config.*`    (legacy operational-script cwd)
#   3. /app container           -> `app.*`
resolve_province_less = None
for _mp_mod in ("scraper.config.municipality_province",
                "config.municipality_province",
                "app.config.municipality_province"):
    try:
        resolve_province_less = __import__(_mp_mod, fromlist=["resolve_province_less"]).resolve_province_less
        break
    except ImportError:
        continue
if resolve_province_less is None:
    logger.error(
        "Could not import resolve_province_less. Run from subastas/ (as `scraper` "
        "package), subastas/scraper/, or the /app container."
    )
    sys.exit(1)

def _get_db_url():
    """Resolve + validate DATABASE_URL. Lazy (not at import) so the pure
    classifier can be unit-tested without a Postgres URL in the environment."""
    url = os.environ.get("DATABASE_URL", "")
    if not url or url.startswith("file:"):
        logger.error("DATABASE_URL must be a Postgres URL. Set DATABASE_URL env var.")
        sys.exit(1)
    return url


DEFAULT_AUDIT = os.environ.get(
    "PROVINCE_LESS_AUDIT",
    "/data/dnksubastas-deploy/scheduler-logs/backfill_province_less_audit.jsonl",
)

# The junk / empty province predicate — the EXACT inverse of the app's
# `isValidProvince` (src/app/api/auctions/counts/route.ts). A row matches when its
# province is one the catalog surfaces already treat as "no province". Only
# inScope rows are touched (soft-hidden junk is out of the catalog anyway).
JUNK_PROVINCE_SQL = """
    "inScope" = true
    AND (
        province IS NULL
        OR LENGTH(TRIM(province)) <= 1
        OR LOWER(TRIM(province)) IN (
            'unknown', 'desconocida', 'mapa de la zona',
            'mapa del municipio', 'null', 'undefined'
        )
    )
"""


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# Sources the backfill reports (in derivation priority order).
SOURCE_KEYS = (
    "address-postal", "address-province", "address-town",  # from `address`
    "municipality",                                        # from `municipality`
    "bienProvincia", "postalCode", "bienLocalidad",        # structured fallbacks
)


def classify_province_less(address=None, municipality=None, bien_provincia=None,
                           postal_code=None, bien_localidad=None, court_province=None):
    """
    Decide whether a province-less row is FILLABLE and, if so, with which real
    province and from which source. Thin wrapper over the shared
    resolve_province_less (the SAME logic ingestion uses) — exposed for unit
    testing. Returns (province, source) or (None, None) = UNKNOWABLE, leave the
    row untouched. NEVER guesses (no confident signal -> unknowable).
    """
    return resolve_province_less(
        address=address, municipality=municipality, bien_provincia=bien_provincia,
        postal_code=postal_code, bien_localidad=bien_localidad,
        court_province=court_province,
    )


def run_apply(dry_run=True, limit=None, audit_path=DEFAULT_AUDIT):
    mode = "DRY RUN (no writes)" if dry_run else "APPLY (writing)"
    logger.info(f"Mode: {mode}")
    conn = psycopg2.connect(_get_db_url())
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute(f'SELECT COUNT(*) FROM "Auction" WHERE {JUNK_PROVINCE_SQL}')
    total_junk = cur.fetchone()[0]
    logger.info(f"Province-less inScope rows in scope: {total_junk:,}")

    # id-cursor pagination — stable under in-place UPDATEs (an updated row drops
    # out of the junk predicate; walking id ascending never skips or re-reads).
    BATCH = 2000
    last_id = ""
    scanned = 0
    fillable = 0
    unknowable = 0
    by_source = {k: 0 for k in SOURCE_KEYS}
    audit_fh = None
    if not dry_run:
        os.makedirs(os.path.dirname(audit_path), exist_ok=True) if os.path.dirname(audit_path) else None
        audit_fh = open(audit_path, "a", encoding="utf-8")
        logger.info(f"Audit log (append): {audit_path}")

    while True:
        cur.execute(
            f'''
            SELECT id, "boeId", province, address, municipality,
                   "bienProvincia", "bienLocalidad", "postalCode"
            FROM "Auction"
            WHERE {JUNK_PROVINCE_SQL} AND id > %s
            ORDER BY id
            LIMIT %s
            ''',
            (last_id, BATCH),
        )
        rows = cur.fetchall()
        if not rows:
            break

        updates = []  # (new_province, id)
        audit_lines = []

        for rid, boe_id, cur_prov, address, municipality, bien_prov, bien_loc, postal in rows:
            scanned += 1
            new_prov, src = classify_province_less(
                address=address, municipality=municipality,
                bien_provincia=bien_prov, postal_code=postal,
                bien_localidad=bien_loc, court_province=cur_prov,
            )

            # Fillable ONLY when a confident signal (address / municipality /
            # bien*) resolved to a REAL canonical province. No signal -> genuinely
            # unknowable, leave it untouched (never guess).
            if src is not None:
                fillable += 1
                by_source[src] = by_source.get(src, 0) + 1
                updates.append((new_prov, rid))
                audit_lines.append(json.dumps({
                    "id": rid, "boeId": boe_id, "old": cur_prov,
                    "new": new_prov, "src": src, "ts": _now_iso(),
                }, ensure_ascii=False))
            else:
                unknowable += 1

        last_id = rows[-1][0]

        if updates and not dry_run:
            psycopg2.extras.execute_batch(
                cur,
                'UPDATE "Auction" SET province = %s, "updatedAt" = NOW() WHERE id = %s',
                updates,
                page_size=500,
            )
            conn.commit()
            for line in audit_lines:
                audit_fh.write(line + "\n")
            audit_fh.flush()

        if limit and scanned >= limit:
            logger.info(f"--limit {limit} reached, stopping.")
            break

    if audit_fh:
        audit_fh.close()

    logger.info("=" * 64)
    logger.info("Province-less backfill complete")
    addr_total = by_source['address-postal'] + by_source['address-province'] + by_source['address-town']
    logger.info(f"  Rows scanned (province-less):   {scanned:,}")
    logger.info(f"  FILLABLE (real province found): {fillable:,}")
    logger.info(f"    via address (total):          {addr_total:,}")
    logger.info(f"      - address postal code:      {by_source['address-postal']:,}")
    logger.info(f"      - address province name:    {by_source['address-province']:,}")
    logger.info(f"      - address town->province:   {by_source['address-town']:,}")
    logger.info(f"    via municipality:             {by_source['municipality']:,}")
    logger.info(f"    via bienProvincia:            {by_source['bienProvincia']:,}")
    logger.info(f"    via postalCode:               {by_source['postalCode']:,}")
    logger.info(f"    via bienLocalidad:            {by_source['bienLocalidad']:,}")
    logger.info(f"  UNKNOWABLE (no signal, left):   {unknowable:,}")
    if dry_run:
        logger.info("  (DRY RUN — nothing written. Re-run with --apply to write.)")

    cur.close()
    conn.close()
    return {"scanned": scanned, "fillable": fillable, "unknowable": unknowable, "by_source": by_source}


def run_revert(audit_path=DEFAULT_AUDIT, limit=None):
    logger.info(f"REVERT from audit log: {audit_path}")
    if not os.path.exists(audit_path):
        logger.error(f"Audit log not found: {audit_path} — nothing to revert.")
        sys.exit(1)

    conn = psycopg2.connect(_get_db_url())
    conn.autocommit = False
    cur = conn.cursor()

    reverted = 0
    skipped = 0  # province no longer equals what we wrote -> respect later edits
    parsed = 0
    with open(audit_path, "r", encoding="utf-8") as fh:
        batch = []
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                rec = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning(f"Skipping malformed audit line: {raw[:80]}")
                continue
            parsed += 1
            # Restore old province ONLY where province STILL equals the value we
            # wrote (idempotent + safe against later legitimate edits). NULL old
            # restores to NULL. old '' restores to '' — original state preserved.
            batch.append((rec.get("old"), rec["id"], rec["new"]))
            if len(batch) >= 500:
                reverted, skipped = _flush_revert(cur, conn, batch, reverted, skipped)
                batch = []
            if limit and parsed >= limit:
                break
        if batch:
            reverted, skipped = _flush_revert(cur, conn, batch, reverted, skipped)

    logger.info("=" * 64)
    logger.info("Revert complete")
    logger.info(f"  Audit records parsed: {parsed:,}")
    logger.info(f"  Rows reverted:        {reverted:,}")
    logger.info(f"  Skipped (changed since): {skipped:,}")
    cur.close()
    conn.close()


def _flush_revert(cur, conn, batch, reverted, skipped):
    for old, rid, new in batch:
        cur.execute(
            'UPDATE "Auction" SET province = %s, "updatedAt" = NOW() '
            'WHERE id = %s AND province = %s',
            (old, rid, new),
        )
        if cur.rowcount == 1:
            reverted += 1
        else:
            skipped += 1
    conn.commit()
    return reverted, skipped


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Surgical province backfill for province-less rows.")
    ap.add_argument("--apply", action="store_true", help="write changes (default is dry-run)")
    ap.add_argument("--revert", action="store_true", help="undo a prior --apply from the audit log")
    ap.add_argument("--limit", type=int, default=None, help="cap rows scanned/reverted (testing)")
    ap.add_argument("--audit", default=DEFAULT_AUDIT, help="audit-log path (JSONL)")
    args = ap.parse_args()

    if args.revert:
        run_revert(audit_path=args.audit, limit=args.limit)
    else:
        run_apply(dry_run=not args.apply, limit=args.limit, audit_path=args.audit)
