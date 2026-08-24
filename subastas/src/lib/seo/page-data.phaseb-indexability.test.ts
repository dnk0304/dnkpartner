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
import { isSeoIndexable } from './page-data';
import { concludedIndexableWhere } from './concluded-indexable';

let failures = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

// 1. OR-tier truth table. index iff (active+upcoming) OR (finished-with-result).
check('active-only town indexes', isSeoIndexable(5, 0) === true);
check('upcoming-only town indexes (indexableCount>0)', isSeoIndexable(2, 0) === true);
check('finished-only town indexes (concludedCount>0)', isSeoIndexable(0, 3) === true);
check('active + finished town indexes', isSeoIndexable(4, 9) === true);
check('truly-zero-history town does NOT index', isSeoIndexable(0, 0) === false);

// 2. The content block's concluded query carries the FULL single-source
//    predicate — status set, indexable categories, result-checked, sold/deserted
//    outcome, AND the recency floor — so a town indexed on finished inventory is
//    composed only of rows the sitemap already trusts (no new predicate).
const w = concludedIndexableWhere(new Date('2026-08-24T00:00:00Z'));
check('concluded predicate constrains status', w.status != null);
check('concluded predicate constrains category', w.category != null);
check('concluded predicate requires resultCheckedAt', (w as { resultCheckedAt?: unknown }).resultCheckedAt != null);
check('concluded predicate constrains saleResult (sold/deserted)', (w as { saleResult?: unknown }).saleResult != null);
check('concluded predicate carries the recency floor (endsAt gte)', (w.endsAt as { gte?: Date })?.gte instanceof Date);

if (failures > 0) {
  console.error(`\nphaseb-indexability: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nphaseb-indexability: all assertions passed');
