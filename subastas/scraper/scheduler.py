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
import threading
import json
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


class ScraperScheduler:
    def __init__(self):
        self.log_file = LOG_DIR / f"scheduler_{datetime.now().strftime('%Y%m%d')}.log"
        # Serialize all sync-Playwright scrape jobs so two never launch a
        # browser at the same instant on the small box (the staggered schedule
        # already spaces them, but jobs that overrun must still not overlap).
        self._scrape_lock = threading.Lock()

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
    # _run_sync_scrape — P0 asyncio-loop crash fix (2026-06-03, Ghost)
    # -----------------------------------------------------------------------
    # ROOT CAUSE (reproduced locally): the scheduler is ONE long-lived thread
    # running every job in sequence via `schedule.run_pending()`. The sync
    # Playwright scrapers (`sync_playwright().start()`) install a greenlet-
    # driven event loop on the thread for the lifetime of each run. If a run's
    # teardown is ever skipped or swallowed (the old `_close_own_browser` had a
    # bare `except: pass`, and any mid-batch crash left `_playwright` started),
    # a RUNNING event loop is left bound to the thread. Every SUBSEQUENT
    # `sync_playwright().start()` on that same thread then hits Playwright's
    # guard and raises "Sync API inside the asyncio loop" — which is exactly the
    # crash seen for ALL category scrapers + the judicial daily, every batch,
    # with "...update complete" never reaching a fetched>0. One poisoned run
    # poisons the whole process for its lifetime.
    #
    # FIX (job-order independent, bulletproof): run EVERY sync-Playwright scrape
    # entrypoint on a FRESH dedicated thread. A brand-new thread has NO event
    # loop bound, so `sync_playwright().start()` always starts clean regardless
    # of what any prior job (geocode_drain, a crashed scrape, anything) left on
    # the scheduler's main thread. Verified locally: with the main thread
    # deliberately poisoned (a running loop left by an un-stopped sync
    # Playwright), the main-thread start FAILS but the fresh-thread start
    # SUCCEEDS. The `_scrape_lock` keeps two scrapes from overlapping browsers.
    def _run_sync_scrape(self, label, fn, *args, **kwargs):
        """
        Run a sync-Playwright scrape callable on a fresh, loop-free thread.

        Returns whatever `fn` returns. Re-raises nothing — the caller's own
        try/except logs the outcome — but if the worker thread raises we log it
        LOUDLY here (not silently swallowed) and return None so the caller sees
        fetched=0 with a visible traceback rather than a masked success.
        """
        box = {}

        def _worker():
            try:
                box['result'] = fn(*args, **kwargs)
            except BaseException as e:  # noqa: BLE001 — capture to re-surface
                box['error'] = e
                import traceback
                box['traceback'] = traceback.format_exc()

        with self._scrape_lock:
            t = threading.Thread(target=_worker, name=f"scrape-{label}", daemon=False)
            t.start()
            t.join()

        if 'error' in box:
            self.log(f"  [{label}] scrape thread crashed: "
                     f"{type(box['error']).__name__}: {box['error']}")
            self.log(box.get('traceback', ''))
            return None
        return box.get('result')

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

                # ---- Mechanism 1: FREEZE-AT-CLOSE (wipe-immune) ----
                # Persist the last live puja máxima captured during CELEBRANDOSE
                # as the frozen result, in the SAME transaction, BEFORE the
                # portal can wipe the amount (JC/RC/JV/NE finalization). Only
                # rows carrying a live puja signal are frozen; the rest stay
                # saleResult NULL for the daily re-scrape (Mechanism 2).
                self._freeze_sale_results(cursor, expired_ids, now)

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
    # cleanup_withdrawn_preauctions — withdrawn-before-opening sweep
    # -----------------------------------------------------------------------
    # Dennis's rule: an upcoming (PROXIMA_APERTURA) auction that DISAPPEARS from
    # BOE before it ever opens (withdrawn / cancelled, never reaches public
    # auction) must be REMOVED from the public site but KEPT internally with its
    # full state history.
    #
    # Detection without a schema change: the idempotent boe_id upsert
    # (adapter.py) stamps "updatedAt" = now on EVERY re-discovery of an existing
    # row. So a PROXIMA_APERTURA row that is STILL in BOE's PA results gets its
    # "updatedAt" advanced on each discovery pass. A row whose "updatedAt" has
    # NOT advanced in GRACE_WINDOW (36h ~= 6 consecutive 6h discovery misses) is
    # genuinely gone from BOE — a consecutive-miss counter with no counter column.
    #
    # Candidate predicate:
    #   status = 'PROXIMA_APERTURA'        -- upcoming, not yet promoted
    #   AND opensAt IS NULL                -- never got an opening date (a row WITH
    #                                         a future opensAt is promote_pending's
    #                                         job, not a withdrawal candidate)
    #   AND updatedAt < now() - 36h        -- missed ~6 consecutive discovery runs
    #
    # FALSE-REMOVAL FLOOR: this sweep runs ONLY at the tail of a real discovery
    # pass, and is SKIPPED entirely if that pass found 0 results. A flaky / empty
    # / BOE-down run must never trigger a mass withdrawal of the whole bucket.
    #
    # Transition: candidates -> CANCELADA, stamping suspensionReason =
    # 'WITHDRAWN_PRE_AUCTION', flipped through emit_status_change so the prior
    # state (PROXIMA_APERTURA -> CANCELADA) is retained in AuctionStatusHistory.
    # NO hard-delete. NO schema add. CANCELADA is not in ACTIVE_DB_STATUSES (542
    # untouched) and not in the Próximas bucket -> gone from those public surfaces.
    # (CANCELADA still leaks into the public "Finalizadas" tab — a small Forge
    # follow-up must EXCLUDE suspensionReason='WITHDRAWN_PRE_AUCTION' there before
    # any row is actually withdrawn; flagged to Ken, NOT done here.)
    #
    # GRACE_WINDOW is tunable via PREAUCTION_WITHDRAW_GRACE_HOURS (default 36).
    # -----------------------------------------------------------------------
    def cleanup_withdrawn_preauctions(self, found_this_run):
        """
        Withdraw PROXIMA_APERTURA rows that disappeared from BOE before opening.

        Runs at the TAIL of run_preauction_discovery() only. `found_this_run` is
        the discovery pass's found count; if it is <= 0 the sweep is skipped to
        avoid mass false-removal on a flaky/empty BOE run.

        Candidates (status='PROXIMA_APERTURA' AND opensAt IS NULL AND
        updatedAt < now - GRACE_WINDOW) flip to CANCELADA with
        suspensionReason='WITHDRAWN_PRE_AUCTION' via emit_status_change, which
        writes EventOutbox (auction.finished) + AuctionStatusHistory in the same
        transaction. No hard-delete, no schema change.
        """
        # ---- False-removal floor: never sweep on an empty/flaky discovery run --
        if not found_this_run or found_this_run <= 0:
            self.log(
                "  Withdrawal sweep skipped — discovery found 0 this run "
                "(avoiding false mass-removal of PROXIMA_APERTURA bucket)"
            )
            return

        is_postgres = DATABASE_URL and ('postgresql://' in DATABASE_URL or 'postgres://' in DATABASE_URL)
        if not is_postgres:
            self.log("  Withdrawal sweep skipped (not Postgres — no DATABASE_URL configured)")
            return

        grace_hours = int(os.getenv("PREAUCTION_WITHDRAW_GRACE_HOURS", "36"))

        self.log(
            f"Sweeping withdrawn pre-auctions "
            f"(PROXIMA_APERTURA, opensAt NULL, not re-seen in {grace_hours}h)..."
        )

        try:
            conn = self._get_pg_conn()
            cursor = conn.cursor()
            now = datetime.utcnow()
            stale_before = now - timedelta(hours=grace_hours)

            # Candidate predicate: upcoming, never opened, missed ~6 runs.
            cursor.execute(f"""
                SELECT id, "boeId", "endsAt", status, title,
                       "boeLink", province, municipality,
                       "appraisalValue", "currentBid", "updatedAt"
                FROM "Auction"
                WHERE status = 'PROXIMA_APERTURA'
                  AND "opensAt" IS NULL
                  AND "updatedAt" < %s
                  AND {LEGACY_EXCLUSION_SQL}
            """, (stale_before,))
            candidates = cursor.fetchall()

            if not candidates:
                self.log("  No withdrawn pre-auctions to sweep")
                cursor.close()
                conn.close()
                return

            self.log(f"  Found {len(candidates)} withdrawn pre-auctions to withdraw -> CANCELADA")

            # Same import shim promote_pending_auctions uses.
            sys.path.insert(0, '/')
            from app.database.outbox import emit_status_change

            withdrawn_ids = [row[0] for row in candidates]
            # Flip to CANCELADA + stamp the WITHDRAWN_PRE_AUCTION sentinel so the
            # frontend can distinguish a withdrawn-pre-auction from a normal
            # cancelled-after-opening. NO hard-delete — the row stays SELECTable.
            cursor.execute("""
                UPDATE "Auction"
                SET status = 'CANCELADA',
                    "suspensionReason" = 'WITHDRAWN_PRE_AUCTION',
                    "transitionedAt" = %s,
                    "updatedAt" = %s
                WHERE id = ANY(%s)
            """, (now, now, withdrawn_ids))

            for (
                auction_id, boe_id, ends_at, from_status, title,
                boe_link, province, municipality,
                appraisal_value, current_bid, updated_at,
            ) in candidates:
                # Record Dennis wants: boeId + prior state per withdrawal.
                self.log(
                    f"    Withdrew {boe_id} (prior state {from_status}, "
                    f"last seen {updated_at}) -> CANCELADA"
                )
                try:
                    emit_status_change(
                        cursor,
                        auction_id=auction_id,
                        boe_id=boe_id or "",
                        boe_link=boe_link or f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
                        title=title or "",
                        from_status=from_status,                 # PROXIMA_APERTURA
                        to_status="CANCELADA",                   # -> auction.finished event + history
                        province=province or "",
                        municipality=municipality or "",
                        appraisal_value=float(appraisal_value or 0),
                        current_bid=float(current_bid) if current_bid else None,
                        ends_at=ends_at,
                        suspension_reason="WITHDRAWN_PRE_AUCTION",
                        detected_by="scheduler.cleanup_withdrawn_preauctions",
                    )
                except Exception as e:
                    self.log(f"  Warning: withdrawal outbox write failed for {boe_id}: {e}")

            conn.commit()
            self.log(
                f"  Withdrew {len(candidates)} pre-auctions "
                f"(disappeared from BOE, never opened) -> CANCELADA "
                f"(history retained, no hard-delete)"
            )

            cursor.close()
            conn.close()

        except Exception as e:
            self.log(f"  Error in cleanup_withdrawn_preauctions: {e}")
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
    # recheck_suspended_auctions — daily SUSPENDIDA reopen-recheck (Ghost)
    # -----------------------------------------------------------------------
    # Dennis's rule: BOE states "La Autoridad Gestora puede reanudar la subasta
    # en cualquier momento" — a suspended auction can reopen ANY day, and the
    # "Fecha de reanudación prevista" is only a forecast, not a guarantee. The
    # daily 5-day celebration-window scrape (run_daily_update_scraper) never
    # revisits SUSPENDIDA rows whose closing date is outside the window, so a
    # reopen would otherwise go undetected until the next full active backfill.
    #
    # This pass is the SUSPENDIDA parallel of promote_pending_auctions: it
    # re-scrapes EVERY SUSPENDIDA row's BOE detail page and, when BOE no longer
    # shows the suspension banner (the auction is active again), flips the row
    # SUSPENDIDA -> CELEBRANDOSE and emits the status change (emit_status_change
    # auto-selects auction.go_live for this transition, so alerts fire — exactly
    # like the PA promotion). It also captures resumeAt + suspensionMotive on the
    # rows that stay suspended (the detail fetch carries them for free).
    #
    # FALSE-FLIP GUARD: a flip happens ONLY on a CONFIRMED successful detail
    # parse (the real return dict, not the empty-on-exception fallback) whose
    # status banner is gone. A fetch failure / transient miss leaves the row
    # SUSPENDIDA untouched — never flipped on a guess. Idempotent by boeId: a
    # row already flipped is no longer SUSPENDIDA so the next pass skips it; the
    # go_live dedupeKey (auctionId:auction.go_live:live) also de-dupes the event.
    def recheck_suspended_auctions(self):
        """Re-scrape every SUSPENDIDA row; flip -> CELEBRANDOSE on BOE reopen."""
        self.log("Rechecking SUSPENDIDA auctions for BOE reopen...")

        is_postgres = DATABASE_URL and ('postgresql://' in DATABASE_URL or 'postgres://' in DATABASE_URL)
        if not is_postgres:
            self.log("  Suspended recheck skipped (not Postgres — no DATABASE_URL)")
            return

        try:
            conn = self._get_pg_conn()
            cursor = conn.cursor()
            cursor.execute(f"""
                SELECT id, "boeId", "endsAt", title, "boeLink",
                       province, municipality, "appraisalValue", "currentBid"
                FROM "Auction"
                WHERE status = 'SUSPENDIDA'
                  AND "boeId" IS NOT NULL
                  AND {LEGACY_EXCLUSION_SQL}
                ORDER BY "boeId" ASC
            """)
            suspended = cursor.fetchall()
            cursor.close()
            conn.close()
        except Exception as e:
            self.log(f"  Suspended recheck: scope query failed: {e}")
            return

        if not suspended:
            self.log("  No SUSPENDIDA rows to recheck")
            return

        self.log(f"  Rechecking {len(suspended)} SUSPENDIDA rows")

        # Build the scraper + run all detail fetches on ONE fresh loop-free
        # thread (the asyncio-loop fix): a single sync-Playwright lifecycle for
        # the whole batch, sequential page loads, no overlap with other jobs.
        def _recheck():
            os.environ.setdefault("BOE_FETCH_DETAIL", "1")
            sys.path.insert(0, '/')
            from app.scrapers.boe_scraper import BOEScraper
            from app.database.outbox import emit_status_change
            scraper = BOEScraper()

            reopened = still_susp = terminal = failed = 0
            conn2 = self._get_pg_conn()
            now = datetime.utcnow()

            for (auction_id, boe_id, ends_at, title, boe_link,
                 province, municipality, appraisal_value, current_bid) in suspended:
                try:
                    info = scraper._fetch_detail_info(boe_id)
                    # Confirmed successful parse only: the full return dict has an
                    # 'identificador' key; the empty-on-exception fallback never
                    # does. A failed fetch leaves the row SUSPENDIDA (no guess).
                    if 'identificador' not in info:
                        failed += 1
                        continue

                    detail_status = info.get('detail_status')
                    di_ends = info.get('ends_at')
                    eff_ends = di_ends if di_ends is not None else ends_at

                    # Decide the transition from the authoritative detail banner.
                    if detail_status == 'SUSPENDIDA':
                        # Still suspended — refresh resumeAt + motive (honest-NULL
                        # safe: only overwrite when BOE actually states a value).
                        still_susp += 1
                        sets, params = [], []
                        if info.get('resume_at') is not None:
                            sets.append('"resumeAt" = %s'); params.append(info['resume_at'])
                        if info.get('suspension_motive') is not None:
                            sets.append('"suspensionMotive" = %s'); params.append(info['suspension_motive'])
                        if sets:
                            params.append(auction_id)
                            c = conn2.cursor()
                            c.execute(
                                f'UPDATE "Auction" SET {", ".join(sets)}, "updatedAt" = NOW() WHERE id = %s',
                                params)
                            conn2.commit(); c.close()
                        continue

                    if detail_status in ('CANCELADA', 'CONCLUIDA_PORTAL'):
                        # The suspension resolved into a terminal state — honor it
                        # (keeps a concluded/cancelled auction from staying stuck
                        # SUSPENDIDA). emit_status_change -> auction.finished.
                        c = conn2.cursor()
                        c.execute(
                            'UPDATE "Auction" SET status = %s, "transitionedAt" = %s, "updatedAt" = %s WHERE id = %s',
                            (detail_status, now, now, auction_id))
                        emit_status_change(
                            c, auction_id=auction_id, boe_id=boe_id or "",
                            boe_link=boe_link or f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
                            title=title or "", from_status='SUSPENDIDA', to_status=detail_status,
                            province=province or "", municipality=municipality or "",
                            appraisal_value=float(appraisal_value or 0),
                            current_bid=float(current_bid) if current_bid else None,
                            ends_at=eff_ends, detected_by="scheduler.recheck_suspended_auctions")
                        conn2.commit(); c.close()
                        terminal += 1
                        continue

                    # detail_status is None => no banner on a confirmed-parsed
                    # page => the suspension is LIFTED => reopened. Flip to
                    # CELEBRANDOSE only if the window has not already closed.
                    if eff_ends is not None and eff_ends <= now:
                        # Reopened but already past its close -> let the normal
                        # sweep conclude it; do not resurrect a dead window.
                        still_susp += 1
                        continue

                    c = conn2.cursor()
                    c.execute(
                        'UPDATE "Auction" SET status = %s, "transitionedAt" = %s, "updatedAt" = %s WHERE id = %s',
                        ('CELEBRANDOSE', now, now, auction_id))
                    emit_status_change(
                        c, auction_id=auction_id, boe_id=boe_id or "",
                        boe_link=boe_link or f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
                        title=title or "", from_status='SUSPENDIDA', to_status='CELEBRANDOSE',
                        province=province or "", municipality=municipality or "",
                        appraisal_value=float(appraisal_value or 0),
                        current_bid=float(current_bid) if current_bid else None,
                        ends_at=eff_ends, detected_by="scheduler.recheck_suspended_auctions")
                    conn2.commit(); c.close()
                    reopened += 1
                    self.log(f"  REOPENED {boe_id}: SUSPENDIDA -> CELEBRANDOSE (go_live emitted)")
                except Exception as e:
                    failed += 1
                    self.log(f"  Suspended recheck error for {boe_id}: {e}")
                    try:
                        conn2.rollback()
                    except Exception:
                        pass

            conn2.close()
            return reopened, still_susp, terminal, failed

        result = self._run_sync_scrape("SUSPENDED_RECHECK", _recheck)
        if result is None:
            self.log("  Suspended recheck: thread crashed (see traceback above)")
            return
        reopened, still_susp, terminal, failed = result
        self.log(
            f"  Suspended recheck complete: reopened={reopened} "
            f"still_suspended={still_susp} terminal={terminal} failed={failed}"
        )

    # -----------------------------------------------------------------------
    # Mechanism 1 — FREEZE-AT-CLOSE (helper, called by monitor_status_changes)
    # -----------------------------------------------------------------------
    _sale_cols_checked = None  # cache: True/False whether sale-result cols exist

    def _freeze_sale_results(self, cursor, expired_ids, now):
        """Set-based freeze of the last live puja máxima for rows just marked
        CONCLUIDA_PORTAL, in the caller's transaction. Wipe-immune: reads the
        currentBidAmount/pujaStatus already captured live during CELEBRANDOSE.

        - CON_PUJA / currentBidAmount>0  -> saleResult=ADJUDICADA, soldPrice=cents
        - SIN_PUJA                        -> saleResult=DESIERTA
        - no live puja signal             -> left NULL for the daily re-scrape

        soldDate = endsAt (no true sale date exists on the portal). A freeze is a
        confirmed capture: resultCheckAttempts=0. Guarded so a pre-migration DB
        (Forge hasn't landed the columns yet) is a silent no-op. The number is the
        highest BID ("puja máxima"), never a confirmed legal sale.
        """
        if not expired_ids:
            return
        if self._sale_cols_checked is None:
            try:
                cursor.execute(
                    """SELECT count(*) FROM information_schema.columns
                       WHERE table_name='Auction'
                         AND column_name = ANY(%s)""",
                    (['saleResult', 'soldPrice', 'soldDate',
                      'resultCheckedAt', 'resultCheckAttempts'],),
                )
                self._sale_cols_checked = (cursor.fetchone()[0] == 5)
            except Exception:
                self._sale_cols_checked = False
        if not self._sale_cols_checked:
            self.log("  Freeze-at-close skipped (sale-result columns not migrated yet)")
            return
        try:
            cursor.execute(
                """
                UPDATE "Auction"
                SET "saleResult" = CASE
                        WHEN COALESCE("currentBidAmount",0) > 0
                             OR "pujaStatus" = 'CON_PUJA' THEN 'ADJUDICADA'
                        WHEN "pujaStatus" = 'SIN_PUJA'     THEN 'DESIERTA'
                    END,
                    "soldPrice" = CASE
                        WHEN COALESCE("currentBidAmount",0) > 0
                        THEN "currentBidAmount" END,
                    "soldDate" = "endsAt",
                    "resultCheckedAt" = %s,
                    "resultCheckAttempts" = 0
                WHERE id = ANY(%s)
                  AND "saleResult" IS NULL
                  AND ("pujaStatus" IS NOT NULL
                       OR COALESCE("currentBidAmount",0) > 0)
                """,
                (now, expired_ids),
            )
            self.log(f"  Freeze-at-close: {cursor.rowcount} concluded rows frozen (puja máxima)")
        except Exception as e:
            self.log(f"  Freeze-at-close failed (non-fatal): {e}")

    # -----------------------------------------------------------------------
    # Mechanism 2 — DAILY POST-CLOSE RE-SCRAPE (catch freeze misses + history)
    # -----------------------------------------------------------------------
    # Selects concluded rows still missing a saleResult and re-fetches ver=5 via
    # the lightweight requests fetcher (NO Playwright). Attempt-memory drain
    # (geocode-drain pattern): each undetermined pass bumps resultCheckAttempts +
    # stamps resultCheckedAt; after N=5 capture-less passes -> saleResult
    # SIN_RESULTADO, stop retrying. Bounded per run (--limit / RESULT_RESCRAPE_LIMIT)
    # so it never becomes an unbounded crawl — that is Mechanism 3's job.
    def recheck_sale_results(self, limit: int = 500, attempt_cap: int = 5):
        """Daily: re-scrape concluded rows with NULL saleResult; write result or
        bump the attempt counter. Requests-only, ~1 req/s jitter."""
        self.log("Rechecking concluded auctions for sale result (puja máxima)...")
        is_postgres = DATABASE_URL and ('postgresql://' in DATABASE_URL or 'postgres://' in DATABASE_URL)
        if not is_postgres:
            self.log("  Sale-result recheck skipped (not Postgres)")
            return
        try:
            sys.path.insert(0, '/')
            from app.database.adapter import get_database_adapter
            from app.scrapers.pujas_fetcher import make_session, fetch_pujas_result
            adapter = get_database_adapter()
            conn = self._get_pg_conn()
            cursor = conn.cursor()
            # Column guard — pre-migration = safe no-op.
            cursor.execute(
                """SELECT count(*) FROM information_schema.columns
                   WHERE table_name='Auction'
                     AND column_name = ANY(%s)""",
                (['saleResult', 'resultCheckedAt', 'resultCheckAttempts'],),
            )
            if cursor.fetchone()[0] != 3:
                self.log("  Sale-result recheck skipped (columns not migrated yet)")
                cursor.close(); conn.close()
                return
            cursor.execute(
                f"""
                SELECT "boeId", "endsAt"
                FROM "Auction"
                WHERE status = 'CONCLUIDA_PORTAL'
                  AND "endsAt" IS NOT NULL AND "endsAt" < NOW()
                  AND "saleResult" IS NULL
                  AND ("resultCheckedAt" IS NULL
                       OR "resultCheckedAt" < NOW() - INTERVAL '24 hours')
                  AND {LEGACY_EXCLUSION_SQL}
                ORDER BY "endsAt" DESC
                LIMIT %s
                """,
                (int(limit),),
            )
            rows = cursor.fetchall()
            cursor.close(); conn.close()
        except Exception as e:
            self.log(f"  Sale-result recheck: scope query failed: {e}")
            return

        if not rows:
            self.log("  No concluded rows pending a sale-result check")
            return
        self.log(f"  Re-scraping {len(rows)} concluded rows for sale result")

        session = make_session()
        captured = attempt = exhausted = failed = 0
        for boe_id, ends_at in rows:
            try:
                res = fetch_pujas_result(session, boe_id)
                sale_result = res.sale_result if res else None
                cents = res.sold_price_cents if res else None
                status = adapter.update_sale_result(
                    boe_id, sale_result=sale_result, sold_price_cents=cents,
                    sold_date=ends_at, mode='rescrape', attempt_cap=attempt_cap,
                )
                if status in ('captured', 'freeze'):
                    captured += 1
                elif status == 'exhausted':
                    exhausted += 1
                elif status == 'attempt':
                    attempt += 1
                else:
                    failed += 1
            except Exception as e:
                failed += 1
                self.log(f"  Sale-result recheck failed for {boe_id}: {e}")
        self.log(
            f"  Sale-result recheck complete: captured={captured} "
            f"attempt={attempt} exhausted={exhausted} failed={failed}"
        )

    # -----------------------------------------------------------------------
    # run_catastro_enrichment — Catastro DNPRC daily leg (Phase 1 Leg B, Ghost)
    # -----------------------------------------------------------------------
    # Enriches active rows that carry a 20-char cadastralRef with año-
    # construcción / uso / superficie from the FREE OVC Consulta_DNPRC web
    # service (DG Catastro, Ley 18/2015). Pure requests (urllib) — NO Playwright,
    # so no _run_sync_scrape lifecycle is needed.
    #
    #   scope     : cadastralRef IS NOT NULL AND (catastroCheckedAt IS NULL OR
    #               catastroCheckedAt < NOW() - 7 days). Fresh refs drain daily;
    #               everything with a ref is re-confirmed weekly at most — dead
    #               refs (cod 4/5) are stamped so they are NOT re-hammered daily.
    #   rate limit: 1 req/s HARD (jittered), sequential, timeout + retry-once.
    #               ~473 active refs -> full pool < 10 min.
    #   writes     : catastroYearBuilt (debi.ant), catastroUse (debi.luso),
    #               surfaceM2 = COALESCE(surfaceM2, debi.sfc) — fills the EXISTING
    #               surfaceM2 ONLY where NULL (scraped values never overwritten),
    #               catastroCheckedAt = NOW() on every resolved fetch AND on
    #               cod 4 / cod 5 / bad-checksum (so we stop retrying dead refs).
    #               A network error does NOT stamp -> retried next run.
    # -----------------------------------------------------------------------
    CATASTRO_RATE_SECONDS = 1.0        # 1 req/s hard floor
    CATASTRO_RECHECK_DAYS = 7          # re-confirm a ref weekly at most
    CATASTRO_ACTIVE_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "SUSPENDIDA")

    def run_catastro_enrichment(self, limit=None):
        """Daily Catastro DNPRC enrichment over ref-bearing active rows."""
        self.log("Running Catastro DNPRC enrichment...")

        is_postgres = DATABASE_URL and ('postgresql://' in DATABASE_URL or 'postgres://' in DATABASE_URL)
        if not is_postgres:
            self.log("  Catastro enrichment skipped (not Postgres — no DATABASE_URL)")
            return

        import random
        sys.path.insert(0, '/')
        try:
            from app.scrapers.catastro_client import consulta_dnprc
        except ImportError:
            from scrapers.catastro_client import consulta_dnprc

        # Guard: the catastro columns must exist (pre-migration safety).
        try:
            conn = self._get_pg_conn()
            cur = conn.cursor()
            cur.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_name = 'Auction'
                     AND column_name IN ('catastroYearBuilt','catastroUse','catastroCheckedAt')"""
            )
            present = {r[0] for r in cur.fetchall()}
            if 'catastroCheckedAt' not in present:
                self.log("  Catastro enrichment skipped (columns absent — apply "
                         "migration 20260711_add_property_attrs_catastro first)")
                cur.close(); conn.close()
                return

            cur.execute(
                f"""
                SELECT id, "boeId", "cadastralRef", "surfaceM2"
                FROM "Auction"
                WHERE "cadastralRef" IS NOT NULL
                  AND (status = ANY(%s::"AuctionStatus"[]))
                  AND ("catastroCheckedAt" IS NULL
                       OR "catastroCheckedAt" < NOW() - INTERVAL '{self.CATASTRO_RECHECK_DAYS} days')
                ORDER BY "catastroCheckedAt" ASC NULLS FIRST, id ASC
                {"LIMIT %s" if limit else ""}
                """,
                (list(self.CATASTRO_ACTIVE_STATUSES),) + ((limit,) if limit else ()),
            )
            rows = cur.fetchall()
            cur.close(); conn.close()
        except Exception as e:
            self.log(f"  Catastro enrichment: scope query failed: {e}")
            return

        if not rows:
            self.log("  No cadastralRef rows due for Catastro enrichment")
            return

        self.log(f"  Enriching {len(rows)} ref-bearing rows @ 1 req/s")

        ok = malformed = not_found = bad_checksum = errors = 0
        surf_filled = year_filled = use_filled = 0
        conn = self._get_pg_conn()

        for i, (auction_id, boe_id, ref, surface_m2) in enumerate(rows):
            try:
                res = consulta_dnprc(ref, timeout=20.0)
                stamp = True   # stamp catastroCheckedAt unless it's a network error
                sets, params = [], []

                if res.status == "ok":
                    ok += 1
                    if res.year_built is not None:
                        sets.append('"catastroYearBuilt" = %s'); params.append(res.year_built); year_filled += 1
                    if res.use:
                        sets.append('"catastroUse" = %s'); params.append(res.use); use_filled += 1
                    # Fill surfaceM2 ONLY where currently NULL (never overwrite a
                    # scraped value). COALESCE keeps it idempotent.
                    if surface_m2 is None and res.surface_m2 is not None:
                        sets.append('"surfaceM2" = COALESCE("surfaceM2", %s)'); params.append(res.surface_m2); surf_filled += 1
                elif res.status == "malformed":      # cod 4 — corrupt ref (BOE source)
                    malformed += 1
                    self.log(f"  Catastro cod4 (malformed ref) {boe_id}: {ref}")
                elif res.status == "not_found":       # cod 5 — no existe
                    not_found += 1
                elif res.status == "checksum":        # local reject (bad control letters)
                    bad_checksum += 1
                    self.log(f"  Catastro checksum-defect {boe_id}: {ref}")
                else:                                  # network / parse error
                    errors += 1
                    stamp = False                      # retry next run

                if stamp:
                    sets.append('"catastroCheckedAt" = NOW()')
                if sets:
                    params.append(auction_id)
                    c = conn.cursor()
                    c.execute(f'UPDATE "Auction" SET {", ".join(sets)} WHERE id = %s', params)
                    conn.commit(); c.close()
            except Exception as e:
                errors += 1
                self.log(f"  Catastro error for {boe_id} ({ref}): {e}")
                try:
                    conn.rollback()
                except Exception:
                    pass

            # 1 req/s HARD floor, jittered up, between requests (skip after last).
            if i < len(rows) - 1:
                time.sleep(self.CATASTRO_RATE_SECONDS + random.random() * 0.4)

        conn.close()
        self.log(
            f"  Catastro enrichment complete: ok={ok} cod4={malformed} "
            f"cod5={not_found} checksum={bad_checksum} errors={errors} | "
            f"surfaceM2+{surf_filled} yearBuilt+{year_filled} use+{use_filled}"
        )

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

        def _do_scrape():
            # Imported + constructed INSIDE the fresh thread so the whole
            # sync-Playwright lifecycle lives on a loop-free thread.
            sys.path.insert(0, '/')
            from app.scrapers.boe_parallel_scraper import BOEParallelScraper

            today = datetime.now()
            start = today - timedelta(days=5)

            scraper = BOEParallelScraper(scraper_id=1)
            try:
                return scraper.scrape_date_range(
                    start_year=start.year, start_month=start.month, start_day=start.day,
                    end_year=today.year, end_month=today.month, end_day=today.day,
                    resume=False,  # Always fresh 5-day window
                )
            finally:
                scraper._close_own_browser()

        try:
            # P0 fix: run on a fresh, loop-free thread (see _run_sync_scrape).
            progress = self._run_sync_scrape("JUDICIAL", _do_scrape) or {}
            total = progress.get('total_auctions', 0)
            errors = len(progress.get('errors', []))
            self.log(f"  Daily update complete: fetched={total}, errors={errors}")

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

        def _do_scrape():
            # Import + run INSIDE the fresh thread so the per-category scraper's
            # sync-Playwright lifecycle (run_daily_update -> scrape_date_range ->
            # _get_own_browser) lives entirely on a loop-free thread.
            sys.path.insert(0, '/')
            import importlib
            mod = importlib.import_module(f"app.scrapers.{module_name}")
            return mod.run_daily_update()

        try:
            # P0 fix: run on a fresh, loop-free thread (see _run_sync_scrape).
            progress = self._run_sync_scrape(label, _do_scrape) or {}
            total = progress.get('total_auctions', 0)
            errors = len(progress.get('errors', []))
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

    def run_segsocial_update(self):
        # Seguridad Social (TGSS) seized-asset portal — source="SEGSOCIAL".
        # requests-based wizard walk (no Playwright), but still routed through
        # _run_category_update / _run_sync_scrape for uniform lifecycle + logging.
        self._run_category_update("segsocial_scraper", "SEGSOCIAL")

    def run_plabi_update(self):
        # PLABI (Ministerio de Justicia liquidation portal) — source="PLABI".
        # The #1 off-BOE source: concursal microenterprise asset liquidations
        # (Law 16/2022) that the BOE scrapers never see. requests-based, server-
        # rendered Liferay walk (no Playwright), routed through the uniform
        # _run_category_update / _run_sync_scrape lifecycle for logging parity.
        self._run_category_update("plabi_scraper", "PLABI")

    # -----------------------------------------------------------------------
    # run_preauction_discovery — BOE "Próxima apertura" (PA) discovery pass
    # -----------------------------------------------------------------------
    # The daily/category path queries only a celebration-DATE window and never
    # sets SUBASTA.ESTADO, so PROXIMA_APERTURA auctions (future apertura, no
    # closing date in the window) are structurally invisible -> the site's
    # "Próximas" filter returns 0. This dedicated pass queries SUBASTA.ESTADO=PA
    # directly (judicial-first, ORIGEN=J), forces status=PROXIMA_APERTURA, and
    # only ingests rows with a real FUTURE opensAt (pulled from the detail
    # "Fecha de inicio") so promote_pending_auctions can later flip them to
    # CELEBRANDOSE. Idempotent upsert by boe_id means a PA row that later appears
    # in the normal celebration scrape updates in place (no duplicate).
    #
    # Runs every 6h through _run_sync_scrape (loop-free thread) — same
    # asyncio-crash-avoidance contract as every other Playwright job.
    # -----------------------------------------------------------------------
    def run_preauction_discovery(self):
        """Run one BOE PA (Próxima apertura) discovery pass."""
        self.log("Running BOE pre-auction discovery (SUBASTA.ESTADO=PA)...")

        def _do_scrape():
            # Import + run INSIDE the fresh thread so the scraper's sync-
            # Playwright lifecycle (discover -> _get_own_browser) lives entirely
            # on a loop-free thread.
            sys.path.insert(0, '/')
            from app.scrapers.boe_preauction_scraper import run_discovery
            return run_discovery()

        try:
            progress = self._run_sync_scrape("PREAUCTION_PA", _do_scrape) or {}
            saved = progress.get('total_auctions', 0)
            found = progress.get('total_found', 0)
            errors = len(progress.get('errors', []))
            self.log(
                f"  Pre-auction discovery complete: found={found}, "
                f"saved(PROXIMA_APERTURA)={saved}, errors={errors}"
            )
            # Withdrawn-before-opening cleanup runs at the TAIL of the discovery
            # pass — on the back of fresh BOE truth, with the found>0 floor inside
            # cleanup_withdrawn_preauctions guarding against a flaky/empty run.
            # Not registered as its own job: it must only fire after a real pass.
            self.cleanup_withdrawn_preauctions(found)
        except Exception as e:
            self.log(f"  Pre-auction discovery exception: {e}")
            import traceback
            self.log(traceback.format_exc())

    def trigger_alert_check(self):
        """Trigger /api/alerts/check after daily refresh jobs.

        The app route is gated by requireAdminOrCron (Wave-2b lockdown): it
        accepts a cron caller only when it carries Authorization: Bearer
        <CRON_SECRET>. Without the header the route returns 401 (cron) then
        403 (admin), so NO alert emails go out. The secret lives in this
        container already (same value as the app), so we just attach it.
        """
        self.log("Triggering alert check endpoint...")
        if not CRON_SECRET:
            self.log("  Alert check skipped: CRON_SECRET not set")
            return
        try:
            # Internal container-to-container (same pattern as DISPATCH_ENDPOINT):
            # the public domain is behind Cloudflare which 403s server-to-server
            # box egress, and the app basePath was removed 2026-06-02 so there is
            # no /subastas/api route anymore. Hit the app over the docker network
            # on the correct (un-prefixed) path. Override via ALERT_CHECK_ENDPOINT.
            endpoint = os.getenv(
                "ALERT_CHECK_ENDPOINT",
                "http://dnksubastas-app:3005/api/alerts/check",
            )
            request = urllib.request.Request(
                endpoint,
                data=b'{}',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {CRON_SECRET}',
                },
                method='POST',
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read().decode('utf-8', errors='replace')
                self.log(f"  Alert check triggered ({response.status}): {body[:200]}")
        except Exception as e:
            self.log(f"  Alert check failed: {e}")

    def trigger_benchmark_recompute(self):
        """Trigger /api/admin/benchmark/recompute once daily.

        Rebuilds the RegionBenchmark table (atomic full replace) from the
        active+upcoming property pool so the region EUR/m2 value-signal stays
        fresh as ingest changes the pool. Same requireAdminOrCron gate as the
        alert-check route: it accepts a cron caller only with Authorization:
        Bearer <CRON_SECRET>, so we attach the secret already present in this
        container. The endpoint is idempotent and self-healing — a missed day
        is harmless, so a failure is logged non-fatally. Scheduled just after
        the daily catastro/refresh surface jobs (05:45) so the benchmark
        reflects the freshest year/use/surface enrichment.
        """
        self.log("Triggering benchmark recompute endpoint...")
        if not CRON_SECRET:
            self.log("  Benchmark recompute skipped: CRON_SECRET not set")
            return
        try:
            endpoint = os.getenv(
                "BENCHMARK_RECOMPUTE_ENDPOINT",
                "http://dnksubastas-app:3005/api/admin/benchmark/recompute",
            )
            request = urllib.request.Request(
                endpoint,
                data=b'{}',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {CRON_SECRET}',
                },
                method='POST',
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                body = response.read().decode('utf-8', errors='replace')
                stats = ''
                try:
                    parsed = json.loads(body)
                    s = parsed.get('stats') if isinstance(parsed, dict) else None
                    if isinstance(s, dict):
                        stats = (f" poolRows={s.get('poolRows')} "
                                 f"samples={s.get('samples')} "
                                 f"buckets={s.get('buckets')}")
                except Exception:
                    pass
                self.log(
                    f"  Benchmark recompute triggered ({response.status}):{stats or ' ' + body[:200]}"
                )
        except Exception as e:
            self.log(f"  Benchmark recompute failed: {e}")

    def run_daily_update_and_alerts(self):
        self.run_daily_update_scraper()
        self.trigger_alert_check()

    # Geocoder drain — keeps coordinate coverage from decaying as fresh
    # ACTIVE/PRE_AUCTION rows land. Calls the existing backfill task which
    # honours DATABASE_URL via DatabaseAdapter, so this writes to Postgres
    # in prod (not the dev SQLite file).
    def geocode_drain(self):
        """Fast drain — ACTIVE rows only, every GEOCODE_INTERVAL_MIN (default 10).

        Keeps live/just-landed rows pinned promptly. The slower
        geocode_drain_all() below picks up finished rows so coverage doesn't
        decay (finished rows would otherwise starve behind active priority).
        """
        self._geocode_drain_run(active_only=True, label="geocode_drain")

    def geocode_drain_all(self):
        """Slow drain — ALL statuses incl. finished/CONCLUIDA, every
        GEOCODE_FINISHED_INTERVAL_MIN (default 30).

        Closes the gap where the active-only cron never touched the ~11.7k
        finished rows that have an address but no coords. Larger batch
        (GEOCODE_FINISHED_BATCH_SIZE, default 50) so the backlog drains, but
        less frequent than the active drain so active rows keep priority.
        """
        self._geocode_drain_run(active_only=False, label="geocode_drain_all")

    def _geocode_drain_run(self, active_only: bool, label: str):
        if not DATABASE_URL or ('postgres' not in DATABASE_URL):
            self.log(f"  {label}: skipped (no Postgres DATABASE_URL)")
            return
        try:
            sys.path.insert(0, '/')
            from app.tasks.backfill_tasks import geocode_missing_coordinates

            if active_only:
                batch = int(os.getenv("GEOCODE_BATCH_SIZE", "25"))
            else:
                batch = int(os.getenv("GEOCODE_FINISHED_BATCH_SIZE", "50"))
            result = geocode_missing_coordinates(batch_size=batch, active_only=active_only)
            # T3: always emit a heartbeat — even on zero work — so future Ken
            # can SEE the cron ran. (result is a dict even when processed=0;
            # only None on hard task failure.)
            if result:
                tf = result.get('town_fallback') or {}
                self.log(
                    f"  {label}: processed={result.get('processed')} "
                    f"geocoded={result.get('geocoded')} failed={result.get('failed')} "
                    f"precision={result.get('precision')} "
                    f"town_fallback={{geocoded:{tf.get('geocoded', 0)}}}"
                )
            else:
                self.log(f"  {label}: nothing to do (task returned None)")
        except Exception as e:
            self.log(f"  {label}: error {type(e).__name__}: {e}")
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

        # Seguridad Social (TGSS) seized-asset portal — source="SEGSOCIAL".
        # Source refreshes only WEEKLY, so ONE daily pass is ample. The full
        # national pull walks one stateful requests session (719-ish bienes,
        # ~36 result pages + one ficha GET each) — no Playwright, light footprint.
        # 06:10 sits clear of the BOE judicial (08/14/20), the category browsers
        # (06:30+), and the 05:30 suspended-recheck.
        schedule.every().day.at("06:10").do(self.run_segsocial_update)

        # PLABI (Ministerio de Justicia liquidation portal) — source="PLABI".
        # Concursal microenterprise asset liquidations (Law 16/2022), ~479 lotes
        # and growing, off-BOE. One daily server-rendered requests walk (result
        # pages + one ficha GET each), no Playwright, light footprint. 06:20 sits
        # clear of SegSocial (06:10), the category browsers (06:30+), and the
        # 05:30 suspended-recheck.
        schedule.every().day.at("06:20").do(self.run_plabi_update)

        # Pre-auction discovery (BOE SUBASTA.ESTADO=PA, "Próxima apertura") —
        # every 6h (4x/day). Fills the PROXIMA_APERTURA bucket the daily path
        # can't see; promote_pending_auctions flips each row live when its
        # opensAt arrives. Runs through _run_sync_scrape (loop-free thread).
        schedule.every(6).hours.do(self.run_preauction_discovery)

        # SUSPENDIDA reopen-recheck — daily. Re-scrapes EVERY suspended row's
        # BOE detail (which the 5-day window scrape never revisits) and flips
        # SUSPENDIDA -> CELEBRANDOSE when BOE drops the suspension banner
        # (emit_status_change -> auction.go_live, alerts fire). Also refreshes
        # resumeAt + suspensionMotive on rows that stay suspended. ~119 rows ->
        # one staggered daily slot clear of the category browsers above.
        schedule.every().day.at("05:30").do(self.recheck_suspended_auctions)

        # Mechanism 2: daily post-close sale-result re-scrape (catches freeze
        # misses + drains history not yet backfilled). Bounded per run; the
        # ~200k history sweep is the one-time backfill_sale_results.py, not this.
        schedule.every().day.at("05:15").do(
            lambda: self.recheck_sale_results(
                limit=int(os.getenv('RESULT_RESCRAPE_LIMIT', '1000'))
            )
        )

        # Catastro DNPRC enrichment — daily. Fills año-construcción / uso and
        # NULL-only surfaceM2 on ref-bearing active rows from the free OVC web
        # service @ 1 req/s (~473 refs < 10 min). Dead refs (cod 4/5) are
        # stamped so they are not re-hammered; everything re-confirmed weekly.
        # Staggered clear of the browser jobs above.
        schedule.every().day.at("05:45").do(self.run_catastro_enrichment)

        # Phase 3: region benchmark recompute — once daily at 06:00, right after
        # the catastro/refresh surface jobs (05:45) so the EUR/m2 value-signal
        # reflects the freshest year/use/surface enrichment. Idempotent + self-
        # healing (atomic full replace); a missed day is harmless.
        schedule.every().day.at("06:00").do(self.trigger_benchmark_recompute)

        # Wave 2b: dispatcher drain — every DISPATCH_INTERVAL_MIN minutes
        schedule.every(DISPATCH_INTERVAL_MIN).minutes.do(self.dispatch_outbox)

        # Geocode drain (fast) — every GEOCODE_INTERVAL_MIN minutes (default 10).
        # ACTIVE rows only: new live rows get coords promptly.
        geocode_interval = int(os.getenv("GEOCODE_INTERVAL_MIN", "10"))
        schedule.every(geocode_interval).minutes.do(self.geocode_drain)

        # Geocode drain (slow, ALL statuses incl. finished) — every
        # GEOCODE_FINISHED_INTERVAL_MIN minutes (default 30). Drains the
        # finished-with-address backlog so coverage doesn't decay as auctions
        # conclude. Lower frequency keeps active rows prioritised.
        geocode_finished_interval = int(os.getenv("GEOCODE_FINISHED_INTERVAL_MIN", "30"))
        schedule.every(geocode_finished_interval).minutes.do(self.geocode_drain_all)

        self.log("Schedule configured:")
        self.log("  Pulse (bid updates):  Every 35 min")
        self.log("  Status monitor:       Every 30 min")
        self.log("  Promotion (go-live):  Every 30 min (PROXIMA_APERTURA -> CELEBRANDOSE)")
        self.log(f"  Daily BOE + alerts:   08:00, 14:00, 20:00 (JUDICIAL)")
        self.log(f"  Notarial update:      06:30, 12:30, 18:30, 23:30 (4x/day)")
        self.log(f"  AEAT update:          06:45, 12:45, 18:45, 23:45 (4x/day)")
        self.log(f"  OtrasTrib update:     07:00, 13:00, 19:00, 00:00 (4x/day)")
        self.log(f"  Administrativas:      07:15, 13:15, 19:15, 00:15 (4x/day)")
        self.log(f"  SegSocial (TGSS):     06:10 daily (source='SEGSOCIAL', weekly-refreshed)")
        self.log(f"  PLABI (MdJ liquid.):  06:20 daily (source='PLABI', off-BOE concursal)")
        self.log(f"  Catastro DNPRC:       05:45 daily (año/uso/surfaceM2 @ 1 req/s, ref-bearing rows)")
        self.log(f"  Benchmark recompute:  06:00 daily (region EUR/m2 value-signal, atomic full replace)")
        self.log(f"  Pre-auction (PA):     Every 6h (PROXIMA_APERTURA discovery, ORIGEN=J)")
        self.log(f"  Dispatch outbox:      Every {DISPATCH_INTERVAL_MIN} min")
        self.log(f"  Geocode drain (fast): Every {geocode_interval} min (active rows only)")
        self.log(f"  Geocode drain (all):  Every {geocode_finished_interval} min (ALL statuses incl. finished)")
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
    parser.add_argument('--preauction-once', action='store_true',
                        help='Run one BOE PA (Próxima apertura) discovery pass and exit')
    parser.add_argument('--recheck-suspended-once', action='store_true',
                        help='Run one SUSPENDIDA reopen-recheck pass and exit')
    parser.add_argument('--segsocial-once', action='store_true',
                        help='Run one Seguridad Social (TGSS) national pull and exit')
    parser.add_argument('--plabi-once', action='store_true',
                        help='Run one PLABI (Ministerio de Justicia) national pull and exit')
    parser.add_argument('--catastro-once', action='store_true',
                        help='Run one Catastro DNPRC enrichment pass and exit')
    parser.add_argument('--catastro-limit', type=int, default=0,
                        help='Cap rows processed by --catastro-once (0 = all due)')
    parser.add_argument('--recheck-sale-results-once', action='store_true',
                        help='Run one post-close sale-result re-scrape pass and exit')
    parser.add_argument('--sale-result-limit', type=int, default=500,
                        help='Cap rows for --recheck-sale-results-once (default 500)')

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
    elif args.preauction_once:
        scheduler.log("Running pre-auction (PA) discovery once...")
        scheduler.run_preauction_discovery()
    elif args.recheck_suspended_once:
        scheduler.log("Running SUSPENDIDA reopen-recheck once...")
        scheduler.recheck_suspended_auctions()
    elif args.segsocial_once:
        scheduler.log("Running Seguridad Social (TGSS) national pull once...")
        scheduler.run_segsocial_update()
    elif args.plabi_once:
        scheduler.log("Running PLABI (Ministerio de Justicia) national pull once...")
        scheduler.run_plabi_update()
    elif args.catastro_once:
        scheduler.log("Running Catastro DNPRC enrichment once...")
        scheduler.run_catastro_enrichment(limit=args.catastro_limit or None)
    elif args.recheck_sale_results_once:
        scheduler.log("Running post-close sale-result re-scrape once...")
        scheduler.recheck_sale_results(limit=args.sale_result_limit)
    else:
        scheduler.run()


if __name__ == '__main__':
    main()
