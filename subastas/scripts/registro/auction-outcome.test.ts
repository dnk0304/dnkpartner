/**
 * Unit tests for the canonical auction-outcome taxonomy.
 *
 * Run with: npx tsx scripts/registro/auction-outcome.test.ts
 *
 * No test-framework dependency — plain assertions, exit-code-driven so CI can
 * gate on a single tsx invocation. Covers >= 2 rows per bucket, the
 * stale-suspended window (past/future/absent resumeAt, fresh vs stale
 * updatedAt), the ADJUDICADA/DESIERTA-wins-over-status precedence, and the
 * slug round-trip.
 *
 * Field shapes mirror real prod rows (boeIds from the sold-price spike where
 * known: SUB-JA-2026-262729 sold, SUB-JA-2025-256171 desierta).
 */
import {
  auctionOutcome,
  isStaleSuspended,
  isSeoIndexableOutcome,
  outcomeFromSlug,
  OUTCOME_SLUG,
  STALE_SUSPENDED_DAYS,
  type AuctionOutcome,
  type OutcomeRow,
} from '../../src/lib/seo/auction-outcome';

const NOW = new Date('2026-07-18T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

interface Case {
  name: string;
  row: OutcomeRow;
  expect: AuctionOutcome;
}

const CASES: Case[] = [
  // ── VENDIDA (saleResult wins regardless of status) ──────────────────────
  {
    name: 'VENDIDA — ADJUDICADA on CONCLUIDA_PORTAL (SUB-JA-2026-262729)',
    row: { status: 'CONCLUIDA_PORTAL', saleResult: 'ADJUDICADA' },
    expect: 'VENDIDA',
  },
  {
    name: 'VENDIDA — ADJUDICADA even on a stale CANCELADA status (sale wins)',
    row: { status: 'CANCELADA', saleResult: 'ADJUDICADA' },
    expect: 'VENDIDA',
  },
  // ── DESIERTA ────────────────────────────────────────────────────────────
  {
    name: 'DESIERTA — DESIERTA on CONCLUIDA_PORTAL (SUB-JA-2025-256171)',
    row: { status: 'CONCLUIDA_PORTAL', saleResult: 'DESIERTA' },
    expect: 'DESIERTA',
  },
  {
    name: 'DESIERTA — DESIERTA on legacy FINISHED',
    row: { status: 'FINISHED', saleResult: 'DESIERTA' },
    expect: 'DESIERTA',
  },
  // ── CANCELADA (explicit + legacy) ───────────────────────────────────────
  {
    name: 'CANCELADA — explicit CANCELADA status, no sale result',
    row: { status: 'CANCELADA', saleResult: null },
    expect: 'CANCELADA',
  },
  {
    name: 'CANCELADA — legacy CANCELLED status, SIN_RESULTADO',
    row: { status: 'CANCELLED', saleResult: 'SIN_RESULTADO' },
    expect: 'CANCELADA',
  },
  // ── CANCELADA via stale-suspended ───────────────────────────────────────
  {
    name: 'CANCELADA — SUSPENDIDA, resumeAt in past, untouched > 60d',
    row: { status: 'SUSPENDIDA', saleResult: null, resumeAt: daysAgo(90), updatedAt: daysAgo(90) },
    expect: 'CANCELADA',
  },
  {
    name: 'CANCELADA — SUSPENDIDA, resumeAt NULL, untouched > 60d',
    row: { status: 'SUSPENDIDA', saleResult: null, resumeAt: null, updatedAt: daysAgo(70) },
    expect: 'CANCELADA',
  },
  // ── FINALIZADA_SIN_RESULTADO ────────────────────────────────────────────
  {
    name: 'FINALIZADA_SIN_RESULTADO — authority-finalized, NULL result',
    row: { status: 'FINALIZADA_AUTORIDAD', saleResult: null },
    expect: 'FINALIZADA_SIN_RESULTADO',
  },
  {
    name: 'FINALIZADA_SIN_RESULTADO — authority-finalized, SIN_RESULTADO',
    row: { status: 'FINALIZADA_AUTORIDAD', saleResult: 'SIN_RESULTADO' },
    expect: 'FINALIZADA_SIN_RESULTADO',
  },
  // ── INDETERMINADO ───────────────────────────────────────────────────────
  {
    name: 'INDETERMINADO — SUSPENDIDA with FUTURE resumeAt (still pending)',
    row: { status: 'SUSPENDIDA', saleResult: null, resumeAt: daysAhead(10), updatedAt: daysAgo(90) },
    expect: 'INDETERMINADO',
  },
  {
    name: 'INDETERMINADO — SUSPENDIDA, past resumeAt but FRESH (touched 5d ago)',
    row: { status: 'SUSPENDIDA', saleResult: null, resumeAt: daysAgo(30), updatedAt: daysAgo(5) },
    expect: 'INDETERMINADO',
  },
  {
    name: 'INDETERMINADO — CONCLUIDA_PORTAL, checked but no resolved result',
    row: { status: 'CONCLUIDA_PORTAL', saleResult: 'SIN_RESULTADO' },
    expect: 'INDETERMINADO',
  },
  {
    name: 'INDETERMINADO — still-active CELEBRANDOSE row',
    row: { status: 'CELEBRANDOSE', saleResult: null },
    expect: 'INDETERMINADO',
  },
];

let pass = 0;
let fail = 0;

for (const c of CASES) {
  const got = auctionOutcome(c.row, NOW);
  if (got === c.expect) {
    pass++;
    console.log(`  ok   ${c.name}`);
  } else {
    fail++;
    console.error(`  FAIL ${c.name}  — expected ${c.expect}, got ${got}`);
  }
}

// ── stale-suspended helper edge cases ─────────────────────────────────────
function assert(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.error(`  FAIL ${name}`);
  }
}

assert(
  'isStaleSuspended false when updatedAt missing (no freshness signal)',
  isStaleSuspended({ status: 'SUSPENDIDA', saleResult: null, resumeAt: daysAgo(90) }, NOW) === false,
);
assert(
  `isStaleSuspended true exactly at the ${STALE_SUSPENDED_DAYS}d boundary`,
  isStaleSuspended(
    { status: 'SUSPENDIDA', saleResult: null, resumeAt: null, updatedAt: daysAgo(STALE_SUSPENDED_DAYS) },
    NOW,
  ) === true,
);
assert(
  'isStaleSuspended false for a non-suspended status',
  isStaleSuspended({ status: 'CANCELADA', saleResult: null, updatedAt: daysAgo(90) }, NOW) === false,
);

// ── SEO-indexable outcome membership ──────────────────────────────────────
assert('VENDIDA is SEO-indexable', isSeoIndexableOutcome('VENDIDA'));
assert('DESIERTA is SEO-indexable', isSeoIndexableOutcome('DESIERTA'));
assert('CANCELADA is NOT SEO-indexable', !isSeoIndexableOutcome('CANCELADA'));
assert(
  'FINALIZADA_SIN_RESULTADO is NOT SEO-indexable',
  !isSeoIndexableOutcome('FINALIZADA_SIN_RESULTADO'),
);

// ── slug round-trip ───────────────────────────────────────────────────────
for (const [bucket, slug] of Object.entries(OUTCOME_SLUG) as [AuctionOutcome, string][]) {
  assert(`slug round-trip: ${bucket} ↔ ${slug}`, outcomeFromSlug(slug) === bucket);
}
assert('outcomeFromSlug(unknown) === null', outcomeFromSlug('nope') === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
