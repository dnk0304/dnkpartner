/**
 * Phase B guard: the finished-only town/province indexability tier + the
 * content-block reuse of the SINGLE-SOURCE concluded predicate.
 *
 * Run with: npx tsx src/lib/seo/page-data.phaseb-indexability.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 *
 * Phase A indexes active+upcoming towns. Phase B (Dennis-approved B1, 2026-08-24)
 * extends indexing to towns with ONLY finished-with-result inventory — but ONLY
 * because the content block renders that inventory as crawlable HTML. This test
 * pins the OR-tier truth table (`isSeoIndexable`) and that the content-block
 * concluded query is materialised from `concludedIndexableWhere()` — the SAME
 * fragment the sitemap membership + detail-page robots gate use, so the town
 * index tier can never fork from the sitemap/detail gate.
 */
import { isSeoIndexable, historyWhere } from './page-data';
import { WHEN_BUCKET_DB_STATUSES } from '../auction-status';

let failures = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

// 1. OR-tier truth table. index iff (active+upcoming) OR (ANY past/finished).
//    Phase C (Dennis 2026-09-07): the second tier is now ANY history, not just
//    finished-with-result — the truth table is unchanged, its INPUT broadened.
check('active-only town indexes', isSeoIndexable(5, 0) === true);
check('upcoming-only town indexes (indexableCount>0)', isSeoIndexable(2, 0) === true);
check('history-only town indexes (historyCount>0)', isSeoIndexable(0, 3) === true);
check('active + history town indexes', isSeoIndexable(4, 9) === true);
check('truly-zero-history town does NOT index', isSeoIndexable(0, 0) === false);

// 2. PHASE C: the finished/history predicate is the whole `finalizadas` bucket
//    (every terminal status, ANY outcome) + inScope, with NO outcome filter, NO
//    category filter and NO recency floor — a town with 8 years of past auctions
//    indexes on that history alone. The SAME predicate feeds the content block,
//    so a history-indexed town renders that history and is never thin.
const w = historyWhere({ province: 'MADRID', municipality: ['Madrid'] });
const wStatus = (w.status as { in?: string[] } | undefined)?.in ?? [];
const finalizadas = [...WHEN_BUCKET_DB_STATUSES.finalizadas].map(String);
const sortset = (a: readonly string[]) => [...a].map(String).sort().join(',');
check('history predicate gates on the finalizadas bucket (any terminal status)', sortset(wStatus) === sortset(finalizadas));
check('history predicate carries inScope:true', (w as { inScope?: unknown }).inScope === true);
check('history predicate has NO saleResult outcome filter', (w as { saleResult?: unknown }).saleResult === undefined);
check('history predicate does NOT require resultCheckedAt', (w as { resultCheckedAt?: unknown }).resultCheckedAt === undefined);
check('history predicate has NO category filter', (w as { category?: unknown }).category === undefined);
check('history predicate has NO recency floor (indexes 8-year-old history)', (w as { endsAt?: unknown }).endsAt === undefined);
check('history predicate scopes to province + MUNI-A municipality set', w.province === 'MADRID' && Array.isArray((w.municipality as { in?: string[] })?.in));

if (failures > 0) {
  console.error(`\nphaseb-indexability: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nphaseb-indexability: all assertions passed');
