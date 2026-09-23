#!/usr/bin/env python3
"""
SN-4 pre-auction window backfill — 2026-09-23 (Forge)

WHY
---
``segsocial_scraper._map_status`` wrote ``opensAt == endsAt`` for every future
TGSS act date: a ZERO-LENGTH window. ``scheduler.promote_pending_auctions``
selects ``endsAt IS NULL OR endsAt > now``, so such a row is NEVER promotable,
and ``monitor_status_changes`` retires it PROXIMA_APERTURA -> CONCLUIDA_PORTAL
the moment the act date passes. Net effect: ``auction.go_live`` was never
emitted for this source (0 rows in 7 days; 593 PROXIMA rows carrying the broken
shape, 477 already retired without ever going live).

The scraper is fixed (endsAt stays honest-NULL at ingest, and promotion stamps
``endsAt = opensAt + SEGSOCIAL_ACT_WINDOW_HOURS``), but the adapter never blanks
a column — ``upsert`` only writes values that are ``is not None`` — so the
EXISTING rows keep the broken shape until they are repaired here.

WHAT IT DOES
------------
Sets ``endsAt = NULL`` on pre-auction rows that carry the zero-length shape:

    status = 'PROXIMA_APERTURA' AND "opensAt" IS NOT NULL AND "endsAt" = "opensAt"

That is the exact fingerprint of the defect; a legitimate window always has
``endsAt > opensAt``. Nothing else on the row is touched — no status, no
opensAt, no prices, no dates. Once repaired, the row is picked up by the next
``promote_pending_auctions`` run (every 30 min) when its opensAt arrives, which
flips it to CELEBRANDOSE, stamps the act window and emits ``auction.go_live``.

SAFETY RAIL — which rows are repaired
-------------------------------------
By DEFAULT only rows whose ``opensAt`` is still in the FUTURE are repaired.
A row whose opensAt has already passed would be promoted on the very next run
and would fire a "ya está activa" mail for an auction that may already be over.
Use ``--grace-hours N`` to also repair rows that opened within the last N hours
(i.e. ones Ken has confirmed are still open on the portal) — see Q3 in the
dispatch résumé. ``--all-sources`` widens past SEGSOCIAL if BOE rows share the
shape (Q2).

CONCLUIDA_PORTAL rows are NEVER touched (explicit instruction): a retired row is
reported in the counts only. Resurrecting one would emit a go_live for an
auction the portal has already closed.

USAGE (inside the scheduler container — it has DATABASE_URL)
------------------------------------------------------------
  # dry run (DEFAULT — prints before/after counts, writes nothing)
  docker exec dnksubastas-scheduler \
      python /app/backfill_sn4_preauction_window.py

  # apply
  docker exec dnksubastas-scheduler \
      python /app/backfill_sn4_preauction_window.py --apply

  # also recover rows that opened in the last 12h
  docker exec dnksubastas-scheduler \
      python /app/backfill_sn4_preauction_window.py --apply --grace-hours 12

Idempotent: a second run finds 0 candidates. One transaction, committed only on
``--apply``; a dry run explicitly rolls back.
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta

import psycopg2

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger("sn4-preauction-window-backfill")

# The zero-length-window fingerprint. A legitimate pre-auction window always has
# endsAt strictly AFTER opensAt; endsAt == opensAt is only ever produced by the
# B1 defect.
BROKEN_SHAPE = (
    "status = 'PROXIMA_APERTURA' "
    'AND "opensAt" IS NOT NULL '
    'AND "endsAt" IS NOT NULL '
    'AND "endsAt" <= "opensAt"'
)


def _counts(cursor, source_clause, params):
    """Diagnostic census — the numbers Ken verifies before and after."""
    out = {}
    cursor.execute(
        'SELECT COUNT(*) FROM "Auction" WHERE %s %s' % (BROKEN_SHAPE, source_clause),
        params,
    )
    out["broken_proxima_total"] = cursor.fetchone()[0]

    cursor.execute(
        'SELECT COUNT(*) FROM "Auction" WHERE %s %s AND "opensAt" > %%s'
        % (BROKEN_SHAPE, source_clause),
        params + (datetime.utcnow(),),
    )
    out["broken_proxima_future"] = cursor.fetchone()[0]

    cursor.execute(
        'SELECT COUNT(*) FROM "Auction" '
        'WHERE status = \'PROXIMA_APERTURA\' AND "endsAt" IS NULL %s' % source_clause,
        params,
    )
    out["healthy_proxima_ends_at_null"] = cursor.fetchone()[0]

    # Reported, never modified.
    cursor.execute(
        'SELECT COUNT(*) FROM "Auction" '
        "WHERE status = 'CONCLUIDA_PORTAL' AND \"opensAt\" IS NOT NULL "
        'AND "endsAt" IS NOT NULL AND "endsAt" <= "opensAt" %s' % source_clause,
        params,
    )
    out["retired_with_broken_shape_NOT_TOUCHED"] = cursor.fetchone()[0]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true",
                    help="commit the repair (default: dry run, rolls back)")
    ap.add_argument("--grace-hours", type=int, default=0,
                    help="also repair rows whose opensAt passed within the last "
                         "N hours (default 0 = future-dated rows only)")
    ap.add_argument("--all-sources", action="store_true",
                    help="repair every source, not just SEGSOCIAL")
    ap.add_argument("--limit", type=int, default=0,
                    help="cap the number of rows repaired (0 = no cap)")
    args = ap.parse_args()

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        logger.error("DATABASE_URL is not set — run this inside the scheduler container")
        return 2

    if args.all_sources:
        source_clause, params = "", ()
    else:
        source_clause, params = "AND source = %s", ("SEGSOCIAL",)

    now = datetime.utcnow()
    cutoff = now - timedelta(hours=args.grace_hours)

    conn = psycopg2.connect(db_url)
    try:
        cursor = conn.cursor()

        before = _counts(cursor, source_clause, params)
        logger.info("BEFORE: %s", before)

        select_sql = (
            'SELECT id, "boeId", "opensAt" FROM "Auction" '
            "WHERE %s %s AND \"opensAt\" > %%s ORDER BY \"opensAt\""
            % (BROKEN_SHAPE, source_clause)
        )
        if args.limit:
            select_sql += " LIMIT %d" % args.limit
        cursor.execute(select_sql, params + (cutoff,))
        rows = cursor.fetchall()

        logger.info(
            "candidates: %d row(s) with a zero-length window and opensAt > %s "
            "(grace-hours=%d)", len(rows), cutoff.isoformat(), args.grace_hours)
        for rid, boe_id, opens_at in rows[:20]:
            logger.info("  %s  %s  opensAt=%s", rid, boe_id, opens_at)
        if len(rows) > 20:
            logger.info("  ... and %d more", len(rows) - 20)

        if rows:
            cursor.execute(
                'UPDATE "Auction" SET "endsAt" = NULL, "updatedAt" = %s '
                "WHERE id = ANY(%s)",
                (now, [r[0] for r in rows]),
            )
            logger.info("UPDATE affected %d row(s)", cursor.rowcount)

        after = _counts(cursor, source_clause, params)
        logger.info("AFTER (in-transaction): %s", after)

        if args.apply:
            conn.commit()
            logger.info("COMMITTED — %d row(s) repaired", len(rows))
        else:
            conn.rollback()
            logger.info("DRY RUN — rolled back, nothing written. Re-run with --apply.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
