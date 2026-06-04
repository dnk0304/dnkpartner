#!/usr/bin/env python3
"""
Province + Municipality data-fix backfill.

Promotes the CORRECT property province/town that the scraper ALREADY captured
into the website-facing `province` / `municipality` columns:

  province  <- bienProvincia (canonicalized) -> postalCode prefix (strict, no
               Las-Palmas default) -> bienLocalidad via INE municipality map.
               If NONE resolve, the row is LEFT UNTOUCHED and FLAGGED (the
               court province stays; we never fabricate).
  municipality <- bienLocalidad (real town, title-cased). NULL bienLocalidad
               leaves municipality as-is.

Also folds case/accent variants ('barcelona' -> 'Barcelona', 'álava' -> 'Álava')
to the canonical provinces.py spelling so the website province filters dedupe.

Idempotent + re-runnable. Reads DATABASE_URL. NO migration (columns exist).

Run detached on the Hetzner scheduler container (workdir /app):
  python3 -u backfill_province_municipality.py --dry-run        # preview
  python3 -u backfill_province_municipality.py                  # active rows
  python3 -u backfill_province_municipality.py --include-finished  # + 234k CONCLUIDA (2nd pass)

Flags:
  --dry-run            compute + report only, write nothing
  --include-finished   also process CONCLUIDA/finished rows (cosmetic, big)
  --limit N            cap rows scanned (testing)

Reports per source: corrected-via-bienProvincia / -postal / -localidad,
municipality-set, casing-folded, left-flagged (no signal), unchanged.
"""

import os
import sys
import argparse
import logging

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

# Reuse the SAME derivation helpers the scraper uses so the two never drift.
try:
    from config.provinces import canonical_province, province_by_code_strict
    from config.municipality_province import (
        municipality_to_province, normalize_municipality,
    )
    from scrapers.boe_scraper import derive_property_province, canonical_municipality
except ImportError:
    # Container layout: package rooted at /app as `app`.
    sys.path.insert(0, "/")
    from app.config.provinces import canonical_province, province_by_code_strict  # noqa: F401
    from app.config.municipality_province import (  # noqa: F401
        municipality_to_province, normalize_municipality,
    )
    from app.scrapers.boe_scraper import (  # noqa: F401
        derive_property_province, canonical_municipality,
    )

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL. Set DATABASE_URL env var.")
    sys.exit(1)

ACTIVE_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "SUSPENDIDA")
DONE_MARKER = "/data/dnksubastas-deploy/scheduler-logs/backfill_province_municipality.done"


