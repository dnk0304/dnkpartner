#!/usr/bin/env python3
"""
G5 GAP BACK-FILL: 2026-02-11 to today into Postgres.

Usage (local with SSH tunnel on port 15432):
    DATABASE_URL="postgresql://dnksubastas:EkH6oFmnBV9d2uvdSr9HIYE4tUmC7S83sWTzOcPW0OOvknrp7LsMrb84W0mnU9aq@localhost:15432/dnksubastas" \
    python scripts/run_gap_backfill.py

Usage (server-side after deploy, no tunnel needed):
    DATABASE_URL=$DATABASE_URL_SUBASTAS python scripts/run_gap_backfill.py

Scrapes daily chunks (CHUNK_DAYS at a time) from START_DATE to today.
Progress is checkpointed in scripts/_gap_backfill_checkpoint.json — safe to resume.

The G1/G2 bug fixes MUST be in place before running this:
  - G1: pulse_tasks.py queries CELEBRANDOSE + ACTIVE (not just ACTIVE)
  - G2: update_bid calls update_auction_bid() — no upsert_auction corruption
  - G3: _upsert_auction_postgres covers full 57-column schema
Both fixes are committed on the dnksubastas branch.
"""

import json
import logging
import os
import sys
from datetime import date, timedelta
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Verify DATABASE_URL is set to Postgres before importing scraper
DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or ("postgresql://" not in DATABASE_URL and "postgres://" not in DATABASE_URL):
    print("ERROR: DATABASE_URL must be set to a Postgres connection string.")
    print("  For local tunnel:  export DATABASE_URL='postgresql://dnksubastas:<pass>@localhost:15432/dnksubastas'")
    print("  For server-side:   export DATABASE_URL=$DATABASE_URL_SUBASTAS")
    sys.exit(1)

# Skip detail page fetch for backfill — avoids Playwright sync-in-asyncio error
# when _fetch_detail_info is called inside the listing parse loop.
# Listing-level data (boeId, title, category, province, status, appraisalValue, dates)
# is sufficient for backfill; detail enrichment can run as a separate pass later.
os.environ.setdefault("BOE_FETCH_DETAIL", "0")

from scraper.scrapers.boe_parallel_scraper import BOEParallelScraper  # noqa: E402

START_DATE = date(2026, 2, 11)   # First day of gap
CHUNK_DAYS = 7                    # Scrape one week at a time
CHECKPOINT_PATH = Path(__file__).parent / "_gap_backfill_checkpoint.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)


def load_checkpoint() -> dict:
    if CHECKPOINT_PATH.exists():
        try:
            return json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"completed_through": None, "total_fetched": 0, "total_inserted": 0}


def save_checkpoint(cp: dict) -> None:
    CHECKPOINT_PATH.write_text(json.dumps(cp, indent=2, default=str), encoding="utf-8")


def count_pg_rows() -> int:
    import psycopg2
    # Parse URL for psycopg2
    url = DATABASE_URL.replace("postgresql://", "").replace("postgres://", "")
    user_pass, rest = url.split("@", 1)
    user, password = user_pass.split(":", 1)
    host_port_db = rest.split("/", 1)
    db = host_port_db[1] if len(host_port_db) > 1 else "dnksubastas"
    host_port = host_port_db[0].split(":")
    host = host_port[0]
    port = int(host_port[1]) if len(host_port) > 1 else 5432
    conn = psycopg2.connect(host=host, port=port, dbname=db, user=user, password=password)
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM "Auction"')
    n = cur.fetchone()[0]
    conn.close()
    return n


def main() -> None:
    today = date.today()
    cp = load_checkpoint()

    if cp["completed_through"]:
        resume_from = date.fromisoformat(cp["completed_through"]) + timedelta(days=1)
        log.info(f"Resuming from checkpoint: {resume_from} (completed through {cp['completed_through']})")
    else:
        resume_from = START_DATE
        log.info(f"Starting fresh from {START_DATE}")

    if resume_from > today:
        log.info("Gap backfill already complete — nothing to do.")
        return

    total_before = count_pg_rows()
    log.info(f"Postgres rows before backfill: {total_before:,}")
    log.info(f"Backfill range: {resume_from} to {today}")

    chunk_start = resume_from
    total_fetched = cp["total_fetched"]

    while chunk_start <= today:
        chunk_end = min(chunk_start + timedelta(days=CHUNK_DAYS - 1), today)
        log.info("=" * 60)
        log.info(f"Chunk: {chunk_start} -> {chunk_end}")

        scraper = BOEParallelScraper(scraper_id=99)
        scraper.progress_file = CHECKPOINT_PATH.parent / f"_gap_chunk_{chunk_start}.json"

        try:
            progress = scraper.scrape_date_range(
                start_year=chunk_start.year,
                start_month=chunk_start.month,
                start_day=chunk_start.day,
                end_year=chunk_end.year,
                end_month=chunk_end.month,
                end_day=chunk_end.day,
                resume=False,
            )
            fetched = int(progress.get("total_auctions", 0))
            errors = len(progress.get("errors", []))
            total_fetched += fetched
            log.info(f"  Chunk done: fetched={fetched}, errors={errors}")
        except Exception as exc:
            log.error(f"  Chunk {chunk_start} failed: {exc}", exc_info=True)
            # Save checkpoint and exit — operator can resume
            cp["completed_through"] = (chunk_start - timedelta(days=1)).isoformat()
            cp["total_fetched"] = total_fetched
            save_checkpoint(cp)
            log.info(f"Checkpoint saved at {cp['completed_through']}. Re-run to resume.")
            sys.exit(1)

        cp["completed_through"] = chunk_end.isoformat()
        cp["total_fetched"] = total_fetched
        save_checkpoint(cp)

        chunk_start = chunk_end + timedelta(days=1)

    total_after = count_pg_rows()
    inserted = total_after - total_before
    cp["total_inserted"] = inserted
    save_checkpoint(cp)

    log.info("=" * 60)
    log.info("GAP BACKFILL COMPLETE")
    log.info(f"  Range: {START_DATE} to {today}")
    log.info(f"  Rows fetched from BOE: {total_fetched:,}")
    log.info(f"  New rows in Postgres:  {inserted:,}")
    log.info(f"  Total rows in Postgres: {total_after:,}")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
