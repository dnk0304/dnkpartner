#!/usr/bin/env python3
"""Freeze-at-close health check — THE ALARM for Mechanism 1.

Why this file exists: the freeze-at-close SQL carried an enum/text cast bug for
18 days (2026-07-17 -> 2026-08-04). It logged "Freeze-at-close failed
(non-fatal)" 45+ times and nobody saw it, because a log line in a background
job is not an alarm. This script is the alarm: it is READ-ONLY, judged by
EXIT CODE, and safe to run on a cron or before any scheduler deploy.

Checks
  1. TYPE CHECK — executes the real freeze UPDATE inside a transaction that is
     always rolled back, against a WHERE that matches nothing. Postgres type-
     checks at plan time, so a cast regression fails here with zero writes.
     This is the check that would have caught the original bug on day 0.
  2. UNFROZEN BACKLOG — CONCLUIDA_PORTAL rows that still carry a live puja
     signal but have no saleResult. These are freezable-but-unfrozen and are
     racing the portal's amount wipe.
  3. CONTRADICTED ROWS — CONCLUIDA_PORTAL rows whose saleResult says
     DESIERTA/SIN_RESULTADO while the captured live puja signal says a bid
     existed. These are rows the wipe already won.
  4. STUCK CLOSES — CELEBRANDOSE rows past endsAt by more than the grace
     window: the close sweep is not committing.

Exit codes
  0  all invariants hold
  1  an invariant is violated (details on stdout)
  2  could not run the check at all (no DB, bad URL)

Usage
  docker exec dnksubastas-scheduler python /app/scraper/check_freeze_health.py
  ... --backlog-max 200 --contradicted-max 0 --stuck-hours 6
"""

import argparse
import os
import sys

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Kept VERBATIM in shape with scheduler._freeze_sale_results. If you change the
# freeze SQL, change it here too — that is the point: this is its type gate.
FREEZE_SQL = """
UPDATE "Auction"
SET "saleResult" = CASE
        WHEN COALESCE("currentBidAmount",0) > 0
             OR "pujaStatus" = 'CON_PUJA' THEN 'ADJUDICADA'::"SaleResult"
        WHEN "pujaStatus" = 'SIN_PUJA'     THEN 'DESIERTA'::"SaleResult"
    END,
    "soldPrice" = CASE
        WHEN COALESCE("currentBidAmount",0) > 0
        THEN "currentBidAmount" END,
    "soldDate" = "endsAt",
    "resultCheckedAt" = now(),
    "resultCheckAttempts" = 0
WHERE id = ANY(%s)
  AND "saleResult" IS NULL
  AND ("pujaStatus" IS NOT NULL
       OR COALESCE("currentBidAmount",0) > 0)
"""

PUJA_SIGNAL = '("pujaStatus" IS NOT NULL OR COALESCE("currentBidAmount",0) > 0)'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backlog-max", type=int, default=500,
                    help="max tolerated freezable-but-unfrozen rows")
    ap.add_argument("--contradicted-max", type=int, default=0,
                    help="max tolerated rows whose saleResult contradicts the live puja signal")
    ap.add_argument("--stuck-hours", type=int, default=6,
                    help="grace window before a past-end CELEBRANDOSE row counts as stuck")
    ap.add_argument("--stuck-max", type=int, default=0)
    args = ap.parse_args()

    if not DATABASE_URL or "postgres" not in DATABASE_URL:
        print("FATAL: DATABASE_URL not set to a Postgres URL")
        return 2
    try:
        import psycopg2
    except Exception as e:  # pragma: no cover
        print(f"FATAL: psycopg2 unavailable: {e}")
        return 2

    violations = []
    conn = psycopg2.connect(DATABASE_URL)
    try:
        cur = conn.cursor()

        # 1. TYPE CHECK — plan-time only, matches no rows, always rolled back.
        try:
            cur.execute(FREEZE_SQL, ([],))
            print(f"OK   type-check: freeze SQL plans clean (rows touched={cur.rowcount})")
        except Exception as e:
            violations.append(f"TYPE CHECK FAILED: {e}")
            print(f"FAIL type-check: {e}")
        finally:
            conn.rollback()  # nothing this script does is ever committed

        cur = conn.cursor()

        # 2. UNFROZEN BACKLOG
        cur.execute(f"""SELECT count(*) FROM "Auction"
                        WHERE status = 'CONCLUIDA_PORTAL'
                          AND "saleResult" IS NULL AND {PUJA_SIGNAL}""")
        backlog = cur.fetchone()[0]
        ok = backlog <= args.backlog_max
        print(f"{'OK  ' if ok else 'FAIL'} unfrozen backlog: {backlog} (max {args.backlog_max})")
        if not ok:
            violations.append(f"unfrozen backlog {backlog} > {args.backlog_max}")

        # 3. CONTRADICTED ROWS
        cur.execute(f"""SELECT count(*) FROM "Auction"
                        WHERE status = 'CONCLUIDA_PORTAL'
                          AND "saleResult" IN ('DESIERTA','SIN_RESULTADO')
                          AND (COALESCE("currentBidAmount",0) > 0
                               OR "pujaStatus" = 'CON_PUJA')""")
        contradicted = cur.fetchone()[0]
        ok = contradicted <= args.contradicted_max
        print(f"{'OK  ' if ok else 'FAIL'} contradicted rows: {contradicted} "
              f"(max {args.contradicted_max})")
        if not ok:
            violations.append(f"contradicted rows {contradicted} > {args.contradicted_max}")

        # 4. STUCK CLOSES
        cur.execute("""SELECT count(*) FROM "Auction"
                       WHERE status = 'CELEBRANDOSE'
                         AND "endsAt" < now() - make_interval(hours => %s)""",
                    (args.stuck_hours,))
        stuck = cur.fetchone()[0]
        ok = stuck <= args.stuck_max
        print(f"{'OK  ' if ok else 'FAIL'} stuck closes (>{args.stuck_hours}h past end): "
              f"{stuck} (max {args.stuck_max})")
        if not ok:
            violations.append(f"stuck closes {stuck} > {args.stuck_max}")

        conn.rollback()
    finally:
        conn.close()

    if violations:
        print("\nFREEZE-AT-CLOSE UNHEALTHY:")
        for v in violations:
            print(f"  - {v}")
        return 1
    print("\nFREEZE-AT-CLOSE HEALTHY")
    return 0


if __name__ == "__main__":
    sys.exit(main())
