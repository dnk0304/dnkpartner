#!/usr/bin/env python3
"""
Full active-pool re-scrape + backfill — 2026-06-01 (Ghost CORRECTIVE #2)

Goal: hold CORRECT, COMPLETE data for EVERY active-pool auction.

Active pool = status IN ('CELEBRANDOSE','ACTIVE','PROXIMA_APERTURA','SUSPENDIDA').
For each row we re-fetch the BOE detail page (authoritative) and upsert ALL
fields BOE exposes:
  - appraisalValue  (Tasación)        -> real value or NULL (multi-lot => NULL, honest)
  - minimumBid      (Puja mínima)     -> real value or NULL ("Sin puja mínima")
  - depositAmount   (Importe depósito)
  - claimedAmount   (Cantidad reclamada)
  - title           (Identificador when listing title absent)
  - endsAt          (Fecha de conclusión) -> fixes NULL/placeholder end dates
  - boeLink         (canonical detail URL)
  - status          (detail banner OR conclusion-date-in-past => CONCLUIDA_PORTAL)

Phases:
  --phase1   pure SQL: appraisalValue 0 -> NULL, title 'Unknown' -> NULL.
  --rescrape browser re-fetch of the whole active pool (checkpointed, resumable).
  --status-only  apply the widened SQL status sweep (endsAt < now -> CONCLUIDA_PORTAL)
                 across CELEBRANDOSE/ACTIVE/PROXIMA_APERTURA/SUSPENDIDA.

Checkpoint file lets a long run resume after interruption.
Run inside the scheduler container (has playwright + DATABASE_URL):
  docker exec -e RUN=1 dnksubastas-scheduler python /app/backfill_active_full.py --phase1 --status-only
  docker exec dnksubastas-scheduler python /app/backfill_active_full.py --rescrape
"""

import os
import sys
import json
import time
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL.")
    sys.exit(1)

ACTIVE_STATUSES = ("CELEBRANDOSE", "ACTIVE", "PROXIMA_APERTURA", "SUSPENDIDA")
CHECKPOINT = os.environ.get("BACKFILL_CHECKPOINT", "/tmp/backfill_active_full.checkpoint.json")


def phase1_sql(cur, conn):
    logger.info("--- Phase 1: SQL literal-junk corrections ---")
    cur.execute('UPDATE "Auction" SET "appraisalValue" = NULL, "updatedAt" = NOW() WHERE "appraisalValue" = 0')
    logger.info(f"  appraisalValue 0 -> NULL: {cur.rowcount:,}")
    cur.execute("""UPDATE "Auction" SET title = NULL, "updatedAt" = NOW() WHERE title = 'Unknown'""")
    logger.info(f"  title 'Unknown' -> NULL: {cur.rowcount:,}")
    conn.commit()
    logger.info("  committed phase 1")


def status_sweep_sql(cur, conn):
    """Widened sweep: any active-pool row whose endsAt is in the past -> CONCLUIDA_PORTAL."""
    logger.info("--- Status sweep (widened) ---")
    cur.execute("""
        UPDATE "Auction"
        SET status = 'CONCLUIDA_PORTAL', "transitionedAt" = NOW(), "updatedAt" = NOW()
        WHERE status IN ('CELEBRANDOSE','ACTIVE','PROXIMA_APERTURA','SUSPENDIDA')
          AND "endsAt" IS NOT NULL
          AND "endsAt" < NOW()
    """)
    logger.info(f"  stale active (endsAt<now) -> CONCLUIDA_PORTAL: {cur.rowcount:,}")
    conn.commit()
    logger.info("  committed status sweep")


def _load_ckpt():
    try:
        with open(CHECKPOINT) as f:
            return set(json.load(f).get("done", []))
    except Exception:
        return set()


def _save_ckpt(done):
    try:
        with open(CHECKPOINT, "w") as f:
            json.dump({"done": sorted(done)}, f)
    except Exception as e:
        logger.warning(f"  checkpoint save failed: {e}")


def rescrape(cur, conn):
    logger.info("--- Re-scrape: full active pool ---")
    cur.execute(f"""
        SELECT "boeId" FROM "Auction"
        WHERE status IN {ACTIVE_STATUSES} AND "boeId" IS NOT NULL
        ORDER BY "endsAt" ASC NULLS LAST
    """)
    boe_ids = [r[0] for r in cur.fetchall()]
    logger.info(f"  {len(boe_ids):,} active rows in scope")

    done = _load_ckpt()
    if done:
        logger.info(f"  resuming: {len(done):,} already done per checkpoint")
    queue = [b for b in boe_ids if b not in done]
    logger.info(f"  {len(queue):,} rows to process this run")
    if not queue:
        return

    os.environ.setdefault("BOE_FETCH_DETAIL", "1")
    sys.path.insert(0, "/")
    from app.scrapers.boe_scraper import BOEScraper
    scraper = BOEScraper()

    enriched = swept = touched = failed = 0
    for i, boe_id in enumerate(queue, 1):
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
            if info.get("ends_at") is not None:
                updates['"endsAt"'] = info["ends_at"]
            if info.get("detail_url"):
                updates['"boeLink"'] = info["detail_url"]
            new_status = info.get("detail_status")
            if new_status:
                updates['status'] = new_status

            if updates:
                if 'status' in updates and updates['status'] == 'CONCLUIDA_PORTAL':
                    updates['"transitionedAt"'] = datetime.utcnow()
                    swept += 1
                if '"appraisalValue"' in updates:
                    enriched += 1
                set_clause = ", ".join(f"{k} = %s" for k in updates) + ', "updatedAt" = NOW()'
                cur.execute(
                    f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s',
                    tuple(list(updates.values()) + [boe_id]),
                )
                conn.commit()
                touched += 1
            done.add(boe_id)
            if i % 25 == 0:
                _save_ckpt(done)
                logger.info(f"  {i}/{len(queue)} touched={touched} enriched={enriched} swept={swept} failed={failed}")
        except Exception as e:
            failed += 1
            logger.warning(f"  re-scrape failed for {boe_id}: {e}")
            done.add(boe_id)  # don't retry forever; honest failure
    _save_ckpt(done)
    logger.info(f"  Re-scrape complete: touched={touched} enriched={enriched} swept={swept} failed={failed}")


def main():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()
    if "--phase1" in sys.argv:
        phase1_sql(cur, conn)
    if "--rescrape" in sys.argv:
        rescrape(cur, conn)
    if "--status-only" in sys.argv:
        status_sweep_sql(cur, conn)
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
