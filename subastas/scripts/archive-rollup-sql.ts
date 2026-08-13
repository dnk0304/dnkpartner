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
 * ⭐ MOVED 2026-08-13 (v4 P3). The outcome CASE and the rollup SELECT now live in
 * `src/lib/registro/archive-census-sql.ts` and are RE-EXPORTED here so this
 * script keeps its filename, its CLI and its `--verify` proof.
 *
 * Why they moved: P3 serves the same census at request time (the sitemap must
 * advertise the tree the routes serve), and an app module cannot import from
 * `scripts/`. Copying the SQL would have re-opened Ken's T2 ticket with a third
 * definition. There is still exactly one.
 *
 * The SELECT gained `AT TIME ZONE 'UTC'` around the date extraction — see the
 * header of that file. It makes the SQL bucket bit-identical to
 * `archiveYearOf()`, which matters now that a SERVED sitemap depends on it.
 */
export {
  ARCHIVE_ROLLUP_OUTCOME_CASE,
  ARCHIVE_ROLLUP_SELECT,
  archiveRollupQuery,
} from '../src/lib/registro/archive-census-sql';
// Imported as VALUES too: `export … from` re-exports without binding anything
// into local scope, and `main()` below calls `archiveRollupQuery()`.
import {
  ARCHIVE_ROLLUP_OUTCOME_CASE,
  archiveRollupQuery,
} from '../src/lib/registro/archive-census-sql';

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
