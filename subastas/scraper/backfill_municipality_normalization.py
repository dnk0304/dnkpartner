#!/usr/bin/env python3
"""
Municipality NORMALIZATION backfill — cleans the `municipality` column so the
/subastas province -> town filter hierarchy is clean.

Three problems it fixes (Dennis, on /subastas province drill-down):
  1. LICENSE PLATES leaked in as towns ("6789jmg", "3875dvk") by vehicle
     auctions -> stripped to the honest "unknown" (NULL), never kept as a town.
  2. CASING/ACCENT DUPLICATES ("las palmas" + "Las Palmas" + "LAS PALMAS")
     -> collapsed to ONE canonical spelling so the town appears once.
  3. INCONSISTENT CAPITALIZATION -> Spanish title-case (Big first letter,
     connectors de/del/la/las/el/los/y lowercase): "telde" -> "Telde",
     "las palmas de gran canaria" -> "Las Palmas de Gran Canaria".

Logic per row (NEVER fabricates a town):
  raw = municipality
  norm = canonical_municipality_name(raw)              # title-case + dedup + junk-strip
  if norm is None (raw was a plate / pure number / junk):
      # try to RE-DERIVE a real town from the captured property location
      norm = canonical_municipality_name(bienLocalidad)
      # still nothing -> write NULL (honest unknown), strip the plate
  if norm != raw: UPDATE municipality = norm

Also reports municipality<->province INCONSISTENCIES (town not in its province
per the INE map). It does NOT auto-move a town between provinces here — that is
the job of backfill_province_municipality.py (province authority chain); this
script only flags so the operator/Forge can review.

Reuses the SAME normalizer the scrapers use (config.municipality_province.
canonical_municipality_name) so the backfill and live pulls never drift.

Idempotent + resumable (id-cursor). Reads DATABASE_URL. NO migration
(rewrites existing `municipality` values; column already exists).

Run detached on the Hetzner scheduler container (workdir /app):
  python3 -u backfill_municipality_normalization.py --dry-run        # preview counts
  python3 -u backfill_municipality_normalization.py                  # active rows
  python3 -u backfill_municipality_normalization.py --include-finished  # + finished (big, cosmetic)

Flags:
  --dry-run            compute + report only, write nothing
  --include-finished   also process finished/CONCLUIDA rows (cosmetic, big)
  --limit N            cap rows scanned (testing)
"""

import os
import sys
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

# Reuse the SAME normalizer the scrapers use so the two never drift.
try:
    from config.municipality_province import (
        canonical_municipality_name,
        is_plate_or_junk_municipality,
        municipality_province_consistent,
    )
except ImportError:
    # Container layout: package rooted at /app as `app`.
    sys.path.insert(0, "/")
    from app.config.municipality_province import (  # noqa: F401
        canonical_municipality_name,
        is_plate_or_junk_municipality,
        municipality_province_consistent,
    )

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL. Set DATABASE_URL env var.")
    sys.exit(1)

ACTIVE_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "SUSPENDIDA")
DONE_MARKER = ("/data/dnksubastas-deploy/scheduler-logs/"
               "backfill_municipality_normalization.done")


