/**
 * Unit tests for the sitemap CHUNK LAYOUT (v4 P3 — the aggregation band).
 * Run with: npx tsx src/lib/seo/sitemap-config.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * WHY THESE EXIST. The aggregation band's chunking cannot be exercised
 * end-to-end by the committed fixture: the fixture's archive is a few hundred
 * URLs and the band only splits past 20,000, so the served suite always sees
 * ONE aggregation child. A slice boundary that is never crossed in a test is a
 * slice boundary nobody has tested — and this one moves the id of every detail
 * child beneath it, which is the third renumber this band has been through.
 *
 * So the renumbering table in `sitemap-config.ts`'s own comment is asserted
 * here, at the layout level, where 20,001 URLs cost nothing:
 *
 *   1. every non-empty (kind, skip) pair maps to exactly ONE published child,
 *      before and after the band widens — the union of <loc> is preserved;
 *   2. no aggregation child is ever empty, for ANY url count;
 *   3. offsets tile the list exactly: no gap (a lost URL), no overlap (a URL in
 *      two children).
 */
import {
  CHILD_SITEMAP_SIZE,
  ACTIVE_CHUNKS,
  PUBLISHED_CONCLUDED_CHILDREN,
  aggregationChildCount,
  buildSitemapLayout,
  classifyChunkIn,
} from '@/lib/seo/sitemap-config';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}`);
  }
}

const key = (c: { kind: string; skip: number }) => `${c.kind}@${c.skip}`;

// ---------------------------------------------------------------------------
console.log('--- aggregationChildCount: never zero, never empty ---');
// ---------------------------------------------------------------------------
check('0 urls still yields 1 child (an index with no children is worse)',
  aggregationChildCount(0) === 1);
check('1 url → 1 child', aggregationChildCount(1) === 1);
check('exactly 20,000 → 1 child (no empty second)',
  aggregationChildCount(CHILD_SITEMAP_SIZE) === 1);
check('20,001 → 2 children', aggregationChildCount(CHILD_SITEMAP_SIZE + 1) === 2);
check('40,000 → 2 children', aggregationChildCount(CHILD_SITEMAP_SIZE * 2) === 2);

// ⭐ THE PROPERTY, not a sample of it: for every url count in a wide range, the
// LAST aggregation child must hold at least one URL. This is the D2 defect
// (`/sitemap/2.xml` served an empty <urlset>) stated as an invariant.
let emptyLast = 0;
for (let n = 1; n <= 100_000; n += 137) {
  const c = aggregationChildCount(n);
  if (n - (c - 1) * CHILD_SITEMAP_SIZE <= 0) emptyLast += 1;
}
check('no url count leaves the last aggregation child empty', emptyLast === 0);

// ---------------------------------------------------------------------------
console.log('\n--- the renumber preserves every (kind, skip) pair ---');
// ---------------------------------------------------------------------------
// Reproduces the table in sitemap-config.ts. `before` = today's band (one
// aggregation child, 16,507 urls measured on prod 2026-08-13). `after` = the
// band once the ramp knob is raised past 20,000.
const before = buildSitemapLayout(16_507);
const after = buildSitemapLayout(20_481);

check('before: 1 aggregation child', before.aggregationChunks === 1);
check('after: 2 aggregation children', after.aggregationChunks === 2);
check('after has exactly one more child than before',
  after.totalChildren === before.totalChildren + 1);
check('totalChildren = aggregation + active + concluded',
  after.totalChildren === after.aggregationChunks + ACTIVE_CHUNKS + PUBLISHED_CONCLUDED_CHILDREN);

const beforePairs = before.ids().map((id) => key(before.classify(id)));
const afterPairs = after.ids().map((id) => key(after.classify(id)));

// ⭐ THE PROOF Ken asked for, in the ACTIVE_CHUNKS style: every pair that
// existed still exists, exactly once. Ids move; content does not.
const missing = beforePairs.filter((p) => !afterPairs.includes(p));
check('no (kind, skip) pair is LOST by the renumber', missing.length === 0);
check('no (kind, skip) pair is DUPLICATED after the renumber',
  new Set(afterPairs).size === afterPairs.length);
check('the only new pair is the new aggregation offset',
  afterPairs.filter((p) => !beforePairs.includes(p)).join(',') ===
    `aggregation@${CHILD_SITEMAP_SIZE}`);

// The concrete table, spelled out so a future reader can diff it by eye.
check('after: id 0 = aggregation@0', key(after.classify(0)) === 'aggregation@0');
check('after: id 1 = aggregation@20000',
  key(after.classify(1)) === `aggregation@${CHILD_SITEMAP_SIZE}`);
check('after: id 2 = active@0', key(after.classify(2)) === 'active@0');
check('after: id 3 = concluded@0', key(after.classify(3)) === 'concluded@0');
check('before: id 1 = active@0 (the id that moved to 2)',
  key(before.classify(1)) === 'active@0');

// ---------------------------------------------------------------------------
console.log('\n--- offsets tile the aggregation list exactly ---');
// ---------------------------------------------------------------------------
// A gap loses URLs; an overlap puts one URL in two children. Both are silent.
for (const total of [1, 19_999, 20_000, 20_001, 20_481, 59_999]) {
  const layout = buildSitemapLayout(total);
  const covered = new Set<number>();
  let overlap = false;
  for (let id = 0; id < layout.aggregationChunks; id += 1) {
    const c = layout.classify(id);
    for (let i = c.skip; i < Math.min(c.skip + CHILD_SITEMAP_SIZE, total); i += 1) {
      if (covered.has(i)) overlap = true;
      covered.add(i);
    }
  }
  check(`${total} urls: every index covered exactly once`,
    covered.size === total && !overlap);
}

// ---------------------------------------------------------------------------
console.log('\n--- classifyChunkIn is defensive for out-of-range ids ---');
// ---------------------------------------------------------------------------
check('negative id falls back to the aggregation head',
  key(classifyChunkIn(-3, 2)) === 'aggregation@0');
check('an id past the published set still classifies (never throws)',
  classifyChunkIn(9_999, 2).kind === 'concluded');
check('aggregationChunks < 1 is clamped, not trusted',
  key(classifyChunkIn(1, 0)) === 'active@0');

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll sitemap-config layout tests passed.');
