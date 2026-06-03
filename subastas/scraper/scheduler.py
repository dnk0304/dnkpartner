#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PROPERTY SCRAPER SCHEDULER
Runs periodic scraping and monitors auction status changes.

G4 FIX: hardened for Linux/Coolify container deployment.
G6 FIX: monitor_status_changes uses direct psycopg2 (DatabaseAdapter.get_auctions_by_status
        fails on Postgres because dict(row) breaks on psycopg2 tuples).
Wave 1 close-out fixes (0652027):
  - scrape_pulse: bypass tasks/__init__.py Celery import; direct psycopg2 + app.scrapers.boe_scraper
  - run_daily_update_scraper: inline BOEParallelScraper (no subprocess to missing /scripts dir)

Wave 2a additions (province-capture + outbox):
  - monitor_status_changes: emits EventOutbox + AuctionStatusHistory on every status flip
  - scrape_pulse: emits auction.new_bid outbox event + AuctionBidHistory on bid change
  - run_daily_update_scraper: no separate outbox here (upsert path handles it via adapter)
  - ending_soon: emitted once per auction when endsAt <= 24h (dedupe prevents double-fire)

Scheduler choice: schedule.py over Celery
  Celery requires Redis infra + worker processes = 3 Coolify services for no gain at current scale.
  schedule.py runs in-process, zero external deps, sufficient for sub-hourly pulse + daily scan.
