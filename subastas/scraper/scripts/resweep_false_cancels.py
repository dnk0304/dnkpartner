#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CP4 — One-time re-sweep of the ~453 wrongly-cancelled WITHDRAWN_PRE_AUCTION rows.

WHY THIS EXISTS
---------------
The historical `cleanup_withdrawn_preauctions` bug (fixed in CP2) flipped opened
pre-auctions to CANCELADA / suspensionReason='WITHDRAWN_PRE_AUCTION' WITHOUT
re-scraping BOE. ~453 rows are stuck in that bucket. Audit estimates ~56% (~250)
are actually LIVE; ~44% are genuinely cancelled. CP3's `reconcile_boe_status`
only reaches the recent 7-day trickle (lookback-bounded on purpose). THIS script
handles the OLD backlog, once, per-row, carefully.

IT REUSES THE EXACT CP2/CP3 SAFE GATES — never a second, softer definition:
  * `BOEScraper._fetch_detail_info(boe_id)`  — the same per-row BOE re-scrape.
  * `boe_gates.boe_cancel_confirmed(info)`   — the STRICT cancel banner (the same
        `_auction_cancel_confirmed` output the scraper packs into the info dict).
  * `boe_gates.boe_confirmed_live(info)`     — the same live gate reconcile uses
        (extracted to boe_gates.py; scheduler now imports it too — one source).
  * `database.outbox.emit_status_change`     — every write goes through the same
        outbox + AuctionStatusHistory path as the rest of the pipeline.

DECISION (per row) — see `decide_row()`:
  * STRICT cancel banner            -> KEEP CANCELLED (the flip was correct).
  * confirmed-live, CONCLUIDA banner-> RECLASSIFY to CONCLUIDA_PORTAL (terminal,
        but it was NOT a pre-auction withdrawal — record the truth).
  * confirmed-live, SUSPENDIDA bnnr -> REOPEN to SUSPENDIDA (exists, suspended —
        clears the false WITHDRAWN label; recheck_suspended then owns it).
  * confirmed-live, no terminal, window still open/unknown
                                    -> REOPEN to CELEBRANDOSE (the ~250 bucket;
        clears WITHDRAWN label, backfills endsAt/opensAt from BOE when present).
  * confirmed-live but window already closed
                                    -> LEAVE-UNCERTAIN (live-but-past; hand to the
        conclude path, never resurrect a closed window).
  * NOT confirmed-live, no cancel banner (network/parse fail / error page)
                                    -> LEAVE-UNCERTAIN (NEVER reopen on doubt).

There is NO blanket-reopen path: a re-open requires per-row BOE evidence
(`confirmed_live`), recorded in the diff report and the snapshot.

SAFETY
------
* DRY-RUN BY DEFAULT. Writes ONLY with an explicit `--apply`. A default run reads
  BOE + prints/saves a full diff report and touches the DB not at all.
* IDEMPOTENT. The candidate query selects only CANCELADA +
  WITHDRAWN_PRE_AUCTION; a reopened row leaves that set, so a second run finds
  zero pending changes for it. Genuinely-cancelled rows are re-verified and
  re-decided KEEP (no write). Second `--apply` (or dry-run) => 0 pending changes.
* SNAPSHOT + ROLLBACK. Before ANY `--apply` write, every affected row's prior
  (status, suspensionReason, endsAt, opensAt, transitionedAt, updatedAt) is
  snapshotted to a timestamped JSONL file. `--rollback <file>` restores exactly
  those columns for exactly those ids. Zero data loss.
