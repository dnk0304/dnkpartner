/**
 * Predicate-equality tests for the hub "¿Cuándo?" tabs + the Bizkaia
 * regression fixture.
 *
 * Run with: npx tsx src/lib/auction-status.when-bucket.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * ─── WHAT THIS FILE PINS ─────────────────────────────────────────────────
 *
 * THE INVARIANT (Forge 2026-08-05, after Ghost's 52-province sweep):
 *
 *   For every tab T, the cards rendered under T and the number displayed for T
 *   are produced by ONE predicate — `WHEN_BUCKET_DB_STATUSES[T]`, plus the
 *   scope gate, plus (for `activas` only) the null-safe clock guard. The
 *   `activas` and `proximas` buckets contain NO terminal status, and a card
 *   that the predicate admits may NEVER render with a terminal badge.
 *
 * The sweep found three surfaces on one page computing three different
 * answers: the SEO intro count used a LOCAL set that counted próximas and
 * dropped suspendidas; the H1 subtitle + card grid used the API's set, which
 * did the exact opposite; and the client tab CSVs were a third hand-written
 * copy. Zaragoza advertised 42 above an empty Activas tab; Albacete 22 vs 1;
 * Madrid 107 vs 26.
 *
 * The BLOCKER it also found — Bizkaia's Activas tab rendering 15 cards all
 * badged CONCLUIDA — was NOT a filter leak. All 15 rows were genuinely
 * CELEBRANDOSE/SUSPENDIDA with `endsAt = NULL`, correctly selected by the
 * null-safe SQL clock guard. `/api/auctions` then FABRICATED an `endDate`
 * (`publishedAt + 30d`) for the null column, and the card's clock-wins rule
 * (`effectiveStatus`) compared against that invented past timestamp and
 * overrode the row to `concluida-portal`. Test 4 below is that fixture.
 */
