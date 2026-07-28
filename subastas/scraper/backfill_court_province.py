#!/usr/bin/env python3
"""
backfill_court_province.py — DETERMINISTIC court-town -> province fill.

A separate, STRUCTURED approach (not the withheld free-text address parser). Of
the ~10,421 province-less inScope rows, 99.9% are BOE judicial; `courtName` is
present on ~8,651 and ~7,450 carry a clean "JUZGADO … - <TOWN>" suffix covering
only ~320 distinct court-towns. A Spanish Juzgado de Primera Instancia has
territorial jurisdiction over a partido judicial within ONE province and auctions
properties that sit in that province, so COURT-TOWN -> PROVINCE is a SAFE, bounded,
human-reviewable lookup. We fill at PROVINCE LEVEL only (never the municipality).

    fillable  <- court_province_from_name(courtName) == 'ok'
    NULL      <- AEAT/tax bodies (no town suffix), ambiguous town (>1 province),
                 or a town not in the gazetteer (flagged for review). NEVER guess.

Contract (same safety as the province backfill):
    python3 backfill_court_province.py                 # DRY RUN (default) — reports only
    python3 backfill_court_province.py --map-out FILE  # dry-run + write the 320 court-town
                                                       #   -> province review map (CSV)
    python3 backfill_court_province.py --apply         # writes province + audit log
    python3 backfill_court_province.py --revert         # restores from the audit log
    python3 backfill_court_province.py --limit 5000    # cap rows scanned (testing)

Idempotent: a filled row leaves the junk-province predicate, so re-running --apply
is safe. --revert restores only rows whose province STILL equals the value written.
Province-only writes. Reads DATABASE_URL (Postgres). NO migration.
"""

import os
import sys
import csv
import json
import argparse
import logging
from collections import defaultdict
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

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

# The court->province resolver lives in the LIGHT config module (no scraper stack).
court_province_from_name = None
court_town_from_name = None
for _mp_mod in ("scraper.config.municipality_province",
                "config.municipality_province",
                "app.config.municipality_province"):
    try:
        _m = __import__(_mp_mod, fromlist=["court_province_from_name", "court_town_from_name"])
        court_province_from_name = _m.court_province_from_name
        court_town_from_name = _m.court_town_from_name
        break
    except ImportError:
        continue
if court_province_from_name is None:
    logger.error(
        "Could not import court_province_from_name. Run from subastas/ (as `scraper`"
        " package), subastas/scraper/, or the /app container."
    )
    sys.exit(1)


def _get_db_url():
    url = os.environ.get("DATABASE_URL", "")
    if not url or url.startswith("file:"):
        logger.error("DATABASE_URL must be a Postgres URL. Set DATABASE_URL env var.")
        sys.exit(1)
    return url


DEFAULT_AUDIT = os.environ.get(
    "COURT_PROVINCE_AUDIT",
    "/data/dnksubastas-deploy/scheduler-logs/backfill_court_province_audit.jsonl",
)

# Province-less inScope rows that ALSO have a courtName (the court-fill scope).
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