"""

import sys
import os
import time
import schedule
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

# G4: Linux/Coolify compat
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent

DB_PATH = Path(os.getenv("DB_PATH", str(SCRIPT_DIR.parent / "data" / "database" / "prod.db")))
LOG_DIR = Path(os.getenv("LOG_DIR", str(SCRIPT_DIR / "logs")))
LOG_DIR.mkdir(parents=True, exist_ok=True)
APP_BASE_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3005").rstrip("/")
PYTHON_BIN = os.getenv("PYTHON_BIN", "python3" if sys.platform != "win32" else "python")
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Wave 2a: ending_soon threshold (hours before endsAt to emit the event)
ENDING_SOON_HOURS = int(os.getenv("ENDING_SOON_HOURS", "24"))

# Legacy first-gen row exclusion (2026-06-02). See database/legacy_rows.py.
# Used by scrape_pulse + promote_pending_auctions so legacy cuid/0x-hex rows
# are never re-scraped or status-flipped. monitor_status_changes is left
# untouched — its endsAt-IS-NOT-NULL guard already ignores legacy (NULL endsAt).
try:
    sys.path.insert(0, '/')
    from app.database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore
except ImportError:
    sys.path.insert(0, str(SCRIPT_DIR))
    from database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore

# Wave 2b: dispatcher cron trigger — POST to /api/dispatch/run on schedule.
# DISPATCH_ENDPOINT overrides the URL (use http://dnksubastas-app:3005/api/dispatch/run
# inside docker network so we don't bounce through Traefik). basePath removed
# 2026-06-02 — endpoint no longer carries the /subastas prefix.
DISPATCH_ENDPOINT = os.getenv(
    "DISPATCH_ENDPOINT",
    f"{APP_BASE_URL}/api/dispatch/run",
)
CRON_SECRET = os.getenv("CRON_SECRET", "")
DISPATCH_INTERVAL_MIN = int(os.getenv("DISPATCH_INTERVAL_MIN", "1"))

# Wave 2c (alert-check fix): trigger_alert_check was hitting a stale
# /subastas-prefixed path AND posting unauthenticated. /api/alerts/check now
# requires admin-or-cron and the basePath is gone, so we mirror the dispatcher's
# config shape: ALERT_CHECK_ENDPOINT defaults to the prefix-free URL and we send
# the same Bearer CRON_SECRET header.
ALERT_CHECK_ENDPOINT = os.getenv(
    "ALERT_CHECK_ENDPOINT",
    f"{APP_BASE_URL}/api/alerts/check",
)


class ScraperScheduler:
    def __init__(self):
        self.log_file = LOG_DIR / f"scheduler_{datetime.now().strftime('%Y%m%d')}.log"

    def log(self, message):
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_line = f"[{timestamp}] {message}"
        print(log_line)
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(log_line + '\n')

    def _get_pg_conn(self):
        """Return a psycopg2 connection using DATABASE_URL."""
        import psycopg2
        return psycopg2.connect(DATABASE_URL)

    # -----------------------------------------------------------------------
    # monitor_status_changes — G6 (direct psycopg2) + Wave 2a (outbox)
    # -----------------------------------------------------------------------

    def monitor_status_changes(self):
        """
        Transition expired live auctions to CONCLUIDA_PORTAL.
        G6 FIX: uses direct psycopg2 (bypasses broken DatabaseAdapter.get_auctions_by_status).
        Wave 2a: emits EventOutbox + AuctionStatusHistory rows in the SAME transaction.
        Also emits ending_soon for auctions entering the final 24h window.
        """
        self.log("Monitoring auction status changes...")

        is_postgres = DATABASE_URL and ('postgresql://' in DATABASE_URL or 'postgres://' in DATABASE_URL)

        if not is_postgres:
            # SQLite path (dev only) — no outbox writes
            self._monitor_sqlite()
            return

        try:
            conn = self._get_pg_conn()
            cursor = conn.cursor()
            now = datetime.utcnow()

            # ---- 1. Expire past-deadline live auctions ----
            # Lifecycle: PROXIMA_APERTURA -> (opensAt) -> CELEBRANDOSE ->
            #            (endsAt) -> CONCLUIDA_PORTAL.
            #
            # SWEEP GUARD (2026-06-01, Ghost lifecycle fix): the prior widened
            # form expired ANY PROXIMA_APERTURA whose endsAt passed. That was
            # wrong — a pre-auction that never opened was swept straight to
            # CONCLUIDA, skipping live entirely (155 rows retired in one batch).
            # The promotion job (promote_pending_auctions) now owns the
            # PROXIMA->CELEBRANDOSE flip when opensAt arrives.
            #
            # ACTIVE / CELEBRANDOSE / SUSPENDIDA still expire on a past endsAt.
            # PROXIMA_APERTURA is EXCLUDED here and handled by the dedicated
            # rule below so an un-opened pre-auction is never wrongly retired.
            cursor.execute("""
                SELECT id, "boeId", "endsAt", status, title,
                       "boeLink", province, municipality,
                       "appraisalValue", "currentBid",
                       "suspensionReason", "resumeAt"
                FROM "Auction"
                WHERE status IN ('ACTIVE', 'CELEBRANDOSE', 'SUSPENDIDA')
                  AND "endsAt" IS NOT NULL
                  AND "endsAt" < %s
            """, (now,))
            expired = list(cursor.fetchall())

            # PROXIMA_APERTURA expiry — ONLY when the pre-auction genuinely ran
            # its full window: it opened (opensAt IS NOT NULL AND opensAt <= now)
            # AND its end passed (endsAt < now). A PROXIMA with opensAt NULL or
            # still in the future is left untouched (it simply hasn't opened) so
            # the promotion job can flip it live at the right moment.
            cursor.execute("""
                SELECT id, "boeId", "endsAt", status, title,
                       "boeLink", province, municipality,
                       "appraisalValue", "currentBid",
                       "suspensionReason", "resumeAt"
                FROM "Auction"
                WHERE status = 'PROXIMA_APERTURA'
                  AND "opensAt" IS NOT NULL
                  AND "opensAt" <= %s
                  AND "endsAt" IS NOT NULL
                  AND "endsAt" < %s
            """, (now, now))
            expired.extend(cursor.fetchall())

            if expired:
                self.log(f"  Found {len(expired)} expired live auctions")

                # Import outbox writer.
                # FIX (2026-06-01): the previous form
                #   sys.path.insert(0, str(SCRIPT_DIR)); from database.outbox import ...
                # crashed every cycle with "attempted relative import beyond
                # top-level package": importing top-level `database` runs
                # database/__init__.py -> adapter.py -> `from ..config.settings`,
                # and `..config` escapes above a top-level package. Use the same
                # proven shim scrape_pulse uses (`sys.path.insert(0,'/')` +
                # `app.` prefix) so the package resolves as app.database and
                # `..config` -> app.config is valid.
                sys.path.insert(0, '/')
                from app.database.outbox import emit_status_change

                expired_ids = [row[0] for row in expired]

                # Batch-update status
                cursor.execute("""
                    UPDATE "Auction"
                    SET status = 'CONCLUIDA_PORTAL',
                        "transitionedAt" = %s,
                        "updatedAt" = %s
                    WHERE id = ANY(%s)
                """, (now, now, expired_ids))

                # Write outbox + history rows for each
                for (
                    auction_id, boe_id, ends_at, from_status, title,
                    boe_link, province, municipality,
                    appraisal_value, current_bid,
                    suspension_reason, resume_at,
                ) in expired:
                    try:
                        emit_status_change(
                            cursor,
                            auction_id=auction_id,
                            boe_id=boe_id or "",
                            boe_link=boe_link or f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
                            title=title or "",
                            from_status=from_status,
                            to_status="CONCLUIDA_PORTAL",
                            province=province or "",
                            municipality=municipality or "",
                            appraisal_value=float(appraisal_value or 0),
                            current_bid=float(current_bid) if current_bid else None,
                            ends_at=ends_at,
                            detected_by="scheduler.monitor_status_changes",
                        )
                    except Exception as e:
                        self.log(f"  Warning: outbox write failed for {boe_id}: {e}")

                conn.commit()
                self.log(f"  Marked {len(expired)} auctions as CONCLUIDA_PORTAL (outbox written)")

            # ---- 2. ending_soon — emit once for auctions entering final 24h ----
            ending_soon_cutoff = now + timedelta(hours=ENDING_SOON_HOURS)
            cursor.execute("""
                SELECT a.id, a."boeId", a."endsAt", a.title,
                       a."boeLink", a.province, a.municipality,
                       a."appraisalValue", a."currentBid"
                FROM "Auction" a
                WHERE a.status IN ('CELEBRANDOSE', 'ACTIVE')
                  AND a."endsAt" IS NOT NULL
                  AND a."endsAt" > %s
                  AND a."endsAt" <= %s
            """, (now, ending_soon_cutoff))
            ending_soon_rows = cursor.fetchall()

            if ending_soon_rows:
                sys.path.insert(0, '/')
                from app.database.outbox import emit_ending_soon

                fired_count = 0
                for (
                    auction_id, boe_id, ends_at, title,
                    boe_link, province, municipality,
                    appraisal_value, current_bid,
                ) in ending_soon_rows:
                    try:
                        fired = emit_ending_soon(
                            cursor,
                            auction_id=auction_id,
                            boe_id=boe_id or "",
                            boe_link=boe_link or f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
                            title=title or "",
                            ends_at=ends_at,
                            province=province or "",
                            municipality=municipality or "",
                            appraisal_value=float(appraisal_value or 0),
                            current_bid=float(current_bid) if current_bid else None,
                            threshold_hours=ENDING_SOON_HOURS,
                        )
                        if fired:
                            fired_count += 1
                    except Exception as e:
                        self.log(f"  Warning: ending_soon outbox failed for {boe_id}: {e}")

                conn.commit()
                if fired_count:
                    self.log(f"  ending_soon: emitted {fired_count} new events (of {len(ending_soon_rows)} in window)")

            # ---- Stats ----
            cursor.execute(
                'SELECT status, COUNT(*) FROM "Auction" GROUP BY status ORDER BY COUNT(*) DESC'
            )
            stats = cursor.fetchall()
            self.log("  Current database stats:")
            for status, count in stats:
                self.log(f"     {status}: {count}")

            cursor.close()
            conn.close()

        except Exception as e:
            self.log(f"  Error in monitor_status_changes: {e}")
            import traceback
            self.log(traceback.format_exc())

    def _monitor_sqlite(self):
        """SQLite path for local dev — no outbox writes."""
        try:
            import sqlite3
            db_path = str(DB_PATH)
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, boeId, endsAt, status FROM Auction
                WHERE status IN ('ACTIVE', 'CELEBRANDOSE') AND endsAt < datetime('now')
            """)
            expired = cursor.fetchall()
            if expired:
                self.log(f"  Found {len(expired)} expired live auctions (SQLite)")
                for row in expired:
                    cursor.execute("""
                        UPDATE Auction SET status='CONCLUIDA_PORTAL',
                        transitionedAt=CURRENT_TIMESTAMP, updatedAt=CURRENT_TIMESTAMP
                        WHERE id=?
                    """, (row[0],))
                conn.commit()
                self.log(f"  Marked {len(expired)} as CONCLUIDA_PORTAL")
            conn.close()
        except Exception as e:
            self.log(f"  SQLite monitor error: {e}")

    # -----------------------------------------------------------------------
    # promote_pending_auctions — Ghost lifecycle fix (2026-06-01)
    # The missing hinge in the lifecycle: PROXIMA_APERTURA -> CELEBRANDOSE.
    # Time-driven promotion. Flips any pre-auction whose opensAt has arrived
    # (and which hasn't already ended) to live, emitting auction.go_live +
    # an AuctionStatusHistory row in the SAME transaction (mirrors the sweep).
    # -----------------------------------------------------------------------

    def promote_pending_auctions(self):
        """
        Promote PROXIMA_APERTURA -> CELEBRANDOSE when opensAt has arrived.

        Rule: status='PROXIMA_APERTURA' AND opensAt IS NOT NULL AND opensAt <= now
              AND (endsAt IS NULL OR endsAt > now).
        The endsAt guard prevents promoting a window that has already closed
        (that case is the sweep's job once both opensAt and endsAt are past).

        Emits auction.go_live (via emit_status_change, which auto-selects the
        go_live event type for a CELEBRANDOSE transition out of PROXIMA) and an
        AuctionStatusHistory row, in the same psycopg2 transaction as the UPDATE.
        """
        self.log("Promoting pending pre-auctions (PROXIMA_APERTURA -> CELEBRANDOSE)...")

        is_postgres = DATABASE_URL and ('postgresql://' in DATABASE_URL or 'postgres://' in DATABASE_URL)
        if not is_postgres:
            self.log("  Promotion skipped (not Postgres — no DATABASE_URL configured)")
            return

        try:
            conn = self._get_pg_conn()
            cursor = conn.cursor()
            now = datetime.utcnow()

            cursor.execute(f"""
                SELECT id, "boeId", "endsAt", status, title,
                       "boeLink", province, municipality,
                       "appraisalValue", "currentBid", "opensAt"
                FROM "Auction"
                WHERE status = 'PROXIMA_APERTURA'
                  AND "opensAt" IS NOT NULL
                  AND "opensAt" <= %s
                  AND ("endsAt" IS NULL OR "endsAt" > %s)
                  AND {LEGACY_EXCLUSION_SQL}
            """, (now, now))
            pending = cursor.fetchall()

            if not pending:
                self.log("  No pre-auctions due for promotion")
                cursor.close()
                conn.close()
                return

            self.log(f"  Found {len(pending)} pre-auctions to promote")

            # Same import shim the sweep uses (sys.path '/' + app. prefix).
            sys.path.insert(0, '/')
            from app.database.outbox import emit_status_change

            promoted_ids = [row[0] for row in pending]
            cursor.execute("""
                UPDATE "Auction"
                SET status = 'CELEBRANDOSE',
                    "transitionedAt" = %s,
                    "updatedAt" = %s
                WHERE id = ANY(%s)
            """, (now, now, promoted_ids))

            for (
                auction_id, boe_id, ends_at, from_status, title,
                boe_link, province, municipality,
                appraisal_value, current_bid, opens_at,
            ) in pending:
                try:
                    emit_status_change(
                        cursor,
                        auction_id=auction_id,
                        boe_id=boe_id or "",
                        boe_link=boe_link or f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
                        title=title or "",
                        from_status=from_status,          # PROXIMA_APERTURA
                        to_status="CELEBRANDOSE",         # -> go_live event
                        province=province or "",
                        municipality=municipality or "",
                        appraisal_value=float(appraisal_value or 0),
                        current_bid=float(current_bid) if current_bid else None,
                        ends_at=ends_at,
                        detected_by="scheduler.promote_pending_auctions",
                    )
                except Exception as e:
                    self.log(f"  Warning: go_live outbox write failed for {boe_id}: {e}")

            conn.commit()
            self.log(f"  Promoted {len(pending)} pre-auctions to CELEBRANDOSE (go_live emitted)")

            cursor.close()
            conn.close()

        except Exception as e:
            self.log(f"  Error in promote_pending_auctions: {e}")
            import traceback
            self.log(traceback.format_exc())

    # -----------------------------------------------------------------------
    # scrape_pulse — Wave 1 close-out (direct psycopg2) + Wave 2a (outbox)
    # -----------------------------------------------------------------------

    def scrape_pulse(self):
        """
        Quick bid updates for active auctions (pulse mode).
        Wave 1 close-out: bypasses tasks/__init__.py Celery import via sys.path + direct import.
        Wave 2a: emits auction.new_bid outbox event + AuctionBidHistory when bid changes.
        """
        self.log("Running pulse mode (bid updates)...")

        is_postgres = DATABASE_URL and ('postgresql://' in DATABASE_URL or 'postgres://' in DATABASE_URL)

        if not is_postgres:
            self.log("  Pulse skipped (not Postgres — no DATABASE_URL configured)")
            return

        try:
            import psycopg2

            # Import BOEScraper via sys.path trick (avoids tasks/__init__.py -> celery crash)
            sys.path.insert(0, '/')
            from app.scrapers.boe_scraper import BOEScraper

            conn = self._get_pg_conn()
            cursor = conn.cursor()

            # Fetch live boeIds
            cursor.execute(f"""
                SELECT id, "boeId", "currentBid", title, "boeLink",
                       province, municipality, "appraisalValue", "endsAt"
                FROM "Auction"
                WHERE status IN ('CELEBRANDOSE', 'ACTIVE')
                  AND {LEGACY_EXCLUSION_SQL}
                ORDER BY "endsAt" ASC NULLS LAST
            """)
            auctions = cursor.fetchall()
            self.log(f"  Pulse targeting {len(auctions)} live auctions")

            if not auctions:
                self.log("  No live auctions to pulse")
                cursor.close()
                conn.close()
                return

            sys.path.insert(0, '/')
            from app.database.outbox import emit_new_bid

            scraper = BOEScraper()
            updated_count = 0

            for (
                auction_id, boe_id, prev_bid, title,
                boe_link, province, municipality,
                appraisal_value, ends_at,
            ) in auctions:
                try:
                    new_bid = scraper.update_bid(boe_id)
                    if new_bid is not None:
                        # Only write outbox + history if bid actually changed
                        prev_bid_f = float(prev_bid) if prev_bid else None
                        if prev_bid_f is None or abs(new_bid - prev_bid_f) > 0.01:
                            # Bid-only update (G2 fix — no corrupt upsert)
                            cursor.execute("""
                                UPDATE "Auction"
                                SET "currentBid" = %s, "updatedAt" = NOW()
                                WHERE "boeId" = %s
                            """, (new_bid, boe_id))

                            emit_new_bid(
                                cursor,
                                auction_id=auction_id,
                                boe_id=boe_id,
                                boe_link=boe_link or f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
                                title=title or "",
                                new_bid=new_bid,
                                previous_bid=prev_bid_f,
                                province=province or "",
                                municipality=municipality or "",
                                appraisal_value=float(appraisal_value or 0),
                                ends_at=ends_at,
                            )
                            conn.commit()
                            updated_count += 1
                except Exception as e:
                    self.log(f"  Pulse error for {boe_id}: {e}")

            cursor.close()
            conn.close()
            self.log(f"  Pulse complete: updated {updated_count}/{len(auctions)} auctions")

        except Exception as e:
            self.log(f"  Pulse exception: {e}")
            import traceback
            self.log(traceback.format_exc())

    # -----------------------------------------------------------------------
    # run_daily_update_scraper — Wave 1 close-out (inline BOEParallelScraper)
    # -----------------------------------------------------------------------

    def run_daily_update_scraper(self):
        """
        Rolling 5-day BOE update scraper.
        Wave 1 close-out: runs inline BOEParallelScraper (no subprocess to /scripts).
        Province fix (Wave 2a): BOEParallelScraper now derives province from municipality
        via municipality_province.py — new rows will have correct province.
        """
        self.log("Running BOE daily update scraper (last 5 days)...")

        try:
            sys.path.insert(0, '/')
            from app.scrapers.boe_parallel_scraper import BOEParallelScraper
            import psycopg2

            conn = self._get_pg_conn() if DATABASE_URL else None

            today = datetime.now()
            start = today - timedelta(days=5)

            scraper = BOEParallelScraper(scraper_id=1)
            progress = scraper.scrape_date_range(
                start_year=start.year, start_month=start.month, start_day=start.day,
                end_year=today.year, end_month=today.month, end_day=today.day,
                resume=False,  # Always fresh 5-day window
            )

            total = progress.get('total_auctions', 0)
            errors = len(progress.get('errors', []))
            self.log(f"  Daily update complete: fetched={total}, errors={errors}")

            if conn:
                conn.close()

        except Exception as e:
            self.log(f"  Daily update exception: {e}")
            import traceback
            self.log(traceback.format_exc())

    # -----------------------------------------------------------------------
    # Per-category daily updates (Phase 2) — one method per BOE "Tipo de
    # subasta" family, each registered 4x/day on its own schedule. The judicial
    # family is already covered by run_daily_update_scraper (the unfiltered
    # BOEParallelScraper); these add the four NEW families. Each imports its own
    # per-category scraper module (Dennis's directive: one script per category)
    # which all share the extraction guts via CategoryBOEScraper.
    # -----------------------------------------------------------------------

    def _run_category_update(self, module_name: str, label: str):
        """Run one per-category daily update via its module's run_daily_update()."""
        self.log(f"Running {label} category update...")
        try:
            sys.path.insert(0, '/')
            import importlib
            mod = importlib.import_module(f"app.scrapers.{module_name}")
            progress = mod.run_daily_update()
            total = (progress or {}).get('total_auctions', 0)
            errors = len((progress or {}).get('errors', []))
            self.log(f"  {label} update complete: fetched={total}, errors={errors}")
        except Exception as e:
            self.log(f"  {label} update exception: {e}")
            import traceback
            self.log(traceback.format_exc())

    def run_notarial_update(self):
        self._run_category_update("notarial_scraper", "NOTARIAL")

    def run_aeat_update(self):
        self._run_category_update("aeat_scraper", "AEAT")

    def run_otras_tributarias_update(self):
        self._run_category_update("otras_tributarias_scraper", "OTRAS_TRIBUTARIAS")

    def run_administrativas_update(self):
        self._run_category_update("administrativas_scraper", "ADMINISTRATIVAS")

    def trigger_alert_check(self):
        """Trigger /api/alerts/check after daily refresh jobs.

        Wave 2c fix:
          - Was POSTing `{APP_BASE_URL}/subastas/api/alerts/check` — the
            /subastas basePath was removed 2026-06-02 so that URL 404s.
          - Was sending no auth header — the route now requires admin-or-cron
            (Bearer CRON_SECRET) so it would 401 even with the right path.
          - Endpoint now overridable via `ALERT_CHECK_ENDPOINT` (mirrors
            DISPATCH_ENDPOINT so we can target the docker-internal host inside
            the compose network and skip Traefik).
        """
        if not CRON_SECRET:
            self.log("  trigger_alert_check: skipped (CRON_SECRET not set)")
            return
        self.log("Triggering alert check endpoint...")
        try:
            req = urllib.request.Request(
                ALERT_CHECK_ENDPOINT,
                data=b'{}',
                headers={
                    'Authorization': f'Bearer {CRON_SECRET}',
                    'Content-Type': 'application/json',
                },
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                body = response.read().decode('utf-8', errors='replace')
                self.log(f"  Alert check triggered ({response.status}): {body[:200]}")
        except Exception as e:
            self.log(f"  Alert check failed: {e}")

    def run_daily_update_and_alerts(self):
        self.run_daily_update_scraper()
        self.trigger_alert_check()

    # Geocoder drain — keeps coordinate coverage from decaying as fresh
    # ACTIVE/PRE_AUCTION rows land. Calls the existing backfill task which
    # honours DATABASE_URL via DatabaseAdapter, so this writes to Postgres
    # in prod (not the dev SQLite file).
    def geocode_drain(self):
        if not DATABASE_URL or ('postgres' not in DATABASE_URL):
            self.log("  geocode_drain: skipped (no Postgres DATABASE_URL)")
            return
        try:
            sys.path.insert(0, '/')
            from app.tasks.backfill_tasks import geocode_missing_coordinates

            batch = int(os.getenv("GEOCODE_BATCH_SIZE", "25"))
            result = geocode_missing_coordinates(batch_size=batch, active_only=True)
            if result:
                self.log(
                    f"  geocode_drain: processed={result.get('processed')} "
                    f"geocoded={result.get('geocoded')} failed={result.get('failed')} "
                    f"precision={result.get('precision')}"
                )
        except Exception as e:
            self.log(f"  geocode_drain: error {type(e).__name__}: {e}")
            import traceback
            self.log(traceback.format_exc())

    # Wave 2b: dispatcher cron trigger — drains event_outbox by POSTing the
    # cron-authed dispatch endpoint inside the docker network. Returns the
    # processed/failed/skipped counts the route reports.
    def dispatch_outbox(self):
        if not CRON_SECRET:
            self.log("  dispatch_outbox: skipped (CRON_SECRET not set)")
            return
        try:
            req = urllib.request.Request(
                DISPATCH_ENDPOINT,
                method="POST",
                headers={
                    "Authorization": f"Bearer {CRON_SECRET}",
                    "Content-Type": "application/json",
                },
                data=b"{}",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8", errors="replace")[:300]
                self.log(f"  dispatch_outbox: {resp.status} {body}")
        except Exception as e:
            self.log(f"  dispatch_outbox: error {type(e).__name__}: {e}")

    def setup_schedule(self):
        self.log("=" * 70)
        self.log("DNKSUBASTAS SCHEDULER STARTED")
        self.log("=" * 70)
        self.log("Sources: BOE daily scraper (last 5 days), pulse bid updates, status monitor")
        self.log(f"Postgres: {'YES' if DATABASE_URL else 'NO (SQLite dev mode)'}")
        self.log("=" * 70)

        # Pulse (bid updates) — every 35 min
        schedule.every(35).minutes.do(self.scrape_pulse)

        # Status monitor (expire + ending_soon) — every 30 min
        schedule.every(30).minutes.do(self.monitor_status_changes)

        # Promotion (PROXIMA_APERTURA -> CELEBRANDOSE when opensAt arrives)
        # — every 30 min. The time-driven hinge the lifecycle was missing.
        schedule.every(30).minutes.do(self.promote_pending_auctions)

        # Daily BOE update (JUDICIAL family) + alert trigger — 08:00, 14:00, 20:00
        schedule.every().day.at("08:00").do(self.run_daily_update_and_alerts)
        schedule.every().day.at("14:00").do(self.run_daily_update_and_alerts)
        schedule.every().day.at("20:00").do(self.run_daily_update_and_alerts)

        # Phase 2: per-category updates, each 4x/day on its own staggered
        # schedule (offset from the judicial slots + from each other so we never
        # launch two Playwright browsers at the same minute on a small box).
        # NOTARIAL is the proven template wired now; AEAT / OTRAS_TRIBUTARIAS /
        # ADMINISTRATIVAS are registered the same way (Stage 2) once verified.
        for t in ("06:30", "12:30", "18:30", "23:30"):
            schedule.every().day.at(t).do(self.run_notarial_update)
        # --- Stage 2 (verified end-to-end on live PG 2026-06-01) ---
        for t in ("06:45", "12:45", "18:45", "23:45"):
            schedule.every().day.at(t).do(self.run_aeat_update)
        for t in ("07:00", "13:00", "19:00", "00:00"):
            schedule.every().day.at(t).do(self.run_otras_tributarias_update)
        for t in ("07:15", "13:15", "19:15", "00:15"):
            schedule.every().day.at(t).do(self.run_administrativas_update)

        # Wave 2b: dispatcher drain — every DISPATCH_INTERVAL_MIN minutes
        schedule.every(DISPATCH_INTERVAL_MIN).minutes.do(self.dispatch_outbox)

        # Geocode drain — every GEOCODE_INTERVAL_MIN minutes (default 10).
        # Going-forward wiring for T3: new ACTIVE rows get coords without
        # needing the manual backfill scripts.
        geocode_interval = int(os.getenv("GEOCODE_INTERVAL_MIN", "10"))
        schedule.every(geocode_interval).minutes.do(self.geocode_drain)

        self.log("Schedule configured:")
        self.log("  Pulse (bid updates):  Every 35 min")
        self.log("  Status monitor:       Every 30 min")
        self.log("  Promotion (go-live):  Every 30 min (PROXIMA_APERTURA -> CELEBRANDOSE)")
        self.log(f"  Daily BOE + alerts:   08:00, 14:00, 20:00 (JUDICIAL)")
        self.log(f"  Notarial update:      06:30, 12:30, 18:30, 23:30 (4x/day)")
        self.log(f"  AEAT update:          06:45, 12:45, 18:45, 23:45 (4x/day)")
        self.log(f"  OtrasTrib update:     07:00, 13:00, 19:00, 00:00 (4x/day)")
        self.log(f"  Administrativas:      07:15, 13:15, 19:15, 00:15 (4x/day)")
        self.log(f"  Dispatch outbox:      Every {DISPATCH_INTERVAL_MIN} min")
        self.log(f"  Geocode drain:        Every {geocode_interval} min (active rows only)")
        self.log(f"  ending_soon window:   {ENDING_SOON_HOURS}h before endsAt")
        self.log(f"  dispatch endpoint:    {DISPATCH_ENDPOINT}")
        self.log("")

        # Run initial checks immediately
        self.log("Running initial monitor check...")
        self.monitor_status_changes()
        # Initial promotion sweep so any already-due pre-auction goes live on boot.
        self.log("Running initial promotion check...")
        self.promote_pending_auctions()
        # Initial dispatcher drain so anything queued before scheduler started
        # gets picked up on boot.
        self.log("Running initial dispatcher drain...")
        self.dispatch_outbox()

    def run(self):
        self.setup_schedule()
        try:
            while True:
                schedule.run_pending()
                time.sleep(60)
        except KeyboardInterrupt:
            self.log("Scheduler stopped by user")
        except Exception as e:
            self.log(f"Fatal error: {e}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='DNKSubastas Scheduler')
    parser.add_argument('--once', action='store_true', help='Run monitor once and exit')
    parser.add_argument('--pulse-once', action='store_true', help='Run pulse once and exit')
    parser.add_argument('--promote-once', action='store_true', help='Run promotion once and exit')

    args = parser.parse_args()
    scheduler = ScraperScheduler()

    if args.once:
        scheduler.log("Running monitor once...")
        scheduler.monitor_status_changes()
    elif args.pulse_once:
        scheduler.log("Running pulse once...")
        scheduler.scrape_pulse()
    elif args.promote_once:
        scheduler.log("Running promotion once...")
        scheduler.promote_pending_auctions()
    else:
        scheduler.run()


if __name__ == '__main__':
    main()
