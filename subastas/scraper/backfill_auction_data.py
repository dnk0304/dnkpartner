#!/usr/bin/env python3
"""
Auction Data Backfill — 2026-06-01 (Ghost)

Corrects the garbage written by the old pipeline:
  - appraisalValue = 0          -> NULL  (honest "unknown valuation")
  - title = 'Unknown'           -> NULL  (app synthesises a display title)
  - status stale 'CELEBRANDOSE' -> CONCLUIDA_PORTAL when endsAt < now()  (status sweep)
  - real Tasación / Puja mínima / Importe del depósito / Identificador for LIVE
    rows -> re-scraped from the BOE detail page (authoritative), --rescrape only.

TWO PHASES:
  Phase 1 (default, fast, pure SQL): null-out garbage literals + status sweep.
    Safe and idempotent. This is what makes the app fallbacks fire immediately.
  Phase 2 (--rescrape, slow, browser): re-fetch detail pages for still-LIVE rows
    that have no real appraisal and write the real Tasación/min bid/title back.
    Bounded by --limit (default 200) so it can be run incrementally.

Run on the Hetzner server (Postgres):
  cd /data/dnksubastas-deploy/repo/subastas/scraper
  DATABASE_URL=<pg url> python backfill_auction_data.py            # phase 1
  DATABASE_URL=<pg url> python backfill_auction_data.py --rescrape --limit 200
  DATABASE_URL=<pg url> python backfill_auction_data.py --dry-run

Reports before/after counts per field.
"""

import os
import sys
import logging

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(__file__))

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    logger.error("psycopg2 not installed. pip install psycopg2-binary")
    sys.exit(1)

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL. Set DATABASE_URL env var.")
    sys.exit(1)

LIVE_STATUSES = ("CELEBRANDOSE", "ACTIVE", "PROXIMA_APERTURA")


def _counts(cur):
    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE "appraisalValue" = 0)                      AS appr_zero,
            COUNT(*) FILTER (WHERE title = 'Unknown')                          AS title_unknown,
            COUNT(*) FILTER (WHERE status IN ('CELEBRANDOSE','ACTIVE')
                              AND "endsAt" IS NOT NULL
                              AND "endsAt" < NOW())                            AS stale_live
        FROM "Auction"
    """)
    return cur.fetchone()


def phase1_sql(cur, conn, dry_run: bool):
    """Fast, pure-SQL corrections: null garbage literals + status sweep."""
    logger.info("--- Phase 1: SQL corrections ---")

    # appraisalValue = 0 -> NULL  (requires column nullable; see migration)
    cur.execute('UPDATE "Auction" SET "appraisalValue" = NULL, "updatedAt" = NOW() WHERE "appraisalValue" = 0')
    appr_fixed = cur.rowcount
    logger.info(f"  appraisalValue 0 -> NULL: {appr_fixed:,}")

    # title 'Unknown' -> NULL  (requires column nullable; see migration)
    cur.execute("""UPDATE "Auction" SET title = NULL, "updatedAt" = NOW() WHERE title = 'Unknown'""")
    title_fixed = cur.rowcount
    logger.info(f"  title 'Unknown' -> NULL: {title_fixed:,}")

    # status sweep: expired live auctions -> CONCLUIDA_PORTAL
    cur.execute("""
        UPDATE "Auction"
        SET status = 'CONCLUIDA_PORTAL',
            "transitionedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE status IN ('CELEBRANDOSE', 'ACTIVE')
          AND "endsAt" IS NOT NULL
          AND "endsAt" < NOW()
    """)
    status_fixed = cur.rowcount
    logger.info(f"  stale live -> CONCLUIDA_PORTAL: {status_fixed:,}")

    if dry_run:
        conn.rollback()
        logger.info("  [DRY RUN] rolled back phase 1")
    else:
        conn.commit()
        logger.info("  committed phase 1")
    return appr_fixed, title_fixed, status_fixed


def phase2_rescrape(cur, conn, limit: int, dry_run: bool):
    """
    Authoritative re-scrape of still-LIVE rows lacking a real appraisal.
    Re-fetches the BOE detail page and re-upserts real financial fields + title.
    """
    logger.info(f"--- Phase 2: authoritative re-scrape (limit={limit}) ---")

    cur.execute(f"""
        SELECT "boeId"
        FROM "Auction"
        WHERE status IN {LIVE_STATUSES}
          AND ("appraisalValue" IS NULL OR "appraisalValue" = 0)
          AND "boeId" IS NOT NULL
        ORDER BY "endsAt" ASC NULLS LAST
        LIMIT %s
    """, (limit,))
    boe_ids = [r[0] for r in cur.fetchall()]
    logger.info(f"  {len(boe_ids)} live rows queued for re-scrape")

    if not boe_ids:
        return 0

    # Lazy import the scraper (needs playwright) only when actually re-scraping.
    os.environ.setdefault("BOE_FETCH_DETAIL", "1")
    from scrapers.boe_scraper import BOEScraper
    scraper = BOEScraper()

    fixed = 0
    for i, boe_id in enumerate(boe_ids, 1):
        try:
            info = scraper._fetch_detail_info(boe_id)
            updates = {}
            if info.get("appraisal_value") is not None:
                updates['"appraisalValue"'] = info["appraisal_value"]
            if info.get("minimum_bid") is not None:
                updates['"minimumBid"'] = info["minimum_bid"]
            if info.get("deposit_amount") is not None:
                updates['"depositAmount"'] = info["deposit_amount"]
            if info.get("claimed_amount") is not None:
                updates['"claimedAmount"'] = info["claimed_amount"]
            if info.get("identificador"):
                updates['title'] = info["identificador"]
            if info.get("detail_status"):
                updates['status'] = info["detail_status"]

            if updates and not dry_run:
                set_clause = ", ".join(f"{k} = %s" for k in updates) + ', "updatedAt" = NOW()'
                cur.execute(
                    f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s',
                    tuple(list(updates.values()) + [boe_id]),
                )
                conn.commit()
                fixed += 1
            if i % 25 == 0:
                logger.info(f"  re-scraped {i}/{len(boe_ids)} (fixed {fixed})")
        except Exception as e:
            logger.warning(f"  re-scrape failed for {boe_id}: {e}")

    logger.info(f"  Phase 2 complete: {fixed} rows enriched with real detail-page data")
    return fixed


def main():
    dry_run = "--dry-run" in sys.argv
    rescrape = "--rescrape" in sys.argv
    limit = 200
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    before = _counts(cur)
    logger.info(f"BEFORE: appraisal=0:{before[0]:,}  title=Unknown:{before[1]:,}  stale-live:{before[2]:,}")

    phase1_sql(cur, conn, dry_run)
    if rescrape:
        phase2_rescrape(cur, conn, limit, dry_run)

    after = _counts(cur)
    logger.info(f"AFTER:  appraisal=0:{after[0]:,}  title=Unknown:{after[1]:,}  stale-live:{after[2]:,}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
