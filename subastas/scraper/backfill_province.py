#!/usr/bin/env python3
"""
Province Backfill Script — Wave 2a (Task A)
Fixes rows where province='Unknown' but municipality is set.
Derives province from municipality using the municipality_province lookup table.

Run once directly on the Hetzner server:
  cd /data/dnksubastas-deploy/repo/subastas/scraper
  DATABASE_URL=<pg url> python backfill_province.py

Reports:
  - Rows checked (province='Unknown')
  - Rows updated (derived from municipality)
  - Rows still Unknown (municipality missing or unmapped)
"""

import os
import sys
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

# Allow running from scraper/ root
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

# Municipality → Province lookup
# Import inline to avoid package path issues
try:
    from config.municipality_province import municipality_to_province, province_from_text
except ImportError:
    # Fallback for different working dirs
    sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
    from config.municipality_province import municipality_to_province, province_from_text


def run_backfill(dry_run: bool = False):
    logger.info(f"Connecting to Postgres...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Count total Unknown-province rows
    cur.execute("""
        SELECT COUNT(*) FROM "Auction" WHERE province = 'Unknown'
    """)
    total_unknown = cur.fetchone()[0]
    logger.info(f"Total rows with province='Unknown': {total_unknown:,}")

    # Count Unknown rows that have a municipality
    cur.execute("""
        SELECT COUNT(*) FROM "Auction"
        WHERE province = 'Unknown' AND municipality IS NOT NULL AND municipality != ''
    """)
    with_municipality = cur.fetchone()[0]
    logger.info(f"  Of those, with municipality set: {with_municipality:,}")

    # Fetch in batches via id cursor — NOT offset.
    # Paginate-while-mutating bug: every UPDATE moves a row out of the
    # `province = 'Unknown'` predicate, so the result set shrinks under
    # the cursor and LIMIT/OFFSET silently skips rows. Using `WHERE id > last_id`
    # walks the id space monotonically — rows we've already processed are
    # naturally excluded, rows we haven't are guaranteed to appear regardless
    # of how many predicates flipped. Single pass, no re-runs.
    BATCH_SIZE = 5000
    last_id = ''  # text PK; '' sorts before any valid id
    updated_count = 0
    still_unknown = 0
    batches = 0

    logger.info("Starting province derivation loop (id-cursor pagination)...")

    while True:
        cur.execute("""
            SELECT id, municipality, "courtName", "boeAnnouncement"
            FROM "Auction"
            WHERE province = 'Unknown' AND id > %s
            ORDER BY id
            LIMIT %s
        """, (last_id, BATCH_SIZE))

        rows = cur.fetchall()
        if not rows:
            break

        batch_updates = []  # (province, id)

        for row_id, municipality, court_name, boe_announcement in rows:
            derived = None

            # 1. Try direct municipality lookup
            if municipality:
                derived = municipality_to_province(municipality)

            # 2. Try courtName text scan
            if not derived and court_name:
                derived = province_from_text(court_name)

            # 3. Try boeAnnouncement text scan (slow but catches more)
            if not derived and boe_announcement:
                derived = province_from_text(boe_announcement)

            if derived:
                batch_updates.append((derived, row_id))
                updated_count += 1
            else:
                still_unknown += 1

        # Advance cursor to the last id seen, regardless of update outcome
        # (rows that stay 'Unknown' would otherwise be re-fetched forever).
        last_id = rows[-1][0]
        batches += 1

        if batch_updates and not dry_run:
            psycopg2.extras.execute_batch(
                cur,
                'UPDATE "Auction" SET province = %s, "updatedAt" = NOW() WHERE id = %s',
                batch_updates,
                page_size=500,
            )
            conn.commit()
            logger.info(f"  Batch {batches} (last_id ending {last_id[-12:]}): "
                        f"{len(batch_updates)}/{len(rows)} rows updated")
        elif batch_updates:
            logger.info(f"  [DRY RUN] Batch {batches}: {len(batch_updates)} would be updated")

    logger.info("=" * 60)
    logger.info(f"Province backfill complete")
    logger.info(f"  Total checked:    {total_unknown:,}")
    logger.info(f"  Updated:          {updated_count:,}")
    logger.info(f"  Still Unknown:    {still_unknown:,}")
    if dry_run:
        logger.info("  (DRY RUN — no rows written)")

    # Final count check
    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE province != 'Unknown') as valid,
            COUNT(*) FILTER (WHERE province = 'Unknown') as still_unknown,
            COUNT(*) as total
        FROM "Auction"
        WHERE status IN ('CELEBRANDOSE', 'PROXIMA_APERTURA', 'ACTIVE')
    """)
    row = cur.fetchone()
    if row:
        logger.info(f"\nLive auctions (CELEBRANDOSE+PROXIMA_APERTURA+ACTIVE):")
        logger.info(f"  Valid province:   {row[0]:,}")
        logger.info(f"  Still Unknown:    {row[1]:,}")
        logger.info(f"  Total:            {row[2]:,}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        logger.info("DRY RUN mode — no changes will be written")
    run_backfill(dry_run=dry_run)
