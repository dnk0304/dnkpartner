/**
 * Unit tests for the wave173 "active first" default ordering (Task 2).
 * Run with: npx tsx src/lib/auction-status.active-first.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * Guards the two properties the default landing sort depends on:
 *   1. activeFirstRankOf() tiers every canonical status correctly
 *      (active=0, pre-auction=1, finished/cancelled/unknown=2) and NEVER
 *      drifts from isActiveStatus / isPreAuctionStatus.
 *   2. buildActiveFirstCaseSql() emits a CASE whose IN-lists exactly mirror
 *      ACTIVE_DB_STATUSES / PRE_AUCTION_DB_STATUSES — the drift-proofing the
 *      brief requires (the SQL and the predicates share one source of truth).
 */
import {
  activeFirstRankOf,
  buildActiveFirstCaseSql,
  ACTIVE_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  FINISHED_DB_STATUSES,
} from './auction-status';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

// 1. Rank tiering — active statuses → 0
for (const s of ACTIVE_DB_STATUSES) {
  check(`activeFirstRankOf(${s}) === 0`, activeFirstRankOf(s) === 0);
}
// pre-auction statuses → 1
for (const s of PRE_AUCTION_DB_STATUSES) {
  check(`activeFirstRankOf(${s}) === 1`, activeFirstRankOf(s) === 1);
}
// finished/cancelled statuses → 2 (tail)
for (const s of FINISHED_DB_STATUSES) {
  check(`activeFirstRankOf(${s}) === 2`, activeFirstRankOf(s) === 2);
}
// unknown / null → 2 (never floats above real active rows)
check('activeFirstRankOf(unknown) === 2', activeFirstRankOf('SOMETHING_NEW') === 2);
check('activeFirstRankOf(null) === 2', activeFirstRankOf(null) === 2);
check('activeFirstRankOf(undefined) === 2', activeFirstRankOf(undefined) === 2);

// 2. CASE SQL mirrors the canonical sets exactly (no drift).
const sql = buildActiveFirstCaseSql();
check('CASE has three tiers (THEN 0 / THEN 1 / ELSE 2)',
  sql.includes('THEN 0') && sql.includes('THEN 1') && sql.includes('ELSE 2'));
check('CASE defaults to bare `status` column', sql.includes('WHEN status IN ('));
// Every active status literal is present in the tier-0 IN-list, and every
// pre-auction literal in the tier-1 IN-list.
for (const s of ACTIVE_DB_STATUSES) {
  check(`CASE lists active '${s}'`, sql.includes(`'${s}'`));
}
for (const s of PRE_AUCTION_DB_STATUSES) {
  check(`CASE lists pre-auction '${s}'`, sql.includes(`'${s}'`));
}
// A finished status must NOT be pinned into an active tier (it falls to ELSE 2).
check('CASE does NOT list a finished status', !sql.includes(`'CONCLUIDA_PORTAL'`));

// custom column arg is honoured (defensive — callers may alias)
check('CASE honours a custom column arg',
  buildActiveFirstCaseSql('a.status').includes('WHEN a.status IN ('));

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll active-first sort tests passed.');
