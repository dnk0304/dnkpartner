#!/usr/bin/env python3
"""
Daily BOE updater.

Runs a rolling 5-day scrape using the same BOE form strategy as the
parallel 2026-today scraper (#desdeFP, #hastaFP, #mostrar=500), then
upserts results into the main SQLite database.
"""

import json
import logging
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from scraper.scrapers.boe_parallel_scraper import BOEParallelScraper

DB_PATH = project_root / "data" / "database" / "prod.db"
PROGRESS_PATH = project_root / "scraper" / "daily_update_progress.json"
LOG_PATH = project_root / "scraper" / "daily_update.log"


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
        ],
    )


def get_total_auctions() -> int:
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM Auction")
        row = cursor.fetchone()
        return int(row[0]) if row and row[0] is not None else 0
    finally:
        conn.close()


def get_updated_existing_count(run_started_at: str) -> int:
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM Auction
            WHERE updatedAt >= ?
              AND COALESCE(createdAt, updatedAt) < ?
            """,
            (run_started_at, run_started_at),
        )
        row = cursor.fetchone()
        return int(row[0]) if row and row[0] is not None else 0
    finally:
        conn.close()


def save_run_summary(summary: dict) -> None:
    payload = {"last_run": summary}
    if PROGRESS_PATH.exists():
        try:
            existing = json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))
            if isinstance(existing, dict):
                payload["history"] = existing.get("history", [])[-19:]
        except Exception:
            payload["history"] = []
    else:
        payload["history"] = []

    payload["history"].append(summary)
    PROGRESS_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def main() -> None:
    setup_logging()

    today = datetime.now()
    start_date = today - timedelta(days=5)
    run_started = datetime.now().isoformat()
    total_before = get_total_auctions()

    logging.info("=" * 70)
    logging.info("DAILY BOE UPDATE (ROLLING 5 DAYS)")
    logging.info("=" * 70)
    logging.info("Date range: %s to %s", start_date.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d"))
    logging.info("Strategy: BOE form dates + 500 results/page (parallel scraper logic)")
    logging.info("=" * 70)

    scraper = BOEParallelScraper(scraper_id=99)
    scraper.progress_file = PROGRESS_PATH

    try:
        progress = scraper.scrape_date_range(
            start_year=start_date.year,
            start_month=start_date.month,
            start_day=start_date.day,
            end_year=today.year,
            end_month=today.month,
            end_day=today.day,
            resume=False,
        )

        total_after = get_total_auctions()
        inserted_count = max(0, total_after - total_before)
        updated_existing = get_updated_existing_count(run_started)
        fetched_count = int(progress.get("total_auctions", 0))

        summary = {
            "run_started_at": run_started,
            "run_finished_at": datetime.now().isoformat(),
            "date_range": {
                "from": start_date.strftime("%Y-%m-%d"),
                "to": today.strftime("%Y-%m-%d"),
            },
            "batches": int(progress.get("total_batches", 0)),
            "fetched": fetched_count,
            "inserted": inserted_count,
            "updated_existing": max(0, updated_existing - inserted_count),
            "errors": len(progress.get("errors", [])),
        }
        save_run_summary(summary)

        logging.info("=" * 70)
        logging.info("DAILY UPDATE COMPLETE")
        logging.info("Fetched from BOE: %s", fetched_count)
        logging.info("Inserted new auctions: %s", summary["inserted"])
        logging.info("Updated existing auctions: %s", summary["updated_existing"])
        logging.info("Errors: %s", summary["errors"])
        logging.info("=" * 70)
    except KeyboardInterrupt:
        logging.info("Interrupted by user")
        sys.exit(0)
    except Exception as exc:
        logging.error("Daily update failed: %s", exc, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
