#!/usr/bin/env python3
"""
SEGSOCIAL valorSubasta backfill — 2026-06-07 (Ghost, Wave D2)

Why: the Wave63 SEGSOCIAL scraper wrote appraisalValue (Importe de Tasación)
correctly but left valorSubasta NULL for all 719 SEGSOCIAL rows. The detail-page
financial breakdown derives the 5% deposit from valorSubasta, so SegSocial
auctions could never show a deposit (QC-B P1).

The scraper fix (segsocial_scraper.py) now maps "Tipo de enajenación" (the TGSS
auction / sale value) to valorSubasta. This script backfills the EXISTING rows
WITHOUT waiting for, and without the side effects of, a full daily re-pull.

What it does (surgical, honest-NULL):
  1. SELECT boeId FROM "Auction" WHERE source='SEGSOCIAL' AND "valorSubasta" IS NULL.
  2. For each, derive EMB_ID from boeId ("SUB-SS-{EMB_ID}") and re-fetch the ficha
     with the SAME parser the scraper uses (SegSocialScraper._fetch_ficha).
  3. Read the parsed valor_subasta (Tipo de enajenación). If non-NULL, UPDATE
     ONLY "valorSubasta" (and updatedAt). If the ficha genuinely has no Tipo de
     enajenación -> leave NULL (honest-NULL; NEVER copy Tasación).

Notes:
  - UPDATEs valorSubasta ONLY. Does NOT touch status, dates, prices, location, etc.
    (A full --segsocial-once re-pull WOULD also repopulate valorSubasta via the
    adapter UPDATE path, but it re-derives every field; this script is the
    minimal, side-effect-free path requested by the brief.)
  - Idempotent + resumable: a checkpoint file records processed boeIds.
  - Writes a done-marker file on clean completion (wave55 pattern).
  - NO migration: the "valorSubasta" DOUBLE PRECISION column already exists
    (wave55 migration 20260605_add_valor_subasta). Guarded by information_schema
    so a pre-migration DB is a safe no-op.

Run inside the scheduler container (has requests + DATABASE_URL):
  docker exec dnksubastas-scheduler \
      python /app/backfill_segsocial_valorsubasta.py
Resume after interruption: just re-run the same command (checkpoint skips done).
"""

import os
import sys
import json
import time
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger("segsocial-valorsubasta-backfill")

import psycopg2

# The scraper package may be importable as `scrapers.segsocial_scraper` (when run
# from /app/scraper) or `scraper.scrapers.segsocial_scraper`. Try both.
try:
    from scrapers.segsocial_scraper import SegSocialScraper  # type: ignore
except ImportError:
    try:
        from scraper.scrapers.segsocial_scraper import SegSocialScraper  # type: ignore
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from scrapers.segsocial_scraper import SegSocialScraper  # type: ignore

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL.")
    sys.exit(1)

CHECKPOINT = os.environ.get(
    "SEGSOCIAL_VALORSUBASTA_CHECKPOINT",
    "/tmp/backfill_segsocial_valorsubasta.checkpoint.json",
)
DONE_MARKER = os.environ.get(
    "SEGSOCIAL_VALORSUBASTA_DONE",
    "/tmp/backfill_segsocial_valorsubasta.done",
)


def _connect(retries: int = 30, delay: float = 5.0):
    last = None
    for attempt in range(1, retries + 1):
        try:
            return psycopg2.connect(DATABASE_URL)
        except psycopg2.OperationalError as e:
            last = e
            logger.warning(f"  connect attempt {attempt}/{retries} failed: {e}")
            time.sleep(delay)
    raise last


def _load_checkpoint() -> set:
    try:
        with open(CHECKPOINT) as fh:
            return set(json.load(fh).get("done", []))
    except (OSError, ValueError):
        return set()


def _save_checkpoint(done: set) -> None:
    try:
        with open(CHECKPOINT, "w") as fh:
            json.dump({"done": sorted(done), "ts": datetime.now().isoformat()}, fh)
    except OSError as e:
        logger.warning(f"  checkpoint write failed: {e}")


def _has_valorsubasta_column(cur) -> bool:
    cur.execute(
        """SELECT 1 FROM information_schema.columns
           WHERE table_name = 'Auction' AND column_name = 'valorSubasta'"""
    )
    return cur.fetchone() is not None


def main() -> int:
    conn = _connect()
    cur = conn.cursor()

    if not _has_valorsubasta_column(cur):
        logger.error('"valorSubasta" column not present — apply migration first. Aborting (no-op).')
        return 2

    cur.execute(
        """SELECT "boeId" FROM "Auction"
           WHERE source = 'SEGSOCIAL' AND "valorSubasta" IS NULL
           ORDER BY "boeId" """
    )
    boe_ids = [r[0] for r in cur.fetchall()]
    logger.info(f"Found {len(boe_ids)} SEGSOCIAL rows with NULL valorSubasta")

    done = _load_checkpoint()
    if done:
        logger.info(f"Checkpoint: {len(done)} already processed, skipping those")

    scraper = SegSocialScraper()
    if not scraper._prime_session():
        logger.error("Failed to prime TGSS session — aborting (will resume on re-run)")
        return 1

    updated = 0
    null_kept = 0
    missing = 0
    errors = 0

    for i, boe_id in enumerate(boe_ids, 1):
        if boe_id in done:
            continue
        if not boe_id.startswith("SUB-SS-"):
            logger.warning(f"  unexpected boeId shape, skipping: {boe_id}")
            done.add(boe_id)
            continue
        emb_id = boe_id[len("SUB-SS-"):]
        try:
            data = scraper._fetch_ficha(emb_id)
            if not data:
                missing += 1
                logger.warning(f"  [{i}/{len(boe_ids)}] {boe_id}: ficha unavailable (left NULL)")
                done.add(boe_id)
                continue
            valor = data.get("valor_subasta")
            if valor is not None and float(valor) > 0:
                cur.execute(
                    '''UPDATE "Auction"
                       SET "valorSubasta" = %s, "updatedAt" = NOW()
                       WHERE "boeId" = %s AND "valorSubasta" IS NULL''',
                    (float(valor), boe_id),
                )
                conn.commit()
                updated += 1
                logger.info(f"  [{i}/{len(boe_ids)}] {boe_id}: valorSubasta={valor}")
            else:
                # Honest-NULL: no Tipo de enajenación on this ficha. Leave NULL;
                # NEVER fall back to Tasación.
                null_kept += 1
        except Exception as e:
            errors += 1
            logger.error(f"  [{i}/{len(boe_ids)}] {boe_id}: error {e}")
        finally:
            done.add(boe_id)
            if i % 25 == 0:
                _save_checkpoint(done)

    _save_checkpoint(done)
    logger.info(
        f"Backfill complete: updated={updated} null_kept(honest)={null_kept} "
        f"ficha_missing={missing} errors={errors} total_candidates={len(boe_ids)}"
    )

    if errors == 0:
        try:
            with open(DONE_MARKER, "w") as fh:
                fh.write(json.dumps({
                    "updated": updated,
                    "null_kept": null_kept,
                    "ficha_missing": missing,
                    "total_candidates": len(boe_ids),
                    "finished_at": datetime.now().isoformat(),
                }))
            logger.info(f"Done-marker written: {DONE_MARKER}")
        except OSError as e:
            logger.warning(f"  done-marker write failed: {e}")
    else:
        logger.warning("Errors occurred — done-marker NOT written; re-run to retry failures.")

    cur.close()
    conn.close()
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
