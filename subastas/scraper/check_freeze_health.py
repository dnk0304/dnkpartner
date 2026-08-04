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

  2b. AGED BACKLOG — the absence-of-work signal (2026-08-04, FREEZE-WIDEN).
     Check 2 tolerates 500 rows, which is how ~120/day hid for weeks: a sweep
     matching zero rows looked exactly like a sweep with nothing to do. This
     one measures AGE, not volume, with a tolerance of zero. Mechanism 1b runs
     every 30 min, so any freezable row still unfrozen hours later proves the
     reconcile is not reaching it.

Exit codes
  0  all invariants hold
  1  an invariant is violated (details on stdout)
  2  could not run the check at all (no DB, bad URL)

Usage
  docker exec dnksubastas-scheduler python /app/check_freeze_health.py
  ... --backlog-max 200 --contradicted-max 0 --stuck-hours 6 --backlog-age-hours 6

  NOTE the path: the image flattens subastas/scraper/ to /app, so it is
  /app/check_freeze_health.py — NOT /app/scraper/check_freeze_health.py.
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

# Mechanism 1b (2026-08-04). Kept VERBATIM in shape with
# scheduler.SchedulerClass.FREEZE_RECONCILE_SQL — same reason as above: this is
# its type gate. Note the guards are IDENTICAL to FREEZE_SQL's except that the
# batch predicate `id = ANY(%s)` is replaced by the state predicate. Widening the
# reach relaxed nothing: `saleResult IS NULL` (the exactly-once guard) and the
# puja-signal guard are carried through unchanged, and a coherence guard on
# endsAt was ADDED.
RECONCILE_SQL = """
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
WHERE status = 'CONCLUIDA_PORTAL'
  AND "saleResult" IS NULL
  AND ("pujaStatus" IS NOT NULL
       OR COALESCE("currentBidAmount",0) > 0)
  AND "endsAt" IS NOT NULL
  AND "endsAt" <= now()
  AND FALSE  -- type-check only: plan it, match nothing, write nothing
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
    ap.add_argument("--backlog-age-hours", type=int, default=6,
                    help="how long a freezable row may sit unfrozen before the "
                         "reconcile counts as not working")
    ap.add_argument("--backlog-aged-max", type=int, default=0,
                    help="max tolerated freezable rows older than --backlog-age-hours")
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

        # 1b. TYPE CHECK — the Mechanism 1b reconcile SQL. Same plan-time gate,
        # `AND FALSE` so it can match nothing; always rolled back.
        try:
            cur.execute(RECONCILE_SQL)
            print(f"OK   type-check: reconcile SQL plans clean (rows touched={cur.rowcount})")
        except Exception as e:
            violations.append(f"RECONCILE TYPE CHECK FAILED: {e}")
            print(f"FAIL type-check (reconcile): {e}")
        finally:
            conn.rollback()

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

        # 2b. AGED BACKLOG — THE ABSENCE-OF-WORK SIGNAL (2026-08-04).
        # Check 2 counts the backlog against a tolerance of 500, so the original
        # bug hid inside it: ~120 rows/day never tripped the gate, and a sweep
        # that matched zero rows looked identical to a sweep that had nothing to
        # do. This check does not measure VOLUME, it measures AGE. The reconcile
        # runs every 30 min, so a freezable row that has sat unfrozen for hours
        # proves the sweep is not reaching it — regardless of how few there are.
        # Zero is the only healthy value, and it fires on silence, not on error.
        #
        # endsAt > now is EXCLUDED: those rows are incoherent (CONCLUIDA_PORTAL
        # with an end that has not arrived), are deliberately never frozen — a
        # future endsAt would stamp a future soldDate — and would otherwise pin
        # this check red forever. They are reported separately below.
        cur.execute(f"""SELECT count(*),
                               COALESCE(max(EXTRACT(EPOCH FROM (now() - "endsAt"))/3600), 0)
                        FROM "Auction"
                        WHERE status = 'CONCLUIDA_PORTAL'
                          AND "saleResult" IS NULL AND {PUJA_SIGNAL}
                          AND "endsAt" IS NOT NULL
                          AND "endsAt" <= now() - make_interval(hours => %s)""",
                    (args.backlog_age_hours,))
        aged, oldest_h = cur.fetchone()
        ok = aged <= args.backlog_aged_max
        print(f"{'OK  ' if ok else 'FAIL'} aged backlog (>{args.backlog_age_hours}h "
              f"unfrozen): {aged} (max {args.backlog_aged_max}, oldest {float(oldest_h):.1f}h)")
        if not ok:
            violations.append(
                f"aged backlog {aged} > {args.backlog_aged_max} — freeze reconcile "
                f"is not reaching concluded rows (oldest {float(oldest_h):.1f}h)")

        # 2c. INCOHERENT — reported, never a violation. CONCLUIDA_PORTAL rows
        # whose endsAt is NULL or in the future: held back from the freeze by
        # design. Printed so they can never become invisible.
        cur.execute(f"""SELECT count(*) FROM "Auction"
                        WHERE status = 'CONCLUIDA_PORTAL'
                          AND "saleResult" IS NULL AND {PUJA_SIGNAL}
                          AND ("endsAt" IS NULL OR "endsAt" > now())""")
        incoherent = cur.fetchone()[0]
        print(f"INFO incoherent held back (endsAt NULL or future): {incoherent} "
              f"(not frozen by design; sweepable once endsAt passes)")

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