def run_backfill(dry_run=False, include_finished=False, limit=None):
    logger.info("Connecting to Postgres...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    if include_finished:
        status_pred = "TRUE"
        logger.info("Scope: ALL rows (active + finished).")
    else:
        status_pred = 'status = ANY(%(statuses)s)'
        logger.info(f"Scope: ACTIVE rows only {ACTIVE_STATUSES}.")

    base_params = {"statuses": list(ACTIVE_STATUSES)}

    cur.execute(
        f'SELECT COUNT(*) FROM "Auction" WHERE {status_pred}',
        base_params if not include_finished else None,
    )
    total = cur.fetchone()[0]
    logger.info(f"Total rows in scope: {total:,}")

    # id-cursor pagination (stable under in-place UPDATEs — no offset skipping).
    BATCH = 2000
    last_id = ""
    scanned = 0
    fixed_bienprov = 0
    fixed_postal = 0
    fixed_localidad = 0
    muni_set = 0
    casing_folded = 0
    flagged = 0          # no authoritative signal -> left untouched
    unchanged = 0        # already correct
    flagged_ids = []

    while True:
        params = dict(base_params)
        params["last_id"] = last_id
        params["lim"] = BATCH
        cur.execute(
            f'''
            SELECT id, "boeId", province, municipality,
                   "bienProvincia", "bienLocalidad", "postalCode"
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

        updates = []  # (province_or_None, municipality_or_None, id)

        for (rid, boe_id, cur_prov, cur_muni,
             bien_prov, bien_loc, postal) in rows:
            scanned += 1

            new_prov, src = derive_property_province(
                bien_prov, postal, bien_loc, cur_prov
            )
            new_muni = canonical_municipality(bien_loc)

            prov_to_write = None
            muni_to_write = None

            if src == "court-fallback":
                # No authoritative signal. Only fold casing of the existing
                # (court) province; never change WHICH province it is.
                folded = canonical_province(cur_prov)
                if folded and folded != cur_prov:
                    prov_to_write = folded
                    casing_folded += 1
                else:
                    flagged += 1
                    if len(flagged_ids) < 500:
                        flagged_ids.append(boe_id)
            else:
                if new_prov and new_prov != cur_prov:
                    prov_to_write = new_prov
                    if src == "bienProvincia":
                        fixed_bienprov += 1
                    elif src == "postalCode":
                        fixed_postal += 1
                    elif src == "bienLocalidad":
                        fixed_localidad += 1
                else:
                    unchanged += 1

            if new_muni and new_muni != cur_muni:
                muni_to_write = new_muni
                muni_set += 1

            if prov_to_write is not None or muni_to_write is not None:
                updates.append((prov_to_write, muni_to_write, rid))

        last_id = rows[-1][0]

        if updates and not dry_run:
            # COALESCE keeps the existing column when this row only changes the
            # other one (prov_to_write/muni_to_write is None when unchanged).
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

        if limit and scanned >= limit:
            logger.info(f"--limit {limit} reached, stopping.")
            break

    logger.info("=" * 64)
    logger.info("Province + municipality backfill complete")
    logger.info(f"  Rows scanned:                  {scanned:,}")
    logger.info(f"  Province fixed via bienProvincia: {fixed_bienprov:,}")
    logger.info(f"  Province fixed via postalCode:    {fixed_postal:,}")
    logger.info(f"  Province fixed via bienLocalidad: {fixed_localidad:,}")
    logger.info(f"  Province casing folded:           {casing_folded:,}")
    logger.info(f"  Municipality set (real town):     {muni_set:,}")
    logger.info(f"  Left flagged (no signal):         {flagged:,}")
    logger.info(f"  Already correct (province):       {unchanged:,}")
    if dry_run:
        logger.info("  (DRY RUN — nothing written)")

    # Post-run sanity: any lowercase-only province variants left?
    if not dry_run:
        cur.execute(
            f'''
            SELECT province, COUNT(*) FROM "Auction"
            WHERE {status_pred} AND province IS NOT NULL
              AND province <> initcap(province)
              AND province = lower(province)
            GROUP BY province ORDER BY 2 DESC LIMIT 20
            ''',
            base_params if not include_finished else None,
        )
        leftover = cur.fetchall()
        if leftover:
            logger.warning(f"Lowercase-only province variants remaining: {leftover}")
        else:
            logger.info("No lowercase-only province variants remain. Casing clean.")

    if flagged_ids:
        logger.info(f"Flagged (no authoritative province signal), first "
                    f"{len(flagged_ids)} boeIds:")
        logger.info("  " + ", ".join(flagged_ids[:50]))

    cur.close()
    conn.close()

    # Done-marker (Ken/Niki watch pattern).
    if not dry_run:
        try:
            os.makedirs(os.path.dirname(DONE_MARKER), exist_ok=True)
            with open(DONE_MARKER, "w") as f:
                f.write(
                    f"scanned={scanned} bienprov={fixed_bienprov} "
                    f"postal={fixed_postal} localidad={fixed_localidad} "
                    f"casing={casing_folded} muni={muni_set} flagged={flagged}\n"
                )
            logger.info(f"Done-marker written: {DONE_MARKER}")
        except OSError as e:
            logger.warning(f"Could not write done-marker ({e}) — non-fatal.")


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