def run_backfill(dry_run=False, include_finished=False, limit=None):
    logger.info("Connecting to Postgres...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    if include_finished:
        status_pred = "TRUE"
        logger.info("Scope: ALL rows (active + finished).")
    else:
        status_pred = 'status = ANY(%(statuses)s::"AuctionStatus"[])'
        logger.info(f"Scope: ACTIVE rows only {ACTIVE_STATUSES}.")

    base_params = {"statuses": list(ACTIVE_STATUSES)}

    # --- baseline distinct count + dup/plate census (reporting only) ---
    cur.execute(
        f'''
        SELECT municipality, COUNT(*) FROM "Auction"
        WHERE {status_pred} AND municipality IS NOT NULL
        GROUP BY municipality
        ''',
        base_params if not include_finished else None,
    )
    census = cur.fetchall()
    distinct_before = len(census)
    canon_keys = Counter()
    plate_distinct = 0
    plate_rows = 0
    for muni, cnt in census:
        if is_plate_or_junk_municipality(muni):
            plate_distinct += 1
            plate_rows += cnt
        norm = canonical_municipality_name(muni)
        if norm is not None:
            canon_keys[norm] += cnt
    distinct_after_est = len(canon_keys)
    casing_dup_distinct = distinct_before - distinct_after_est - plate_distinct
    logger.info("=" * 64)
    logger.info("BASELINE CENSUS (municipality column, in scope):")
    logger.info(f"  Distinct municipality values now:        {distinct_before:,}")
    logger.info(f"  Distinct AFTER normalization (estimate): {distinct_after_est:,}")
    logger.info(f"  Plate/junk distinct values:              {plate_distinct:,} "
                f"({plate_rows:,} rows)")
    logger.info(f"  Casing/accent duplicate values merged:   "
                f"~{max(casing_dup_distinct, 0):,}")
    logger.info("=" * 64)

    # id-cursor pagination (stable under in-place UPDATEs).
    BATCH = 2000
    last_id = ""
    scanned = 0
    title_cased = 0       # value changed by casing/spelling only
    dup_merged = 0        # value collapsed onto a different canonical spelling
    plate_stripped = 0    # plate/junk -> re-derived OR NULL
    plate_rederived = 0   # plate/junk -> recovered a real town from bienLocalidad
    plate_nulled = 0      # plate/junk -> no recoverable town -> NULL
    inconsistent = 0      # town not in its province (flagged, not moved)
    unchanged = 0
    inconsistent_ids = []

    while True:
        params = dict(base_params)
        params["last_id"] = last_id
        params["lim"] = BATCH
        cur.execute(
            f'''
            SELECT id, "boeId", municipality, province, "bienLocalidad"
            FROM "Auction"
            WHERE {status_pred} AND id > %(last_id)s
            ORDER BY id
            LIMIT %(lim)s
            ''',
            params,
        )
        rows = cur.fetchall()
        if not rows:
            break

        # (new_municipality_or_sentinel, id). We must distinguish "no change"
        # from "set to NULL", so changes carry an explicit (write_flag) tuple.
        updates = []  # (new_value_or_None, set_null_bool, id)

        for rid, boe_id, cur_muni, cur_prov, bien_loc in rows:
            scanned += 1
            if cur_muni is None:
                unchanged += 1
                continue

            was_plate = is_plate_or_junk_municipality(cur_muni)
            norm = canonical_municipality_name(cur_muni)

            if norm is None:
                # Current value is a plate / pure number / junk.
                plate_stripped += 1
                rederived = canonical_municipality_name(bien_loc)
                if rederived is not None and not is_plate_or_junk_municipality(bien_loc):
                    plate_rederived += 1
                    updates.append((rederived, False, rid))
                else:
                    plate_nulled += 1
                    updates.append((None, True, rid))  # honest unknown
                continue

            if norm != cur_muni:
                # Casing/spelling fix OR dedup-collapse onto another spelling.
                # Heuristic for the report: if only case/accents differ it is a
                # title-case fix; if the alphabetic shape differs it is a merge.
                if was_plate:
                    plate_stripped += 1
                    plate_rederived += 1
                    updates.append((norm, False, rid))
                else:
                    if _same_word_shape(cur_muni, norm):
                        title_cased += 1
                    else:
                        dup_merged += 1
                    updates.append((norm, False, rid))
            else:
                unchanged += 1

            # Cross-check town<->province consistency (flag only; never moved here).
            consistent = municipality_province_consistent(norm, cur_prov)
            if consistent is False:
                inconsistent += 1
                if len(inconsistent_ids) < 500:
                    inconsistent_ids.append(boe_id)

        last_id = rows[-1][0]

        if updates and not dry_run:
            # set_null True -> force the column to NULL (honest unknown, plate
            # stripped with no recoverable town); else write the canonical value.
            psycopg2.extras.execute_batch(
                cur,
                '''
                UPDATE "Auction"
                SET municipality = CASE WHEN %s THEN NULL ELSE %s END,
                    "updatedAt" = NOW()
                WHERE id = %s
                ''',
                [(set_null, val, rid) for (val, set_null, rid) in updates],
                page_size=500,
            )
            conn.commit()

        if limit and scanned >= limit:
            logger.info(f"--limit {limit} reached, stopping.")
            break

    logger.info("=" * 64)
    logger.info("Municipality normalization complete")
    logger.info(f"  Rows scanned:                       {scanned:,}")
    logger.info(f"  Title-cased (casing/accent fix):    {title_cased:,}")
    logger.info(f"  Duplicate-merged (spelling collapse): {dup_merged:,}")
    logger.info(f"  Plate/junk stripped (total):        {plate_stripped:,}")
    logger.info(f"    -> re-derived a real town:        {plate_rederived:,}")
    logger.info(f"    -> set NULL (honest unknown):     {plate_nulled:,}")
    logger.info(f"  Town<->province inconsistencies:    {inconsistent:,} (flagged only)")
    logger.info(f"  Unchanged (already canonical):      {unchanged:,}")
    if dry_run:
        logger.info("  (DRY RUN — nothing written)")

    # Post-run sanity: any non-title-cased municipality variants left?
    if not dry_run:
        cur.execute(
            f'''
            SELECT municipality, COUNT(*) FROM "Auction"
            WHERE {status_pred} AND municipality IS NOT NULL
              AND municipality = lower(municipality)
              AND municipality <> initcap(municipality)
            GROUP BY municipality ORDER BY 2 DESC LIMIT 20
            ''',
            base_params if not include_finished else None,
        )
        leftover = cur.fetchall()
        if leftover:
            logger.warning(f"Lowercase-only municipality variants remaining: {leftover}")
        else:
            logger.info("No lowercase-only municipality variants remain. Casing clean.")

    if inconsistent_ids:
        logger.info(f"Town<->province inconsistent (first {len(inconsistent_ids)} boeIds, "
                    f"review via backfill_province_municipality.py):")
        logger.info("  " + ", ".join(inconsistent_ids[:50]))

    cur.close()
    conn.close()

    if not dry_run:
        try:
            os.makedirs(os.path.dirname(DONE_MARKER), exist_ok=True)
            with open(DONE_MARKER, "w") as f:
                f.write(
                    f"scanned={scanned} titlecased={title_cased} "
                    f"dupmerged={dup_merged} platestripped={plate_stripped} "
                    f"plate_rederived={plate_rederived} plate_nulled={plate_nulled} "
                    f"inconsistent={inconsistent}\n"
                )
            logger.info(f"Done-marker written: {DONE_MARKER}")
        except OSError as e:
            logger.warning(f"Could not write done-marker ({e}) — non-fatal.")


def _same_word_shape(a: str, b: str) -> bool:
    """True when a and b differ ONLY by case/accents (same town, casing fix),
    False when the alphabetic content differs (a dedup collapse onto a different
    canonical spelling, e.g. 'Las Palmas' -> 'Las Palmas de Gran Canaria')."""
    try:
        from config.municipality_province import normalize_municipality
    except ImportError:
        from app.config.municipality_province import normalize_municipality
    try:
        return normalize_municipality(a) == normalize_municipality(b)
    except Exception:
        return False


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--include-finished", action="store_true",
                    help="also process finished/CONCLUIDA rows (big, cosmetic)")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    if args.dry_run:
        logger.info("DRY RUN mode — no changes will be written")
    run_backfill(
        dry_run=args.dry_run,
        include_finished=args.include_finished,
        limit=args.limit,
    )