def run_apply(dry_run=True, limit=None, audit_path=DEFAULT_AUDIT, map_out=None):
    logger.info("Mode: %s", "DRY RUN (no writes)" if dry_run else "APPLY (writing)")
    conn = psycopg2.connect(_get_db_url())
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute(f'SELECT COUNT(*) FROM "Auction" WHERE {JUNK_PROVINCE_SQL}')
    total_junk = cur.fetchone()[0]
    logger.info("Province-less inScope rows: %s", f"{total_junk:,}")

    BATCH = 2000
    last_id = ""
    scanned = 0
    fillable = 0
    by_flag = defaultdict(int)          # ok / no-town / ambiguous / unmappable
    town_map = {}                        # court-town -> (province, flag)
    town_rows = defaultdict(int)         # court-town -> row count (for the review map)
    audit_fh = None
    if not dry_run:
        if os.path.dirname(audit_path):
            os.makedirs(os.path.dirname(audit_path), exist_ok=True)
        audit_fh = open(audit_path, "a", encoding="utf-8")
        logger.info("Audit log (append): %s", audit_path)

    while True:
        cur.execute(
            f'''
            SELECT id, "boeId", province, "courtName"
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

        updates = []
        audit_lines = []
        for rid, boe_id, cur_prov, court in rows:
            scanned += 1
            province, town, flag = court_province_from_name(court)
            by_flag[flag] += 1
            if town:
                town_rows[town] += 1
                town_map.setdefault(town, (province, flag))
            if flag == 'ok' and province:
                fillable += 1
                updates.append((province, rid))
                audit_lines.append(json.dumps({
                    "id": rid, "boeId": boe_id, "old": cur_prov,
                    "new": province, "town": town, "src": "court-town", "ts": _now_iso(),
                }, ensure_ascii=False))

        last_id = rows[-1][0]
        if updates and not dry_run:
            psycopg2.extras.execute_batch(
                cur,
                'UPDATE "Auction" SET province = %s, "updatedAt" = NOW() WHERE id = %s',
                updates, page_size=500,
            )
            conn.commit()
            for line in audit_lines:
                audit_fh.write(line + "\n")
            audit_fh.flush()

        if limit and scanned >= limit:
            logger.info("--limit %s reached, stopping.", limit)
            break

    if audit_fh:
        audit_fh.close()

    logger.info("=" * 64)
    logger.info("Court-town province backfill complete")
    logger.info("  Rows scanned (province-less):     %s", f"{scanned:,}")
    logger.info("  FILLABLE (court-town -> province): %s", f"{fillable:,}")
    logger.info("    ok (resolved):                  %s", f"{by_flag['ok']:,}")
    logger.info("  NULL (left untouched):")
    logger.info("    no-town (AEAT / no suffix):     %s", f"{by_flag['no-town']:,}")
    logger.info("    ambiguous town (>1 province):   %s", f"{by_flag['ambiguous']:,}")
    logger.info("    unmappable town:                %s", f"{by_flag['unmappable']:,}")
    logger.info("  Distinct court-towns seen:        %s", f"{len(town_map):,}")
    if dry_run:
        logger.info("  (DRY RUN — nothing written. Re-run with --apply to write.)")

    # The reviewable 320-map artifact — the audit surface Ken checks BEFORE apply.
    if map_out:
        with open(map_out, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["court_town", "province", "flag", "row_count"])
            for town in sorted(town_map, key=lambda t: (-town_rows[t], t.lower())):
                province, flag = town_map[town]
                w.writerow([town, province or "", flag, town_rows[town]])
        logger.info("Court-town -> province review map written: %s (%d towns)",
                    map_out, len(town_map))
        flagged = [(t, town_map[t][1]) for t in town_map if town_map[t][1] in ('ambiguous', 'unmappable')]
        if flagged:
            logger.warning("FLAGGED court-towns (NULL, need review): %d", len(flagged))
            for t, fl in sorted(flagged)[:40]:
                logger.warning("   [%s] %s (%d rows)", fl, t, town_rows[t])

    cur.close()
    conn.close()
    return {"scanned": scanned, "fillable": fillable, "by_flag": dict(by_flag),
            "distinct_towns": len(town_map)}


def run_revert(audit_path=DEFAULT_AUDIT, limit=None):
    logger.info("REVERT from audit log: %s", audit_path)
    if not os.path.exists(audit_path):
        logger.error("Audit log not found: %s — nothing to revert.", audit_path)
        sys.exit(1)
    conn = psycopg2.connect(_get_db_url())
    conn.autocommit = False
    cur = conn.cursor()
    reverted = skipped = parsed = 0
    batch = []
    with open(audit_path, "r", encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                rec = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Skipping malformed audit line: %s", raw[:80])
                continue
            parsed += 1
            batch.append((rec.get("old"), rec["id"], rec["new"]))
            if len(batch) >= 500:
                reverted, skipped = _flush_revert(cur, conn, batch, reverted, skipped)
                batch = []
            if limit and parsed >= limit:
                break
    if batch:
        reverted, skipped = _flush_revert(cur, conn, batch, reverted, skipped)
    logger.info("Revert complete — parsed=%s reverted=%s skipped=%s",
                f"{parsed:,}", f"{reverted:,}", f"{skipped:,}")
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
    ap = argparse.ArgumentParser(description="Deterministic court-town -> province backfill.")
    ap.add_argument("--apply", action="store_true", help="write changes (default is dry-run)")
    ap.add_argument("--revert", action="store_true", help="undo a prior --apply from the audit log")
    ap.add_argument("--limit", type=int, default=None, help="cap rows scanned/reverted (testing)")
    ap.add_argument("--audit", default=DEFAULT_AUDIT, help="audit-log path (JSONL)")
    ap.add_argument("--map-out", default=None,
                    help="write the court-town -> province review map (CSV) — dry-run audit surface")
    args = ap.parse_args()
    if args.revert:
        run_revert(audit_path=args.audit, limit=args.limit)
    else:
        run_apply(dry_run=not args.apply, limit=args.limit,
                  audit_path=args.audit, map_out=args.map_out)
