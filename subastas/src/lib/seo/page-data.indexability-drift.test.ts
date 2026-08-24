/**
 * Drift guard: the page INDEXABILITY predicate and the SITEMAP INCLUSION
 * predicate must gate on the SAME status set — one shared constant, no copies.
 *
 * Run with: npx tsx src/lib/seo/page-data.indexability-drift.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 *
 * On 2026-08-05 the hub-count unification rebound the file-local
 * `ACTIVE_STATUSES` from [ACTIVE, CELEBRANDOSE, PRE_AUCTION, PROXIMA_APERTURA]
 * to the `activas` display bucket, which DROPS the two upcoming statuses. The
 * town/province `robots:` gate read that count, so pages with only upcoming
 * inventory silently flipped to `noindex,follow` — while the sitemap
 * (`activeMunicipalityPairs` / `provincesWithInventory`, gated on
 * `SITEMAP_INVENTORY_STATUSES`) kept advertising them. That mixed signal grew
 * "Excluded by 'noindex'" to ~1,305 URLs in GSC and starved discovery of the
 * property URLs the town hubs link to.
 *
 * Forge 2026-08-24 split the robots gate onto `countIndexableInventory`, which
 * reads `SITEMAP_INVENTORY_STATUSES` — the SAME object the sitemap reads. This
 * test pins that they can never diverge again silently: the exact class of bug.
 */
import { AuctionStatus } from '@prisma/client';
import {
  SITEMAP_INVENTORY_STATUSES,
  indexableWhere,
} from './page-data';
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

const sortset = (a: readonly string[]) => [...a].map(String).sort().join(',');

// 1. The page indexability predicate reads the SHARED constant by reference —
//    not a hand-copied array. Reference identity is the strongest drift-proof:
//    if someone reintroduces a private status array for the robots gate, this
//    breaks immediately.
const w = indexableWhere({ province: 'MADRID', municipality: ['Madrid'] });
const statusFilter = (w.status as { in?: AuctionStatus[] } | undefined) ?? {};
check(
  'indexableWhere gates on the shared SITEMAP_INVENTORY_STATUSES object (ref identity)',
  statusFilter.in === SITEMAP_INVENTORY_STATUSES,
);

// 2. The page indexability predicate ANDs the soft-hide gate (inScope=true),
//    the catalog invariant every surface shares.
check('indexableWhere carries inScope:true', (w as { inScope?: unknown }).inScope === true);

// 3. The shared set is EXACTLY active + upcoming — Dennis's 2026-06-24 directive
//    ("index active + upcoming"). This is the guard that fails the moment
//    someone rebinds the constant to the display bucket again (the 08-05 shape
//    of the regression).
const EXPECTED = [
  AuctionStatus.ACTIVE,
  AuctionStatus.CELEBRANDOSE,
  AuctionStatus.PRE_AUCTION,
  AuctionStatus.PROXIMA_APERTURA,
];
check(
  'SITEMAP_INVENTORY_STATUSES == active + upcoming (ACTIVE,CELEBRANDOSE,PRE_AUCTION,PROXIMA_APERTURA)',
  sortset(SITEMAP_INVENTORY_STATUSES) === sortset(EXPECTED),
);

// 4. The indexability set must CONTAIN the two upcoming statuses — the precise
//    statuses the regression dropped. Asserted independently of #3 so the
//    intent ("upcoming towns index") is legible even if the active set changes.
check(
  'indexability set includes PRE_AUCTION (upcoming)',
  SITEMAP_INVENTORY_STATUSES.includes(AuctionStatus.PRE_AUCTION),
);
check(
  'indexability set includes PROXIMA_APERTURA (upcoming)',
  SITEMAP_INVENTORY_STATUSES.includes(AuctionStatus.PROXIMA_APERTURA),
);

// 5. Document the DELIBERATE divergence from the DISPLAY bucket: the `activas`
//    bucket (title/H1/intro count) drops the two upcoming statuses on purpose.
//    If these two ever become equal, the display and the robots gate have been
//    re-collapsed onto one predicate — which is what 08-05 did. The indexable
//    set must be a strict superset of the display bucket's upcoming-less set.
const activas = [...WHEN_BUCKET_DB_STATUSES.activas].map(String);
check(
  'display "activas" bucket does NOT contain upcoming statuses (stays a separate predicate)',
  !activas.includes(String(AuctionStatus.PRE_AUCTION)) &&
    !activas.includes(String(AuctionStatus.PROXIMA_APERTURA)),
);
check(
  'indexability set differs from the activas display bucket (they are two predicates)',
  sortset(SITEMAP_INVENTORY_STATUSES) !== sortset(activas),
);

if (failures) {
  console.error(`\nindexability-drift: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nindexability-drift: all assertions passed');
process.exit(0);
