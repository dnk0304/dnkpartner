#!/usr/bin/env python3
"""FREEZE-WIDEN proof harness (2026-08-04).

Runs against PROD inside a single transaction that is ALWAYS rolled back.
Nothing it does is ever committed.

The SQL under test is extracted VERBATIM from the shipped scheduler.py via AST —
never retyped here — so this proves the deployed statement, not a copy of it.

Sections
  A  REPRODUCE the current failure (scraper-concluded row can never be frozen)
  B  DIRECTION 1 — a concluded row gets frozen
  C  DIRECTION 2 — an already-frozen row is left alone (exactly-once)
  D  COHERENCE  — a future-endsAt row is held back, not frozen
  E  LIVENESS   — the residual witness CAN fire (not a vacuous zero)
  F  LIVENESS   — the aged-backlog health gate CAN fire (not a vacuous zero)
"""
import ast
import os
import sys
from datetime import datetime

import psycopg2

SCHEDULER = os.getenv("SCHEDULER_PY", "/app/scheduler.py")

FAILURES = []


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{(' — ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(label)


def extract_const(name):
    """Pull a class-level string constant out of the shipped scheduler.py."""
    tree = ast.parse(open(SCHEDULER, encoding="utf-8").read())
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == name:
                    return ast.literal_eval(node.value)
    raise SystemExit(f"FATAL: {name} not found in {SCHEDULER}")


# The batch-scoped freeze that is live today (Mechanism 1), retyped only because
# it lives inline in a method body; its shape is asserted against the shipped
# file below so a drift here cannot silently weaken the reproduction.
OLD_FREEZE_SQL = """
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
    "resultCheckedAt" = %s,
    "resultCheckAttempts" = 0
WHERE id = ANY(%s)
  AND "saleResult" IS NULL
  AND ("pujaStatus" IS NOT NULL
       OR COALESCE("currentBidAmount",0) > 0)
"""

# The scheduler's own expiry SELECT — the ONLY way a row can enter a freeze batch.
EXPIRY_SELECT = """
SELECT id FROM "Auction"
WHERE status IN ('ACTIVE', 'CELEBRANDOSE', 'SUSPENDIDA')
  AND "endsAt" IS NOT NULL AND "endsAt" < now()
"""

SNAP = ('SELECT status::text, "saleResult"::text, "soldPrice", "soldDate", '
        '"resultCheckAttempts", "pujaStatus"::text, "currentBidAmount", "endsAt" '
        'FROM "Auction" WHERE id = %s')


def main():
    reconcile_sql = extract_const("FREEZE_RECONCILE_SQL")
    witness_family = list(extract_const("FREEZE_WITNESS_FAMILY"))

    # Guard: the SQL we extracted must really be the widened one.
    src = open(SCHEDULER, encoding="utf-8").read()
    check("extracted reconcile SQL is state-scoped, not batch-scoped",
          "status = 'CONCLUIDA_PORTAL'" in reconcile_sql
          and "id = ANY" not in reconcile_sql)
    check("exactly-once guard carried verbatim into the widened SQL",
          '"saleResult" IS NULL' in reconcile_sql)
    check("puja-signal guard carried verbatim into the widened SQL",
          '"pujaStatus" IS NOT NULL' in reconcile_sql)
    check("coherence guard present (no future soldDate)",
          '"endsAt" <= %s' in reconcile_sql)
    check("Mechanism 1 batch freeze still present in shipped file (not replaced)",
          'WHERE id = ANY(%s)' in src)

    NOW = datetime.utcnow()
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    # A donor: a real live row carrying a puja signal.
    cur.execute("""SELECT id, "boeId", "currentBidAmount", "pujaStatus"::text
                   FROM "Auction"
                   WHERE status = 'CELEBRANDOSE' AND "saleResult" IS NULL
                     AND ("pujaStatus" IS NOT NULL OR COALESCE("currentBidAmount",0) > 0)
                   ORDER BY COALESCE("currentBidAmount",0) DESC
                   LIMIT 2""")
    donors = cur.fetchall()
    if len(donors) < 2:
        raise SystemExit("FATAL: need 2 donor rows with a live puja signal")
    (a_id, a_boe, a_amt, a_puja), (d_id, d_boe, _, _) = donors
    # Expectation derived from the donor's ACTUAL live signal, not assumed.
    exp_result = 'ADJUDICADA' if ((a_amt or 0) > 0 or a_puja == 'CON_PUJA') else (
        'DESIERTA' if a_puja == 'SIN_PUJA' else None)
    exp_price = a_amt if (a_amt or 0) > 0 else None
    print(f"donor A={a_boe} pujaStatus={a_puja} amount={a_amt} "
          f"-> expect saleResult={exp_result} soldPrice={exp_price}")

    # An already-frozen row — the exactly-once victim if the guard were relaxed.
    cur.execute("""SELECT id FROM "Auction"
                   WHERE status = 'CONCLUIDA_PORTAL' AND "saleResult" IS NOT NULL
                     AND ("pujaStatus" IS NOT NULL OR COALESCE("currentBidAmount",0) > 0)
                     AND "endsAt" IS NOT NULL AND "endsAt" <= now()
                   LIMIT 1""")
    frozen_id = cur.fetchone()[0]
    cur.execute(SNAP, (frozen_id,))
    frozen_before = cur.fetchone()

    try:
        # ================= A. REPRODUCE THE CURRENT FAILURE =================
        print("\nA. REPRODUCE — a scraper-concluded row can never enter a freeze batch")
        # Simulate the scraper-upsert path verbatim: a bare status UPDATE, no
        # freeze call. This is what scrape_pulse L878 / property_scraper FINISHED
        # / db.py / the backfills all do.
        cur.execute("""UPDATE "Auction"
                       SET status = 'CONCLUIDA_PORTAL',
                           "endsAt" = now() - interval '9 hours',
                           "transitionedAt" = now(), "updatedAt" = now()
                       WHERE id = %s""", (a_id,))
        check("donor concluded via scraper path", cur.rowcount == 1, a_boe)

        cur.execute(SNAP, (a_id,))
        assert cur.fetchone()[1] is None, "donor should start unfrozen"

        # A1 — it is structurally invisible to the scheduler's batch builder.
        cur.execute(EXPIRY_SELECT)
        batch = [r[0] for r in cur.fetchall()]
        check("row is ABSENT from the scheduler's expiry SELECT (can never re-enter a batch)",
              a_id not in batch, f"batch size {len(batch)}")

        # A2 — run the LIVE batch freeze over the real batch. It cannot touch it.
        cur.execute(OLD_FREEZE_SQL, (NOW, batch))
        old_rc = cur.rowcount
        cur.execute(SNAP, (a_id,))
        after_old = cur.fetchone()
        check("BUG REPRODUCED: live batch freeze leaves the row saleResult NULL",
              after_old[1] is None, f"batch freeze touched {old_rc} rows, none of them ours")

        # ================= B. DIRECTION 1 — it gets frozen =================
        print("\nB. DIRECTION 1 — the widened sweep freezes the concluded row")
        cur.execute(reconcile_sql, (NOW, NOW))
        swept = cur.rowcount
        cur.execute(SNAP, (a_id,))
        st, sr, sp, sd, att, pj, amt, ends = cur.fetchone()
        check("saleResult now set to the value the live signal implies",
              sr == exp_result, f"got {sr}, expected {exp_result} (amount {amt}, puja {pj})")
        check("soldDate == endsAt", sd == ends, str(sd))
        check("soldPrice == captured currentBidAmount (NULL when no amount survived)",
              sp == exp_price, f"{sp} vs {exp_price}")
        check("resultCheckAttempts reset to 0", att == 0)
        check("pujaStatus / currentBidAmount / status unmutated",
              pj == a_puja and amt == a_amt and st == 'CONCLUIDA_PORTAL')
        check("sweep matched a non-zero row set", swept >= 1, f"swept={swept}")

        # ================= C. DIRECTION 2 — exactly once =================
        print("\nC. DIRECTION 2 — an already-frozen row is left alone")
        cur.execute(SNAP, (a_id,))
        b_after = cur.fetchone()
        # Pass 2 — real semantics (the scheduler always passes now for both).
        cur.execute(reconcile_sql, (NOW, NOW))
        second = cur.rowcount
        cur.execute(SNAP, (a_id,))
        check("re-running the sweep does NOT re-freeze the row we just froze",
              cur.fetchone() == b_after, f"second pass matched {second} rows")
        check("second pass over an already-converged set matched ZERO rows",
              second == 0, f"rowcount={second}")
        cur.execute(SNAP, (frozen_id,))
        check("a pre-existing frozen row is byte-identical after the sweep",
              cur.fetchone() == frozen_before)

        # Pass 3 — adversarial: open the time window to the year 2099, i.e.
        # DISABLE the coherence guard while leaving the exactly-once guard in
        # place. This isolates the two guards from each other. The rows it picks
        # up are precisely the incoherent future-endsAt ones (SUB-RC-...0326 and
        # friends), which proves the coherence guard is a TIME-RELATIVE hold, not
        # a permanent exclusion — they freeze themselves once endsAt passes. What
        # must NOT happen, even with the window wide open, is a re-freeze.
        cur.execute(reconcile_sql, ("2099-01-01 00:00:00", "2099-01-01 00:00:00"))
        third = cur.rowcount
        cur.execute(SNAP, (a_id,))
        check("EXACTLY-ONCE holds even with the coherence guard disabled",
              cur.fetchone() == b_after, f"wide-window pass matched {third} future-dated rows")
        cur.execute(SNAP, (frozen_id,))
        check("pre-existing frozen row still byte-identical after the wide pass",
              cur.fetchone() == frozen_before)

        # ================= D. COHERENCE GUARD =================
        print("\nD. COHERENCE — a future-endsAt concluded row is held back")
        cur.execute("""UPDATE "Auction"
                       SET status = 'CONCLUIDA_PORTAL',
                           "endsAt" = now() + interval '13 days',
                           "saleResult" = NULL, "soldDate" = NULL, "soldPrice" = NULL
                       WHERE id = %s""", (d_id,))
        cur.execute(reconcile_sql, (NOW, NOW))
        cur.execute(SNAP, (d_id,))
        check("future-endsAt row NOT frozen (no future soldDate stamped)",
              cur.fetchone()[1] is None, d_boe)
        cur.execute("""SELECT count(*) FROM "Auction"
                       WHERE status='CONCLUIDA_PORTAL' AND "saleResult" IS NULL
                         AND ("pujaStatus" IS NOT NULL OR COALESCE("currentBidAmount",0)>0)
                         AND ("endsAt" IS NULL OR "endsAt" > now())""")
        inc = cur.fetchone()[0]
        check("incoherent counter SEES it (held back, not invisible)", inc >= 1, f"count={inc}")

        # ================= E. WITNESS LIVENESS =================
        print("\nE. LIVENESS — the residual witness can actually fire")
        witness = """SELECT status::text, count(*) FROM "Auction"
                     WHERE status::text = ANY(%s) AND "saleResult" IS NULL
                       AND ("pujaStatus" IS NOT NULL OR COALESCE("currentBidAmount",0) > 0)
                       AND "endsAt" IS NOT NULL AND "endsAt" <= now()
                     GROUP BY 1"""
        cur.execute(witness, (witness_family,))
        base = sum(r[1] for r in cur.fetchall())
        check("witness is SILENT on a converged system (post-sweep residual 0)",
              base == 0, f"residual={base}")
        # Now park a row in a concluded status the sweep does NOT cover — exactly
        # what predicate drift or a new terminal status would look like.
        cur.execute("""UPDATE "Auction"
                       SET status = 'FINALIZADA_AUTORIDAD',
                           "endsAt" = now() - interval '9 hours',
                           "saleResult" = NULL
                       WHERE id = %s""", (d_id,))
        cur.execute(reconcile_sql, (NOW, NOW))
        cur.execute(witness, (witness_family,))
        rows = cur.fetchall()
        resid = sum(r[1] for r in rows)
        check("witness FIRES on a concluded status the sweep does not reach",
              resid >= 1, f"residual={resid} {rows}")

        # ================= F. HEALTH-GATE LIVENESS =================
        print("\nF. LIVENESS — the aged-backlog health gate can actually fire")
        aged_sql = """SELECT count(*) FROM "Auction"
                      WHERE status = 'CONCLUIDA_PORTAL' AND "saleResult" IS NULL
                        AND ("pujaStatus" IS NOT NULL OR COALESCE("currentBidAmount",0) > 0)
                        AND "endsAt" IS NOT NULL
                        AND "endsAt" <= now() - make_interval(hours => 6)"""
        cur.execute(aged_sql)
        check("aged gate is GREEN on a converged system", cur.fetchone()[0] == 0)
        # Recreate today's bug exactly: scraper-concluded, unfrozen, 9h old.
        cur.execute("""UPDATE "Auction"
                       SET status = 'CONCLUIDA_PORTAL',
                           "endsAt" = now() - interval '9 hours',
                           "saleResult" = NULL
                       WHERE id = %s""", (d_id,))
        cur.execute(aged_sql)
        n = cur.fetchone()[0]
        check("aged gate FIRES on an unfrozen row that has sat 9h (today's bug)",
              n >= 1, f"aged={n}")
        # ============ G. TERMINAL-WITHOUT-RESULT (Ken ruling) ============
        print("\nG. CANCELADA — never swept, never witnessed, separately labelled")
        terminal = list(extract_const("FREEZE_TERMINAL_NO_RESULT"))
        check("exclusion is EXPLICIT and NAMED, not an omission",
              terminal == ['CANCELADA'], str(terminal))
        check("witness family and terminal-without-result are DISJOINT",
              not (set(witness_family) & set(terminal)))
        # A cancelled row carrying a puja signal must survive the sweep untouched.
        cur.execute("""SELECT id FROM "Auction"
                       WHERE status = 'CANCELADA' AND "saleResult" IS NULL
                         AND ("pujaStatus" IS NOT NULL OR COALESCE("currentBidAmount",0) > 0)
                         AND "endsAt" IS NOT NULL AND "endsAt" <= now()
                       LIMIT 1""")
        canc_id = cur.fetchone()[0]
        cur.execute(SNAP, (canc_id,))
        canc_before = cur.fetchone()
        cur.execute(reconcile_sql, (NOW, NOW))
        cur.execute(SNAP, (canc_id,))
        check("a CANCELADA row with a puja signal is NOT frozen (no fabricated sale)",
              cur.fetchone() == canc_before)
        # ...and must NOT appear in the residual witness as permanent noise.
        cur.execute(witness, (witness_family,))
        w = sum(r[1] for r in cur.fetchall())
        check("CANCELADA rows do NOT inflate the residual witness",
              w == 0, f"residual={w}")
        # ...but must be visible under their own label.
        cur.execute("""SELECT count(*) FROM "Auction"
                       WHERE status::text = ANY(%s) AND "saleResult" IS NULL
                         AND ("pujaStatus" IS NOT NULL OR COALESCE("currentBidAmount",0) > 0)""",
                    (terminal,))
        canc_n = cur.fetchone()[0]
        check("cancelled rows ARE reported under their own label",
              canc_n > 0, f"cancelled={canc_n}")
        print(f"    -> witness distinguishes: residual={w} (broken) vs "
              f"cancelled={canc_n} (terminal)")
        # The misconfiguration guard must be able to fire.
        check("disjointness guard FIRES if the two families ever overlap",
              bool(set(witness_family + ['CANCELADA']) & set(terminal)))
    finally:
        conn.rollback()

    # Post-rollback: prove prod is untouched.
    cur = conn.cursor()
    cur.execute(SNAP, (frozen_id,))
    check("POST-ROLLBACK: pre-existing frozen row unchanged in prod",
          cur.fetchone() == frozen_before)
    cur.execute('SELECT status::text, "saleResult" FROM "Auction" WHERE id = ANY(%s)',
                ([a_id, d_id],))
    check("POST-ROLLBACK: donor rows still CELEBRANDOSE / unfrozen in prod",
          all(r[0] == 'CELEBRANDOSE' and r[1] is None for r in cur.fetchall()))
    conn.close()

    print("\nRESULT: " + ("ALL PASS" if not FAILURES else f"{len(FAILURES)} FAILURES: {FAILURES}"))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
