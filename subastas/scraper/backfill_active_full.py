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
  --split-appraisal-valorsubasta  re-fetch the FULL active pool and write
                 Tasación (appraisalValue) and Valor subasta (valorSubasta) to
                 their OWN columns (un-collapse). Own checkpoint; 250ms delay.
                 Requires migration 20260605_add_valor_subasta applied first.

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

# Legacy first-gen row exclusion (2026-06-02). See database/legacy_rows.py.
try:
    from database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore
except ImportError:
    sys.path.insert(0, "/")
    from app.database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL.")
    sys.exit(1)


def _connect(retries: int = 30, delay: float = 5.0):
    """Connect with retry — the box PG (max_connections=100) can momentarily
    hit 'too many clients already' under load; a long re-scrape must not die
    on a transient cap. Retries the initial connect, then reconnects on demand."""
    last = None
    for attempt in range(1, retries + 1):
        try:
            return psycopg2.connect(DATABASE_URL)
        except psycopg2.OperationalError as e:
            last = e
            logger.warning(f"  connect attempt {attempt}/{retries} failed: {e}")
            time.sleep(delay)
    raise last

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


def rescrape(conn):
    only_null = "--only-null-endsat" in sys.argv
    only_null_appr = "--only-null-appraisal" in sys.argv
    only_suspended = "--only-suspended" in sys.argv
    split_valor = "--split-appraisal-valorsubasta" in sys.argv
    if only_null:
        logger.info("--- Re-scrape: CELEBRANDOSE rows with NULL endsAt only ---")
    elif only_null_appr:
        logger.info("--- Re-scrape: ACTIVE rows with NULL appraisalValue only ---")
    elif only_suspended:
        logger.info("--- Re-scrape: SUSPENDIDA rows only (resume date + motive) ---")
    elif split_valor:
        logger.info("--- Re-scrape: ALL active rows — split Tasación / Valor subasta ---")
    else:
        logger.info("--- Re-scrape: full active pool ---")
    cur = conn.cursor()
    if only_suspended:
        # Fast targeted run for the ~119 existing SUSPENDIDA rows. The daily
        # 5-day celebration-window scrape never revisits them, so this is how
        # resumeAt + suspensionMotive get backfilled. Own checkpoint below.
        cur.execute(f"""
            SELECT "boeId" FROM "Auction"
            WHERE status = 'SUSPENDIDA' AND "boeId" IS NOT NULL
              AND {LEGACY_EXCLUSION_SQL}
            ORDER BY "boeId" ASC
        """)
    elif only_null:
        cur.execute(f"""
            SELECT "boeId" FROM "Auction"
            WHERE status = 'CELEBRANDOSE' AND "endsAt" IS NULL
              AND "boeId" IS NOT NULL
              AND {LEGACY_EXCLUSION_SQL}
            ORDER BY "boeId" ASC
        """)
    elif only_null_appr:
        # The "sin tasación" set: ACTIVE rows whose appraisalValue is NULL.
        # After the ver=1 info-general financial-merge fix, re-fetching these
        # populates valor_subasta -> the per-row Tasación->Valor-subasta resolve
        # below writes appraisalValue. Genuinely no-price lotes stay NULL
        # (honest). Covers the 96 PROXIMA_APERTURA/judicial (incl Dennis's 7
        # refs) + 13 CELEBRANDOSE/OTRAS_TRIBUTARIAS = ~109 rows.
        cur.execute(f"""
            SELECT "boeId" FROM "Auction"
            WHERE status IN {ACTIVE_STATUSES}
              AND "appraisalValue" IS NULL
              AND "boeId" IS NOT NULL
              AND {LEGACY_EXCLUSION_SQL}
            ORDER BY "boeId" ASC
        """)
    elif split_valor:
        # The full active pool — re-fetch every active row so Tasación and Valor
        # subasta get written to their OWN columns (un-collapse). Rides the
        # universal info-general fetch already live in production. Own checkpoint
        # below so it never collides with the full/endsat/null-appraisal runs.
        cur.execute(f"""
            SELECT "boeId" FROM "Auction"
            WHERE status IN {ACTIVE_STATUSES} AND "boeId" IS NOT NULL
              AND {LEGACY_EXCLUSION_SQL}
            ORDER BY "boeId" ASC
        """)
    else:
        cur.execute(f"""
            SELECT "boeId" FROM "Auction"
            WHERE status IN {ACTIVE_STATUSES} AND "boeId" IS NOT NULL
              AND {LEGACY_EXCLUSION_SQL}
            ORDER BY "endsAt" ASC NULLS LAST
        """)
    boe_ids = [r[0] for r in cur.fetchall()]
    logger.info(f"  {len(boe_ids):,} active rows in scope")

    # suspensionMotive is an additive column (migration 20260604). Probe so an
    # out-of-order run (backfill before migrate) is a safe no-op rather than a
    # write failure. resumeAt already exists (Wave 1) — written unconditionally.
    try:
        cur.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'Auction' AND column_name = 'suspensionMotive'
        """)
        has_suspension_motive = cur.fetchone() is not None
    except Exception:
        has_suspension_motive = False

    # valorSubasta is an additive column (migration 20260605). Probe so an
    # out-of-order run (backfill before migrate) is a safe no-op rather than a
    # write failure. When absent, valor_subasta is simply not written (the
    # appraisalValue/Tasación split still applies).
    try:
        cur.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'Auction' AND column_name = 'valorSubasta'
        """)
        has_valor_subasta = cur.fetchone() is not None
    except Exception:
        has_valor_subasta = False
    if (split_valor) and not has_valor_subasta:
        logger.warning(
            "  valorSubasta column ABSENT — apply migration 20260605_add_valor_subasta "
            "before this run, or valorSubasta will not be written."
        )

    # Isolate the appraisal re-fetch on its own checkpoint so a prior full /
    # endsat run's checkpoint never skips a null-appraisal row (and vice versa).
    # Still env-overridable via BACKFILL_CHECKPOINT for an explicit shared run.
    ckpt = CHECKPOINT
    if only_null_appr and "BACKFILL_CHECKPOINT" not in os.environ:
        ckpt = "/tmp/backfill_null_appraisal.checkpoint.json"
    elif only_suspended and "BACKFILL_CHECKPOINT" not in os.environ:
        ckpt = "/tmp/backfill_suspended.checkpoint.json"
    elif split_valor and "BACKFILL_CHECKPOINT" not in os.environ:
        ckpt = "/tmp/backfill_split_valorsubasta.checkpoint.json"

    done = _load_ckpt(ckpt)
    if done:
        logger.info(f"  resuming: {len(done):,} already done per checkpoint")
    queue = [b for b in boe_ids if b not in done]

    # --max-rows caps this invocation. The shared BrowserManager singleton in
    # this container degrades after a few dozen page loads (goto stops firing,
    # process sleeps forever with no live chrome). Running bounded batches as
    # fresh processes — each with a brand-new browser — sidesteps that; the
    # checkpoint makes it resume seamlessly. An external loop drives batches
    # until the queue drains.
    max_rows = None
    if "--max-rows" in sys.argv:
        max_rows = int(sys.argv[sys.argv.index("--max-rows") + 1])
        queue = queue[:max_rows]

    logger.info(f"  {len(queue):,} rows to process this run (cap={max_rows})")
    if not queue:
        logger.info("  QUEUE_EMPTY")
        return

    os.environ.setdefault("BOE_FETCH_DETAIL", "1")
    sys.path.insert(0, "/")
    from app.scrapers.boe_scraper import BOEScraper, extract_address
    scraper = BOEScraper()

    enriched = swept = touched = failed = 0
    for i, boe_id in enumerate(queue, 1):
        try:
            info = scraper._fetch_detail_info(boe_id)
            updates = {}
            # Tasación and Valor subasta are stored SEPARATELY now (Dennis wants
            # three distinct card numbers). The old collapse — fold valor_subasta
            # into appraisalValue when Tasación was 0/absent — is REMOVED.
            #   appraisalValue <- Tasación ONLY (honest-NULL when 0/absent).
            #   valorSubasta   <- Valor subasta ONLY (honest-NULL when 0/absent).
            # A judicial row with Tasación=0 + real Valor subasta now lands
            # appraisalValue untouched (NULL) + valorSubasta=real. valorSubasta is
            # written only when the live DB carries the column (split run: the
            # 20260605 migration must be applied first; Ken applies it before this).
            appr = info.get("appraisal_value")
            valor = info.get("valor_subasta")
            if appr is not None and appr != 0:
                updates['"appraisalValue"'] = appr
            if has_valor_subasta and valor is not None and valor != 0:
                updates['"valorSubasta"'] = valor
            if info.get("minimum_bid") is not None:
                updates['"minimumBid"'] = info["minimum_bid"]
            if info.get("deposit_amount") is not None:
                updates['"depositAmount"'] = info["deposit_amount"]
            if info.get("claimed_amount") is not None:
                updates['"claimedAmount"'] = info["claimed_amount"]
            if info.get("identificador"):
                updates['title'] = info["identificador"]
            # Property street address from the Bienes blob -> geocoder pins it on
            # the map (mirrors parse_listing). Without this the active backfill
            # refreshed prices/dates but never wrote addresses, so the map stalled.
            addr = info.get('address') or extract_address(info.get('bienes_info'))
            if addr:
                updates['address'] = addr
            if info.get("ends_at") is not None:
                updates['"endsAt"'] = info["ends_at"]
            # SUSPENDIDA: resume date + motive from the BOE aviso block. resumeAt
            # already exists; suspensionMotive guarded by the info_schema probe.
            # Honest-NULL: only written when BOE actually stated the value.
            if info.get("resume_at") is not None:
                updates['"resumeAt"'] = info["resume_at"]
            if has_suspension_motive and info.get("suspension_motive") is not None:
                updates['"suspensionMotive"'] = info["suspension_motive"]
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
                try:
                    cur.execute(
                        f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s',
                        tuple(list(updates.values()) + [boe_id]),
                    )
                    conn.commit()
                except psycopg2.OperationalError:
                    # connection dropped (e.g. transient cap) — reconnect + retry once
                    logger.warning("  DB connection lost; reconnecting...")
                    conn = _connect()
                    cur = conn.cursor()
                    cur.execute(
                        f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s',
                        tuple(list(updates.values()) + [boe_id]),
                    )
                    conn.commit()
                touched += 1
            done.add(boe_id)
            if split_valor:
                # Politeness delay for the split backfill (250ms) — this run
                # touches the full active pool over the live info-general fetch.
                time.sleep(0.25)
            if i % 25 == 0:
                _save_ckpt(done, ckpt)
                logger.info(f"  {i}/{len(queue)} touched={touched} enriched={enriched} swept={swept} failed={failed}")
        except Exception as e:
            failed += 1
            logger.warning(f"  re-scrape failed for {boe_id}: {e}")
            done.add(boe_id)  # don't retry forever; honest failure
    _save_ckpt(done, ckpt)
    logger.info(f"  Re-scrape complete: touched={touched} enriched={enriched} swept={swept} failed={failed}")


def main():
    conn = _connect()
    conn.autocommit = False
    cur = conn.cursor()
    if "--phase1" in sys.argv:
        phase1_sql(cur, conn)
    if "--status-only" in sys.argv:
        status_sweep_sql(cur, conn)
    cur.close()
    # --only-null-endsat / --only-null-appraisal / --only-suspended imply a
    # re-scrape run, so Ken can fire the targeted backfill without --rescrape.
    if any(f in sys.argv for f in
           ("--rescrape", "--only-null-endsat", "--only-null-appraisal",
            "--only-suspended", "--split-appraisal-valorsubasta")):
        rescrape(conn)
    conn.close()


if __name__ == "__main__":
    main()
