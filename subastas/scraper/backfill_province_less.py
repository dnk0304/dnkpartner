#!/usr/bin/env python3
"""
backfill_province_less.py — SURGICAL province backfill for province-LESS rows.

Fixes the ~29k `inScope=true` rows whose `province` column is EMPTY / junk
('', 'Unknown', 'desconocida', sentinels, length<=1) so the home "TOTAL SUBASTAS"
headline and the province grid stop dropping them. Derives the REAL province ONLY
from signals the scraper already captured, reusing the SAME helper the scraper and
the operational backfill use (`derive_property_province`) so the logic can never
drift:

    1. bienProvincia   (BOE "Datos del bien → Provincia", most reliable)
    2. postalCode       (first 2 digits = INE province code, strict)
    3. bienLocalidad    (real town -> INE municipality->province map)
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
# Import is tried across the three known run layouts:
#   1. cwd = subastas/          -> `scraper.*`   (repo + pytest convention)
#   2. cwd = subastas/scraper/  -> `scrapers.*`  (legacy operational-script cwd)
#   3. /app container           -> `app.*`
canonical_province = None
derive_property_province = None
for _prov_mod, _boe_mod in (
    ("scraper.config.provinces", "scraper.scrapers.boe_scraper"),
    ("config.provinces", "scrapers.boe_scraper"),
    ("app.config.provinces", "app.scrapers.boe_scraper"),
):
    try:
        canonical_province = __import__(_prov_mod, fromlist=["canonical_province"]).canonical_province
        derive_property_province = __import__(_boe_mod, fromlist=["derive_property_province"]).derive_property_province
        break
    except ImportError:
        continue
if canonical_province is None or derive_property_province is None:
    logger.error(
        "Could not import derivation helpers. Run from subastas/ (as `scraper` "
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


def classify_province_less(bien_prov, postal, bien_loc, cur_prov):
    """
    Decide whether a province-less row is FILLABLE and, if so, with which real
    province and from which source. Pure — the single decision the backfill makes,
    exposed for unit testing.

    Returns (province, source) when an AUTHORITATIVE signal (bienProvincia /
    postalCode / bienLocalidad) resolves to a REAL canonical province; otherwise
    (None, None) = genuinely unknowable, leave the row untouched. NEVER guesses:
    a 'court-fallback' result or a non-canonical province is treated as unknowable.
    """
    new_prov, src = derive_property_province(bien_prov, postal, bien_loc, cur_prov)
    if src in ("bienProvincia", "postalCode", "bienLocalidad") and new_prov and canonical_province(new_prov):
        return new_prov, src
    return None, None


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
    by_source = {"bienProvincia": 0, "postalCode": 0, "bienLocalidad": 0}
    audit_fh = None
    if not dry_run:
        os.makedirs(os.path.dirname(audit_path), exist_ok=True) if os.path.dirname(audit_path) else None
        audit_fh = open(audit_path, "a", encoding="utf-8")
        logger.info(f"Audit log (append): {audit_path}")

    while True:
        cur.execute(
            f'''
            SELECT id, "boeId", province, "bienProvincia", "bienLocalidad", "postalCode"
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

        for rid, boe_id, cur_prov, bien_prov, bien_loc, postal in rows:
            scanned += 1
            new_prov, src = classify_province_less(bien_prov, postal, bien_loc, cur_prov)

            # Fillable ONLY when an authoritative signal resolved to a REAL
            # canonical province. court-fallback (or a non-canonical result) means
            # nothing authoritative was captured -> genuinely unknowable, leave it.
            if src is not None:
                fillable += 1
                by_source[src] += 1
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
    logger.info(f"  Rows scanned (province-less):   {scanned:,}")
    logger.info(f"  FILLABLE (real province found): {fillable:,}")
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