import {
  WHEN_BUCKETS,
  WHEN_BUCKET_DB_STATUSES,
  whenBucketFrontendStatuses,
  whenBucketWherePrisma,
  whenBucketUsesClockGuard,
  whenBucketMatches,
  isInWhenBucket,
  ACTIVE_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  FINISHED_DB_STATUSES,
  isFinishedStatus,
  mapStatus,
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
const sorted = (a: readonly string[]) => [...a].sort().join(',');

// ─────────────────────────────────────────────────────────────────────────
// 1. NO TERMINAL STATUS may enter the live buckets.
//    This is the half of the invariant that makes "Activas" mean something.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n1. activas / proximas exclude every terminal status');
for (const bucket of ['activas', 'proximas'] as const) {
  for (const s of WHEN_BUCKET_DB_STATUSES[bucket]) {
    check(`${bucket} does not contain terminal ${s}`, !isFinishedStatus(s));
  }
  for (const terminal of FINISHED_DB_STATUSES) {
    check(
      `${bucket} rejects ${terminal}`,
      !isInWhenBucket(bucket, terminal) &&
        !whenBucketMatches(bucket, terminal, null),
    );
  }
}
// …and `finalizadas` is exactly the terminal set (no live row hides in it).
check(
  'finalizadas === FINISHED_DB_STATUSES exactly',
  sorted(WHEN_BUCKET_DB_STATUSES.finalizadas) === sorted(FINISHED_DB_STATUSES),
);
// `todas` is the union — no user-facing status is unreachable from any tab.
{
  const union = new Set<string>([
    ...ACTIVE_DB_STATUSES,
    ...PRE_AUCTION_DB_STATUSES,
    ...FINISHED_DB_STATUSES,
  ]);
  check(
    'todas === activas ∪ proximas ∪ finalizadas',
    sorted(WHEN_BUCKET_DB_STATUSES.todas) === sorted([...union]),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2. THE THREE SURFACES SHARE ONE PREDICATE.
//
//    Surface A — the SEO intro count + the SSR crawlable card grid
//                (`lib/seo/page-data.ts` → `scopedWhere`)
//    Surface B — the H1 subtitle count + the hydrated card list
//                (`/api/auctions?status=active`)
//    Surface C — the client tab → API param mapping
//                (`components/observatory/filters.ts`)
//
//    All three now resolve through `whenBucketWherePrisma` /
//    `WHEN_BUCKET_DB_STATUSES` / `whenBucketFrontendStatuses`. We assert the
//    RESOLVED sets are identical, not that they call the same function — a
//    caller can always re-declare, and re-declaring is the defect.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n2. the three hub surfaces resolve to one predicate');

// A — the Prisma where the intro count and the SSR grid share.
const surfaceA = whenBucketWherePrisma('activas');
check(
  'A: SSR/intro status set === activas bucket',
  sorted(surfaceA.status.in) === sorted(WHEN_BUCKET_DB_STATUSES.activas),
);
check('A: SSR/intro applies the scope gate', surfaceA.inScope === true);
check(
  'A: SSR/intro applies the null-safe clock guard',
  Array.isArray(surfaceA.OR) &&
    surfaceA.OR.length === 2 &&
    JSON.stringify(surfaceA.OR[0]) === JSON.stringify({ endsAt: null }),
);

// B — what `/api/auctions?status=active` binds. The route resolves
// `status=active` to ACTIVE_DB_STATUSES + ACTIVE_CLOCK_GUARD_SQL; the bucket
// map must BE that set, or the header number and the intro number re-diverge.
check(
  'B: /api/auctions status=active set === activas bucket',
  sorted(ACTIVE_DB_STATUSES) === sorted(WHEN_BUCKET_DB_STATUSES.activas),
);
check('B: activas is the only clock-guarded bucket', whenBucketUsesClockGuard('activas'));
for (const b of WHEN_BUCKETS) {
  if (b === 'activas') continue;
  check(`B: ${b} is NOT clock-guarded`, !whenBucketUsesClockGuard(b));
}

// A === B, stated directly. This is the equality Ghost's sweep violated.
check(
  'A === B: intro-count predicate === Activas-tab predicate',
  sorted(surfaceA.status.in) === sorted(ACTIVE_DB_STATUSES),
);

// C — the folded frontend statuses the tabs send round-trip to the same DB set.
for (const b of WHEN_BUCKETS) {
  const folded = whenBucketFrontendStatuses(b);
  const roundTripped = new Set(
    WHEN_BUCKET_DB_STATUSES[b].map((s) => mapStatus(s)),
  );
  check(
    `C: ${b} folded statuses round-trip to the same set`,
    sorted(folded) === sorted([...roundTripped]),
  );
  check(
    `C: ${b} fold is de-duplicated`,
    folded.length === new Set(folded).size,
  );
  // Every DB status in the bucket must be REACHABLE through its folded form —
  // otherwise a tab would filter out rows its own count included.
  for (const db of WHEN_BUCKET_DB_STATUSES[b]) {
    check(`C: ${b} reaches ${db} via ${mapStatus(db)}`, folded.includes(mapStatus(db)));
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3. The clock guard is NULL-SAFE — the property the Bizkaia rows depend on.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n3. clock guard is null-safe and past-strict');
const NOW = new Date('2026-08-05T12:00:00Z');
const PAST = new Date('2026-06-05T12:18:00Z'); // the real Bizkaia fabricated value
const FUTURE = new Date('2026-09-05T12:00:00Z');
check(
  'CELEBRANDOSE + endsAt NULL is active',
  whenBucketMatches('activas', 'CELEBRANDOSE', null, NOW),
);
check(
  'CELEBRANDOSE + endsAt in the future is active',
  whenBucketMatches('activas', 'CELEBRANDOSE', FUTURE, NOW),
);
check(
  'CELEBRANDOSE + endsAt in the past is NOT active',
  !whenBucketMatches('activas', 'CELEBRANDOSE', PAST, NOW),
);
check(
  'SUSPENDIDA + endsAt NULL is active (suspendidas stay in the bucket)',
  whenBucketMatches('activas', 'SUSPENDIDA', null, NOW),
);
check(
  'finalizadas ignores the clock (a past endsAt is the point)',
  whenBucketMatches('finalizadas', 'CONCLUIDA_PORTAL', PAST, NOW),
);

// ─────────────────────────────────────────────────────────────────────────
// 4. ⭐ THE BIZKAIA REGRESSION FIXTURE.
//
//    The 15 rows /subastas/bizkaia?when=activas rendered on 2026-08-05, as
//    returned by the live API: 14 CELEBRANDOSE + 1 SUSPENDIDA, every one with
//    `endsAt = NULL`. All 15 were badged CONCLUIDA.
//
//    The rule under test: a row admitted by the `activas` predicate must NOT
//    resolve to a terminal badge. `effectiveStatus` is re-stated here rather
//    than imported because it lives in a React component module
//    (`components/observatory/status.ts`) that a plain-tsx run cannot load;
//    the shapes are asserted identical by the source guard in test 5.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n4. Bizkaia fixture — activas rows never badge terminal');

type ApiRow = { status: string; endsAt: Date | null };
const BIZKAIA_ROWS: ApiRow[] = [
  ...Array.from({ length: 14 }, () => ({ status: 'CELEBRANDOSE', endsAt: null })),
  { status: 'SUSPENDIDA', endsAt: null },
];

/** What `/api/auctions` projects as `endDate`. MUST be honest-null. */
function projectEndDate(row: ApiRow): Date | null {
  return row.endsAt;
}
/** The card's clock-wins rule (mirror of `effectiveStatus`). */
function effectiveBadge(frontendStatus: string, endDate: Date | null, now: Date): string {
  if (endDate != null && endDate.getTime() <= now.getTime()) return 'concluida-portal';
  return frontendStatus;
}

check('fixture is 15 rows (the sweep count)', BIZKAIA_ROWS.length === 15);
let terminalBadges = 0;
let admitted = 0;
for (const row of BIZKAIA_ROWS) {
  // The server admits every one of them…
  if (whenBucketMatches('activas', row.status, row.endsAt, NOW)) admitted++;
  // …and none may come out the other side wearing a terminal badge.
  const badge = effectiveBadge(mapStatus(row.status), projectEndDate(row), NOW);
  if (badge === 'concluida-portal' || badge === 'finalizada-autoridad' || badge === 'cancelada') {
    terminalBadges++;
  }
}
check('all 15 Bizkaia rows are admitted by the activas predicate', admitted === 15);
check('ZERO Bizkaia rows badge terminal (was 15/15 CONCLUIDA)', terminalBadges === 0);

// The regression itself: the OLD fabricated projection, replayed. If anyone
// reintroduces a fallback, this demonstrates exactly what breaks.
{
  const publishedAt = new Date('2026-05-06T12:18:00Z');
  const fabricated = new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  check(
    'the OLD publishedAt+30d fallback did produce a terminal badge (why it is gone)',
    effectiveBadge('celebrandose', fabricated, NOW) === 'concluida-portal',
  );
  check(
    'honest-null does NOT',
    effectiveBadge('celebrandose', null, NOW) === 'celebrandose',
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Source guards — the fabricated end date must not come back, and no
//    surface may re-declare a local status set.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n5. source guards');

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

{
  const route = read('app/api/auctions/route.ts');
  check(
    'route.ts no longer fabricates endDate from publishedAt + 30d',
    !/endDate:\s*endsAt\s*\|\|\s*new Date\(publishedAt/.test(route),
  );
  check(
    'route.ts no longer falls back endDate to publishedAt',
    !/endDate:\s*endsAt\s*\|\|\s*publishedAt/.test(route),
  );
  check(
    'route.ts projects endDate honestly (both branches)',
    (route.match(/endDate:\s*endsAt,/g) || []).length === 2,
  );
  check(
    'route.ts still clock-guards status=active',
    /status === 'active'[\s\S]{0,400}ACTIVE_CLOCK_GUARD_SQL/.test(route),
  );
}
{
  const list = read('app/subastas/SubastasListClient.tsx');
  check(
    'SubastasListClient no longer defaults endDate to new Date()',
    !/endDate:\s*it\.endDate\s*\?\s*new Date\(it\.endDate\)\s*:\s*new Date\(\)/.test(list),
  );
}
{
  const pageData = read('lib/seo/page-data.ts');
  check(
    'page-data derives its active set from the canonical bucket',
    /WHEN_BUCKET_DB_STATUSES\.activas/.test(pageData),
  );
  check(
    'page-data no longer hand-declares a local AuctionStatus.PROXIMA_APERTURA active set',
    !/const ACTIVE_STATUSES: AuctionStatus\[\] = \[/.test(pageData),
  );
  check(
    'page-data scopedWhere goes through whenBucketWherePrisma',
    /scopedWhere[\s\S]{0,600}whenBucketWherePrisma\('activas'\)/.test(pageData),
  );
}
{
  const filters = read('components/observatory/filters.ts');
  check(
    'filters.ts derives tab statuses from the canonical bucket',
    /whenBucketFrontendStatuses/.test(filters),
  );
  check(
    'filters.ts no longer hardcodes the todas CSV',
    !/"celebrandose",\s*\n\s*"proxima-apertura",\s*\n\s*"suspendida",/.test(filters),
  );
  check(
    'filters.ts still routes the Activas tab through the clock-guarded status=active',
    /f\.when === "activas"[\s\S]{0,200}p\.set\("status", "active"\)/.test(filters),
  );
}
{
  // The card badge rule this all hinges on — assert it is still clock-wins and
  // still null-tolerant, so test 4's mirror stays honest.
  const status = read('components/observatory/status.ts');
  check(
    'effectiveStatus is still clock-wins',
    /isEffectivelyEnded\(endsAt\)\)\s*return "concluida-portal"/.test(status),
  );
  check(
    'isEffectivelyEnded treats a missing end date as NOT ended',
    /if \(!endsAt\) return false;/.test(status),
  );
}

console.log(
  failures === 0
    ? '\nAll when-bucket predicate tests passed.'
    : `\n${failures} when-bucket test(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