* THROTTLE + BOE-DOWN BAIL. `--throttle` seconds between fetches (default 1.5, on
  top of the scraper's own random_delay). `--cap` bounds rows per run. 5
  consecutive fetch failures with 0 confirmed parses => abort, write nothing.
* Freeze-safe: rows that already carry a saleResult are excluded (never touch a
  frozen terminal result); CONCLUIDA reclassification only on a confirmed banner.

USAGE (Ken/Niki run inside the app/scraper container, per CP5 — NOT in this task)
--------------------------------------------------------------------------------
  python -m scraper.scripts.resweep_false_cancels                 # dry-run report
  python -m scraper.scripts.resweep_false_cancels --report out.txt
  python -m scraper.scripts.resweep_false_cancels --apply         # writes + snapshot
  python -m scraper.scripts.resweep_false_cancels --rollback snapshots/resweep_*.jsonl --apply

This module is import-safe (no side effects at import) so `decide_row` can be
unit-tested without a DB or a browser.
"""

import argparse
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime
from typing import Any, Dict, NamedTuple, Optional

# --- dual-path imports (prod container = app.*, local/dev = scraper.*) --------
try:  # prod container layout ( /app )
    sys.path.insert(0, '/')
    from app.database.boe_gates import boe_cancel_confirmed, boe_confirmed_live  # type: ignore
    from app.database.outbox import emit_status_change  # type: ignore
    from app.database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore
    from app.config.settings import DATABASE_URL  # type: ignore
    _APP_NS = 'app'
except ImportError:  # local/dev layout (repo root on sys.path)
    from scraper.database.boe_gates import boe_cancel_confirmed, boe_confirmed_live
    from scraper.database.outbox import emit_status_change
    from scraper.database.legacy_rows import LEGACY_EXCLUSION_SQL
    from scraper.config.settings import DATABASE_URL
    _APP_NS = 'scraper'

DETECTED_BY = "scripts.resweep_false_cancels"

# Columns pulled for each candidate (drives emit_status_change payload).
_COLS = ('id, "boeId", "endsAt", "opensAt", status, "suspensionReason", title, '
         '"boeLink", province, municipality, "appraisalValue", "currentBid", '
         '"address", "currentBidAmount", "pujaStatus", "transitionedAt", "updatedAt"')


# ---------------------------------------------------------------------------
# PURE decision engine — unit-testable, no DB, no network.
# ---------------------------------------------------------------------------
class Decision(NamedTuple):
    action: str          # reopen | reclassify-concluida | reopen-suspendida
                         # | keep-cancelled | leave-uncertain
    to_status: Optional[str]   # target status for a write; None if no write
    is_change: bool      # True => a DB write is pending (goes in the diff)
    reason: str          # human-readable evidence line
    set_ends_at: Optional[datetime]   # backfill endsAt (only if row's was NULL)
    set_opens_at: Optional[datetime]  # backfill opensAt (only if BOE published)


def decide_row(info: Dict[str, Any],
               current_ends_at: Optional[datetime],
               now: datetime) -> Decision:
    """Decide the fate of ONE backlog row from its freshly re-scraped BOE info.

    `info` is `BOEScraper._fetch_detail_info` output (or a test stub with the
    same keys). `current_ends_at` is the row's stored endsAt. Uses ONLY the
    shared CP2/CP3 gates — identical live/cancel semantics to reconcile."""
    detail_status = info.get('detail_status')
    start_at = info.get('start_at')
    di_ends = info.get('ends_at')
    eff_ends = di_ends if di_ends is not None else current_ends_at

    # (1) STRICT cancel banner => the original flip was CORRECT. Keep cancelled.
    if boe_cancel_confirmed(info):
        return Decision('keep-cancelled', None, False,
                        'BOE strict cancelada/anulada banner — flip was correct',
                        None, None)

    # (2) Not confirmed-live and no cancel banner => inconclusive (network /
    #     parse failure / "Identificador incorrecto" error page). NEVER reopen.
    if not boe_confirmed_live(info):
        return Decision('leave-uncertain', None, False,
                        'BOE did not confirm live (no parse / error page) — left as-is',
                        None, None)

    # From here BOE served a real, parseable auction (confirmed_live).
    # (3) Confirmed terminal CONCLUIDA banner => reclassify to the truth.
    if detail_status == 'CONCLUIDA_PORTAL':
        return Decision('reclassify-concluida', 'CONCLUIDA_PORTAL', True,
                        'BOE confirms CONCLUIDA (not a pre-auction withdrawal)',
                        None, None)

    # (4) Confirmed SUSPENDIDA banner => exists but suspended. Clears the false
    #     WITHDRAWN label; recheck_suspended_auctions then owns the row.
    if detail_status == 'SUSPENDIDA':
        return Decision('reopen-suspendida', 'SUSPENDIDA', True,
                        'BOE confirms SUSPENDIDA (was falsely cancelled)',
                        None, None)

    # (5) Confirmed live, no terminal banner, but the window already closed =>
    #     do NOT resurrect. Hand to the conclude path.
    if eff_ends is not None and eff_ends <= now:
        return Decision('leave-uncertain', None, False,
                        f'BOE live but window already closed (endsAt={eff_ends}) — left for conclude path',
                        None, None)

    # (6) Confirmed live, open/unknown window => THE re-open. Restore to
    #     CELEBRANDOSE, clear the WITHDRAWN label, backfill dates from BOE.
    set_ends = di_ends if (di_ends is not None and current_ends_at is None) else None
    set_opens = start_at if start_at is not None else None
    ev = 'BOE-confirmed live (identificador + real fields), window open/unknown'
    if eff_ends is not None:
        ev += f'; endsAt={eff_ends}'
    return Decision('reopen', 'CELEBRANDOSE', True, ev, set_ends, set_opens)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------
def _connect():
    import psycopg2
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    return conn


def _is_postgres() -> bool:
    return bool(DATABASE_URL) and ('postgresql://' in DATABASE_URL or 'postgres://' in DATABASE_URL)


def _sale_guard(cur) -> str:
    """'AND "saleResult" IS NULL' when the column exists, else '' (pre-migration)."""
    cur.execute(
        """SELECT count(*) FROM information_schema.columns
           WHERE table_name='Auction' AND column_name='saleResult'""")
    return 'AND "saleResult" IS NULL' if cur.fetchone()[0] == 1 else ''


def load_candidates(cur, cap: Optional[int]):
    """The FULL WITHDRAWN_PRE_AUCTION backlog (no lookback — this is the old
    bucket CP3 deliberately excludes). BOE source only (PLABI/SEGSOCIAL have no
    BOE detail page). Oldest transition first. Optional cap for throttled runs."""
    sale_guard = _sale_guard(cur)
    limit = 'LIMIT %s' if cap else ''
    params = (cap,) if cap else ()
    cur.execute(f"""
        SELECT {_COLS} FROM "Auction"
        WHERE status = 'CANCELADA'
          AND "suspensionReason" = 'WITHDRAWN_PRE_AUCTION'
          AND source = 'BOE'
          AND "boeId" IS NOT NULL
          {sale_guard}
          AND {LEGACY_EXCLUSION_SQL}
        ORDER BY "transitionedAt" ASC NULLS FIRST
        {limit}
    """, params)
    return cur.fetchall()


# ---------------------------------------------------------------------------
# Report + snapshot
# ---------------------------------------------------------------------------
def _fmt_row_line(boe_id, current_status, dec: Decision) -> str:
    tgt = f' -> {dec.to_status}' if dec.to_status else ''
    return (f"  [{dec.action:<20}] boeId={boe_id or '?':<28} "
            f"{current_status}{tgt}  | {dec.reason}")


def write_report(path: Optional[str], lines, totals: Counter, applied: bool,
                 reopened: int, cap, throttle, aborted: bool):
    header = [
        "=" * 78,
        f"CP4 RE-SWEEP OF WRONGLY-CANCELLED WITHDRAWN_PRE_AUCTION BACKLOG",
        f"mode: {'APPLY (writes committed)' if applied else 'DRY-RUN (no writes)'}"
        f"  |  cap={cap or 'ALL'}  throttle={throttle}s  ns={_APP_NS}",
        f"generated: {datetime.utcnow().isoformat()}Z",
        "=" * 78,
        "",
        "PENDING CHANGES (rows that WILL change / DID change):",
    ]
    change_lines = [l for l in lines if l[0]]      # (is_change, text)
    nochange_lines = [l for l in lines if not l[0]]
    body = [t for _, t in change_lines] or ["  (none)"]
    body += ["", "NON-CHANGES (kept-cancelled / left-uncertain):"]
    body += [t for _, t in nochange_lines] or ["  (none)"]

    footer = [
        "",
        "-" * 78,
        "TOTALS:",
        f"  reopen            : {totals['reopen']}",
        f"  reopen-suspendida : {totals['reopen-suspendida']}",
        f"  reclassify-concluida: {totals['reclassify-concluida']}",
        f"  keep-cancelled    : {totals['keep-cancelled']}",
        f"  leave-uncertain   : {totals['leave-uncertain']}",
        f"  -------------------",
        f"  TOTAL reopened (all reopen kinds): {reopened}",
        f"  verified rows     : {sum(totals.values())}",
    ]
    if aborted:
        footer.append("  ** ABORTED (BOE-down bail) — set is INCOMPLETE **")
    if not applied:
        footer.append("")
        footer.append("DRY-RUN — nothing written. Review, then re-run with --apply.")
    text = "\n".join(header + body + footer)
    print(text)
    if path:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text + "\n")
        print(f"\n[report written to {path}]")


def _snapshot_dir() -> str:
    d = os.getenv("RESWEEP_SNAPSHOT_DIR",
                  os.path.join(os.path.dirname(__file__), "snapshots"))
    os.makedirs(d, exist_ok=True)
    return d


def _snapshot_path() -> str:
    return os.path.join(_snapshot_dir(),
                        f"resweep_{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.jsonl")


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


# ---------------------------------------------------------------------------
# ROLLBACK
# ---------------------------------------------------------------------------
def do_rollback(snapshot_file: str, apply: bool):
    if not os.path.exists(snapshot_file):
        print(f"snapshot not found: {snapshot_file}")
        sys.exit(2)
    rows = []
    with open(snapshot_file, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    print(f"Rollback: restoring {len(rows)} row(s) from {snapshot_file} "
          f"({'APPLY' if apply else 'DRY-RUN'})")
    if not apply:
        for r in rows[:20]:
            print(f"  would restore id={r['id']} boeId={r.get('boeId')} "
                  f"-> status={r['status']} suspensionReason={r['suspensionReason']}")
        if len(rows) > 20:
            print(f"  ... and {len(rows) - 20} more")
        print("DRY-RUN — nothing written. Re-run with --apply to restore.")
        return
    conn = _connect()
    try:
        cur = conn.cursor()
        n = 0
        for r in rows:
            cur.execute("""
                UPDATE "Auction"
                SET status=%s, "suspensionReason"=%s, "endsAt"=%s, "opensAt"=%s,
                    "transitionedAt"=%s, "updatedAt"=%s
                WHERE id=%s
            """, (r['status'], r['suspensionReason'],
                  _parse_dt(r['endsAt']), _parse_dt(r['opensAt']),
                  _parse_dt(r['transitionedAt']), _parse_dt(r['updatedAt']), r['id']))
            n += cur.rowcount
        conn.commit()
        print(f"ROLLBACK COMMITTED — {n} row(s) restored.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _parse_dt(v):
    if v is None:
        return None
    try:
        return datetime.fromisoformat(v)
    except (ValueError, TypeError):
        return v


# ---------------------------------------------------------------------------
# MAIN SWEEP
# ---------------------------------------------------------------------------
def run_sweep(apply: bool, cap: Optional[int], throttle: float,
              report_path: Optional[str]):
    if not _is_postgres():
        print("Re-sweep requires PostgreSQL (DATABASE_URL). Aborting — no writes.")
        sys.exit(2)

    # Import the scraper lazily so `decide_row` unit tests never need Playwright.
    if _APP_NS == 'app':
        from app.scrapers.boe_scraper import BOEScraper  # type: ignore
    else:
        from scraper.scrapers.boe_scraper import BOEScraper
    os.environ.setdefault("BOE_FETCH_DETAIL", "1")

    conn = _connect()
    cur = conn.cursor()
    candidates = load_candidates(cur, cap)
    cur.close()
    print(f"Loaded {len(candidates)} WITHDRAWN_PRE_AUCTION backlog row(s) "
          f"(cap={cap or 'ALL'}). Re-scraping BOE per row...")
    if not candidates:
        conn.close()
        print("Nothing to do — backlog empty (idempotent no-op).")
        return

    snapshot_file = _snapshot_path() if apply else None
    snap_fh = open(snapshot_file, 'w', encoding='utf-8') if snapshot_file else None

    scraper = BOEScraper()
    now = datetime.utcnow()
    lines = []                 # (is_change, text)
    totals = Counter()
    reopened = 0
    failed_streak = 0
    confirmed_any = False
    aborted = False

    try:
        for idx, row in enumerate(candidates):
            (auction_id, boe_id, ends_at, opens_at, status, suspension_reason,
             title, boe_link, province, municipality, appraisal_value,
             current_bid, address, current_bid_amount, puja_status,
             transitioned_at, updated_at) = row

            # BOE-down bail: 5 consecutive fetch failures, nothing confirmed yet.
            if failed_streak >= 5 and not confirmed_any:
                print("ABORT — 5 consecutive BOE fetch failures with 0 confirmed "
                      "parses (BOE likely down). Nothing further processed.")
                aborted = True
                break

            try:
                info = scraper._fetch_detail_info(boe_id)
            except Exception as e:  # noqa: BLE001
                failed_streak += 1
                dec = Decision('leave-uncertain', None, False,
                               f'BOE fetch error: {e}', None, None)
                totals[dec.action] += 1
                lines.append((False, _fmt_row_line(boe_id, status, dec)))
                continue

            dec = decide_row(info, ends_at, now)
            if dec.action != 'leave-uncertain' or 'error page' in dec.reason:
                # a real parse (live/cancel/terminal) resets the down-streak
                confirmed_any = True
                failed_streak = 0
            lines.append((dec.is_change, _fmt_row_line(boe_id, status, dec)))
            totals[dec.action] += 1

            if dec.is_change and apply:
                _apply_change(conn, snap_fh, row, dec, now)
                if dec.action in ('reopen', 'reopen-suspendida'):
                    reopened += 1
            elif dec.is_change and dec.action in ('reopen', 'reopen-suspendida'):
                reopened += 1  # dry-run reopened count for the report

            if throttle and idx < len(candidates) - 1:
                time.sleep(throttle)
    finally:
        if snap_fh:
            snap_fh.close()
        try:
            scraper.browser_manager.close_all()
        except Exception:
            pass
        conn.close()

    write_report(report_path, lines, totals, apply, reopened, cap, throttle, aborted)
    if apply and snapshot_file:
        print(f"[snapshot of changed rows written to {snapshot_file} — "
              f"rollback with: --rollback {snapshot_file} --apply]")


def _apply_change(conn, snap_fh, row, dec: Decision, now: datetime):
    """Write ONE decided change in a single transaction: snapshot the prior
    values, UPDATE the row, emit_status_change (outbox + history)."""
    (auction_id, boe_id, ends_at, opens_at, status, suspension_reason,
     title, boe_link, province, municipality, appraisal_value,
     current_bid, address, current_bid_amount, puja_status,
     transitioned_at, updated_at) = row

    # 1) snapshot BEFORE the write (rollback source of truth).
    snap_fh.write(json.dumps({
        "id": auction_id, "boeId": boe_id,
        "status": status, "suspensionReason": suspension_reason,
        "endsAt": _iso(ends_at), "opensAt": _iso(opens_at),
        "transitionedAt": _iso(transitioned_at), "updatedAt": _iso(updated_at),
        "action": dec.action, "toStatus": dec.to_status,
    }) + "\n")
    snap_fh.flush()

    cur = conn.cursor()
    try:
        sets = ['status = %s', '"transitionedAt" = %s', '"updatedAt" = %s']
        params = [dec.to_status, now, now]
        # A re-open clears the false WITHDRAWN label; a terminal reclassify keeps
        # the existing suspensionReason untouched (it is a genuine terminal).
        if dec.action in ('reopen', 'reopen-suspendida'):
            sets.append('"suspensionReason" = NULL')
        if dec.set_ends_at is not None:
            sets.append('"endsAt" = %s'); params.append(dec.set_ends_at)
        if dec.set_opens_at is not None:
            sets.append('"opensAt" = %s'); params.append(dec.set_opens_at)
        params.append(auction_id)
        cur.execute(f'UPDATE "Auction" SET {", ".join(sets)} WHERE id = %s', params)

        eff_ends = dec.set_ends_at if dec.set_ends_at is not None else ends_at
        emit_status_change(
            cur,
            auction_id=auction_id, boe_id=boe_id or "",
            boe_link=boe_link or f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
            title=title or "", from_status=status, to_status=dec.to_status,
            province=province or "", municipality=municipality or "",
            address=address or "",
            appraisal_value=float(appraisal_value or 0),
            current_bid=float(current_bid) if current_bid else None,
            current_bid_amount=int(current_bid_amount) if current_bid_amount else None,
            puja_status=puja_status, ends_at=eff_ends,
            detected_by=DETECTED_BY,
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()


def main():
    ap = argparse.ArgumentParser(description="CP4 re-sweep of wrongly-cancelled WITHDRAWN_PRE_AUCTION backlog")
    ap.add_argument('--apply', action='store_true',
                    help='write changes + snapshot (default: DRY-RUN, no writes)')
    ap.add_argument('--cap', type=int, default=None,
                    help='max rows to process this run (default: ALL ~453)')
    ap.add_argument('--throttle', type=float,
                    default=float(os.getenv("RESWEEP_THROTTLE_SEC", "1.5")),
                    help='seconds to sleep between BOE fetches (default 1.5)')
    ap.add_argument('--report', default=None,
                    help='also write the diff report to this file path')
    ap.add_argument('--rollback', default=None, metavar='SNAPSHOT',
                    help='restore rows from a snapshot JSONL (needs --apply to write)')
    args = ap.parse_args()

    if args.rollback:
        do_rollback(args.rollback, args.apply)
        return
    run_sweep(apply=args.apply, cap=args.cap, throttle=args.throttle,
              report_path=args.report)


if __name__ == '__main__':
    main()
