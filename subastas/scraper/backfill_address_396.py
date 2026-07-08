#!/usr/bin/env python3
"""
Address backfill for the sanitizer-regression rows — 2026-07-08 (Ghost, Fix C)

3f2ea9c's page-dump sanitizer false-positived on the legit logged-out login
footer ("... debe Iniciar sesión en el Portal de Subastas.") inside the ver=3
"Datos del bien subastado" block (esp. AEAT batches) -> bienes_info=None ->
address / lotDescription / cadastralRef never written (~396 active rows).
Run ONLY on a scheduler image carrying the footer-strip fix (sa/sanitizer-
footer-fix), otherwise the re-fetch reproduces the same NULLs.

What it does per targeted row (active pool, address NULL or ''):
  - Re-fetch the BOE detail page (existing scraper guts; zero new parsing).
  - Write address, lotDescription, cadastralRef/cadastralData when present
    (write-only-when-present; never blanks a column).
  - If the address NEWLY populates: clear lat, lng, geocodeAttemptedAt so the
    scheduler geocode-drain (10-min cadence) re-pins REAL coordinates instead
    of the municipality-centroid junk written while the address was missing.
    Rows whose address stays empty keep their coords/attempt-marker untouched.
  - 1-2 s jitter between requests; own checkpoint; resumable; --dry-run.

Run inside the scheduler container (has playwright + DATABASE_URL), workdir /app:
  python3 -u backfill_address_396.py --dry-run
  python3 -u backfill_address_396.py
Options: --max-rows N, --include-finished, BACKFILL_ADDRESS_CHECKPOINT=path.
"""

import os
import sys
import json
import time
import random
import logging

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

import psycopg2

try:
    from database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore
except ImportError:
    sys.path.insert(0, "/")
    from app.database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL.")
    sys.exit(1)

ACTIVE_STATUSES = ("CELEBRANDOSE", "ACTIVE", "PROXIMA_APERTURA", "SUSPENDIDA")
CHECKPOINT = os.environ.get(
    "BACKFILL_ADDRESS_CHECKPOINT", "/tmp/backfill_address_396.checkpoint.json"
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


def _load_ckpt(path=CHECKPOINT):
    try:
        with open(path) as f:
            return set(json.load(f).get("done", []))
    except Exception:
        return set()


def _save_ckpt(done, path=CHECKPOINT):
    try:
        with open(path, "w") as f:
            json.dump({"done": sorted(done)}, f)
    except Exception as e:
        logger.warning(f"  checkpoint save failed: {e}")


def main():
    dry_run = "--dry-run" in sys.argv
    include_finished = "--include-finished" in sys.argv
    max_rows = None
    if "--max-rows" in sys.argv:
        max_rows = int(sys.argv[sys.argv.index("--max-rows") + 1])

    conn = _connect()
    conn.autocommit = False
    cur = conn.cursor()

    # status is the Postgres enum "AuctionStatus" — cast the bound text[]
    # (see a01890a; text-vs-enum has no = operator).
    status_pred = (
        'status = ANY(%(statuses)s::"AuctionStatus"[])'
        if not include_finished else "TRUE"
    )
    params = {"statuses": list(ACTIVE_STATUSES)}

    cur.execute(
        f"""
        SELECT "boeId"
        FROM "Auction"
        WHERE {status_pred}
          AND (address IS NULL OR btrim(address) = '')
          AND "boeId" IS NOT NULL
          AND {LEGACY_EXCLUSION_SQL}
        ORDER BY "boeId" ASC
        """,
        params,
    )
    boe_ids = [r[0] for r in cur.fetchall()]
    logger.info(f"  {len(boe_ids):,} address-empty rows in scope (re-queried live)")

    done = _load_ckpt()
    if done:
        logger.info(f"  resuming: {len(done):,} already done per checkpoint")
    queue = [b for b in boe_ids if b not in done]
    if max_rows:
        queue = queue[:max_rows]
    logger.info(f"  {len(queue):,} rows this run (cap={max_rows}, dry_run={dry_run})")
    if not queue:
        logger.info("  QUEUE_EMPTY")
        conn.close()
        return

    os.environ.setdefault("BOE_FETCH_DETAIL", "1")
    sys.path.insert(0, "/")
    from app.scrapers.boe_scraper import BOEScraper, extract_address
    scraper = BOEScraper()

    populated = still_empty = errors = coords_cleared = 0
    for i, boe_id in enumerate(queue, 1):
        try:
            info = scraper._fetch_detail_info(boe_id)
            addr = info.get("address") or extract_address(info.get("bienes_info"))
            updates = {}
            if addr:
                updates["address"] = addr
            if info.get("bienes_info"):
                updates['"lotDescription"'] = info["bienes_info"]
            if info.get("cadastral_ref"):
                updates['"cadastralRef"'] = info["cadastral_ref"]
            if info.get("cadastral_data"):
                updates['"cadastralData"'] = json.dumps(info["cadastral_data"]) \
                    if not isinstance(info["cadastral_data"], str) else info["cadastral_data"]

            if addr:
                populated += 1
                logger.info(f"  [{i}/{len(queue)}] {boe_id} ADDRESS: {addr[:80]}")
            else:
                still_empty += 1
                logger.info(f"  [{i}/{len(queue)}] {boe_id} still no address (honest)")

            if updates and not dry_run:
                set_clause = ", ".join(f"{k} = %s" for k in updates)
                # Address NEWLY populated -> centroid coords are junk; clear
                # them + geocodeAttemptedAt so geocode-drain re-pins for real.
                if addr:
                    set_clause += ', lat = NULL, lng = NULL, "geocodeAttemptedAt" = NULL'
                    coords_cleared += 1
                set_clause += ', "updatedAt" = NOW()'
                vals = tuple(list(updates.values()) + [boe_id])
                try:
                    cur.execute(f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s', vals)
                    conn.commit()
                except psycopg2.OperationalError:
                    logger.warning("  DB connection lost; reconnecting...")
                    conn = _connect()
                    conn.autocommit = False
                    cur = conn.cursor()
                    cur.execute(f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s', vals)
                    conn.commit()
            done.add(boe_id)
            if i % 25 == 0:
                _save_ckpt(done)
                logger.info(
                    f"  progress {i}/{len(queue)}: populated={populated} "
                    f"still_empty={still_empty} errors={errors}"
                )
            time.sleep(random.uniform(1.0, 2.0))
        except Exception as e:
            errors += 1
            logger.warning(f"  re-fetch failed for {boe_id}: {e}")
            done.add(boe_id)  # honest failure; don't loop forever
    _save_ckpt(done)
    logger.info(
        f"  DONE: populated={populated} coords_cleared={coords_cleared} "
        f"still_empty={still_empty} errors={errors} (dry_run={dry_run})"
    )
    conn.close()


if __name__ == "__main__":
    main()
