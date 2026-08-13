/**
 * archive-rollup-sql — the prod rollup query, GENERATED from the app's own
 * outcome taxonomy, plus a proof that the generated SQL and the app agree.
 *
 * ---------------------------------------------------------------------------
 * TICKET T2 (Ken, 2026-08-13)
 *
 *   "The prod rollup CSV's outcome column is a hand-written SQL CASE duplicating
 *    outcomeWhere(). Two definitions of 'adjudicada' is exactly the drift that
 *    produces a confident, wrong number six months from now. Derive the CSV's
 *    outcome from the same source as the app, or add a test that proves the two
 *    agree."
 *
 * Both, because they fix different halves. There is a second problem the ticket
 * did not name: the CASE was never committed at all. `archive-partition-report.ts`
 * documents the query as `CASE ... END AS outcome  -- SQL projection of
 * outcomeWhere()` — an ellipsis. The six P0 numbers that sized this entire wave
 * came out of a query that exists in nobody's repo and nobody's shell history.
 * That is the same class as P1's vanished corpus, so:
 *
 *   • the SQL now lives HERE, in one place, printed on demand;
 *   • `STALE_SUSPENDED_DAYS` is interpolated from the taxonomy, never typed;
 *   • `--verify` executes the CASE and `auctionOutcome()` over the SAME rows at
 *     the SAME instant and fails on a single disagreement.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 *   npx tsx scripts/archive-rollup-sql.ts            # print the COPY query
 *   npx tsx scripts/archive-rollup-sql.ts --verify   # prove agreement, row by row
 *
 * `--verify` runs against `DATABASE_URL`. Run it against the fixture DB (which
 * carries all four registry buckets, both sides of the stale-suspended window,
 * and the INDETERMINADO residual) and, before the CSV is used for another gate
 * decision, against a prod REPLICA — it is read-only, one SELECT, no writes.
 */

import { config as loadEnv } from 'dotenv';
loadEnv();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { auctionOutcome, STALE_SUSPENDED_DAYS } from '../src/lib/seo/auction-outcome';
import type { SaleResult } from '@prisma/client';

/**
 * The outcome projection, in ONE place.
 *
 * Ordered WHENs, and the order IS the precedence rule from `auctionOutcome()`:
 * a resolved sale wins over status, so by the time control reaches the third
 * branch `saleResult` is necessarily NULL or SIN_RESULTADO and the `NOT_SOLD`
 * predicate `outcomeWhere()` writes explicitly is implied rather than repeated.
 * The suspended branch is `staleSuspendedWhere()` verbatim: suspended, with
 * resumption absent or past, untouched for STALE_SUSPENDED_DAYS — which is
 * interpolated from the taxonomy constant, so raising the window cannot leave a
 * stale 60 behind in a query.
 *
 * `$1` is the "as of" instant, supplied once so every row is classified against
 * the same clock (a rollup that drifts mid-scan double-counts the boundary).
 */
export const ARCHIVE_ROLLUP_OUTCOME_CASE = `CASE
      WHEN a."saleResult" = 'ADJUDICADA' THEN 'VENDIDA'
      WHEN a."saleResult" = 'DESIERTA'   THEN 'DESIERTA'
      WHEN a.status IN ('CANCELADA','CANCELLED') THEN 'CANCELADA'
      WHEN a.status IN ('SUSPENDIDA','SUSPENDED')
       AND (a."resumeAt" IS NULL OR a."resumeAt" < $1)
       AND a."updatedAt" < $1 - interval '${STALE_SUSPENDED_DAYS} days'
                                                 THEN 'CANCELADA'
      WHEN a.status = 'FINALIZADA_AUTORIDAD'      THEN 'FINALIZADA_SIN_RESULTADO'
      ELSE 'INDETERMINADO'
    END`;

/**
 * The read-only prod rollup that feeds `archive-partition-report.ts`.
 *
 * ⚠️ The COALESCEs are `''`/0, NOT defaults: an absent province or auctionType
 * must stay absent so the location-free shelf and the excluded-row census can
 * see it. An earlier version defaulted auctionType to 'JUDICIAL' and silently
 * hid exactly the residue the report is asked to count.
 */
export function archiveRollupQuery(): string {
  return `COPY (
  WITH base AS (
    SELECT COALESCE(a.province,'')                AS province,
           COALESCE(a."municipality",'')          AS municipality,
           COALESCE(a."auctionType",'')           AS auction_type,
           COALESCE(EXTRACT(YEAR    FROM COALESCE(a."endsAt", a."publishedAt"))::int, 0) AS yr,
           COALESCE(EXTRACT(QUARTER FROM COALESCE(a."endsAt", a."publishedAt"))::int, 0) AS qtr,
           ${ARCHIVE_ROLLUP_OUTCOME_CASE} AS outcome
    FROM "Auction" a )
  SELECT province, municipality, auction_type, yr, qtr, outcome, count(*)
  FROM base WHERE outcome <> 'INDETERMINADO' GROUP BY 1,2,3,4,5,6
) TO STDOUT WITH CSV HEADER;`;
}

type Probe = {
  id: string;
  sql_outcome: string;
  status: string | null;
  saleResult: SaleResult | null;
  resumeAt: Date | null;
  updatedAt: Date;
};

async function verify(): Promise<number> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  // ONE instant for both sides. Comparing a SQL `now()` against a JS `new Date()`
  // would make the stale-suspended boundary a race, and a test that fails once a
  // month at a boundary is a test people learn to re-run rather than read.
  const now = new Date();

  const probes = await prisma.$queryRawUnsafe<Probe[]>(
    `SELECT a.id,
            ${ARCHIVE_ROLLUP_OUTCOME_CASE} AS sql_outcome,
            a.status::text AS status, a."saleResult"::text AS "saleResult",
            a."resumeAt", a."updatedAt"
       FROM "Auction" a`,
    now,
  );

  const disagreements: string[] = [];
  const tally = new Map<string, number>();
  for (const p of probes) {
    const ts = auctionOutcome(
      { status: p.status, saleResult: p.saleResult, resumeAt: p.resumeAt, updatedAt: p.updatedAt },
      now,
    );
    tally.set(ts, (tally.get(ts) ?? 0) + 1);
    if (ts !== p.sql_outcome) {
      disagreements.push(
        `  ${p.id}: SQL=${p.sql_outcome} TS=${ts} ` +
          `(status=${p.status} saleResult=${p.saleResult} resumeAt=${p.resumeAt?.toISOString() ?? 'null'})`,
      );
    }
  }
  await prisma.$disconnect();

  console.log(`STALE_SUSPENDED_DAYS=${STALE_SUSPENDED_DAYS}  as-of=${now.toISOString()}`);
  console.log(`rows compared: ${probes.length}`);
  for (const [k, v] of [...tally].sort()) console.log(`  ${k.padEnd(26)} ${v}`);

  // ⛔ VACUITY GUARD. "Zero disagreements" over a corpus missing a branch proves
  // nothing about that branch — which is precisely how the suspended path went
  // untested for the whole wave. Every bucket the CASE can emit must be OBSERVED,
  // or this is a green run with a hole in it.
  const missing = ['VENDIDA', 'DESIERTA', 'CANCELADA', 'FINALIZADA_SIN_RESULTADO', 'INDETERMINADO']
    .filter((b) => !(tally.get(b) ?? 0));
  if (missing.length > 0) {
    console.log(`\nINCONCLUSIVE — no rows in: ${missing.join(', ')}`);
    console.log('The comparison cannot discriminate on a bucket it never saw.');
    return 1;
  }
  if (disagreements.length > 0) {
    console.log(`\nDRIFT — ${disagreements.length} row(s) where the SQL CASE and auctionOutcome() disagree:`);
    for (const d of disagreements.slice(0, 20)) console.log(d);
    return 1;
  }
  console.log('\nAGREEMENT — the SQL CASE and auctionOutcome() classify every row identically.');
  return 0;
}

async function main() {
  if (process.argv.includes('--verify')) process.exit(await verify());
  console.log(archiveRollupQuery());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
