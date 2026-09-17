/**
 * ONE robots decision for an auction detail page, whichever route serves it.
 *
 * Run with: npx tsx src/lib/seo/detail-robots-single-path.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * ─── WHY THIS FILE EXISTS (the "v3-route inconsistency", 2026-09-17) ─────
 *
 * A live sample of five pre-2022 concluded pages found ONE serving
 * `index,follow` (SUB-AT-2018-18R0786001011, Felanitx) while its four siblings
 * served `noindex,follow`. The working hypothesis was a SECOND robots decision
 * path — the v3 archive route computing its own metadata.
 *
 * ⭐ ROOT CAUSE: there is no second path, and the sample was not a sample of
 * one thing. Both routes — `/subastas/subasta/[slug]` (legacy) and
 * `/subastas/[slug]/[municipio]/[detalle]` (v3) — resolve an id, call
 * `loadAuctionMeta`, and hand the row to `buildDetailMetadata`, which owns the
 * single `robots:` line. The five pages differed in their DATA, under content
 * bar v1's 40-word prose gate (measured on prod):
 *
 *     SUB-AT-2018-18R0786001011  Felanitx    56 words  -> index,follow
 *     SUB-JA-2015-1016           Zaragoza    18 words  -> noindex,follow
 *     SUB-JA-2015-1086           (no muni)   19 words  -> noindex,follow
 *     SUB-AT-2019-19R0886001257  Barcelona    1 word   -> noindex,follow
 *     SUB-AT-2021-19R4786001395  Valencia     1 word   -> noindex,follow
 *
 * Four of the five were ALSO served over the v3 route, so "v3 = indexable" never
 * held. The inconsistency was v1's word count, which content bar v2 removes —
 * all five now clear the bar. What made it look route-shaped is that the
 * recency floor was assumed ON (it is `SEO_CONCLUDED_MAX_AGE_MONTHS=0` on prod),
 * under which EVERY pre-2022 row should have been noindex and one index,follow
 * looked impossible.
 *
 * So the fix is not a code change but a GUARD: keep it structurally impossible
 * for a route to grow its own robots decision. The route-level curl gate
 * (`scripts/seo/route-robots-check.mjs`) proves the same thing at runtime by
 * fetching that boeId over BOTH routes and asserting the values match.
 */
import { readFileSync } from 'node:fs';

let failures = 0;
function check(label: string, cond: boolean) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

const ROUTES = [
  'src/app/subastas/subasta/[slug]/page.tsx',
  'src/app/subastas/[slug]/[municipio]/[detalle]/page.tsx',
];

/**
 * Strip block comments, line comments and template/quoted strings before
 * grepping. Without this the assertions match the PROSE that describes the
 * invariant — a proof that passes by reading its own documentation.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

for (const rel of ROUTES) {
  const src = code(readFileSync(rel, 'utf8'));
  check(`${rel} delegates metadata to buildDetailMetadata`, /buildDetailMetadata\s*\(/.test(src));
  check(`${rel} delegates the 404/soft-hide gate to detailBlockReason`, /detailBlockReason\s*\(/.test(src));
  check(
    `${rel} never decides indexability itself`,
    !/isConcludedIndexable|hasConcludedContent|concludedIndexableWhere/.test(src),
  );
  // The only `robots:` literals a route may carry are the three BLOCKED cases
  // (missing / out-of-scope / retired), which are 404-shaped, not index gates.
  const robotsLines = (readFileSync(rel, 'utf8').match(/robots:/g) ?? []).length;
  check(`${rel} carries exactly 3 robots literals (the blocked cases)`, robotsLines === 3);
}

// Positive control: the grep above must be capable of failing. If `code()` ever
// strips too much, this assertion goes red instead of everything passing.
check(
  'the comment/string stripper leaves real code behind',
  /buildDetailMetadata/.test(code('/* buildDetailMetadata in a comment */ const x = buildDetailMetadata;')) &&
    !/ONLY_IN_A_COMMENT/.test(code('/* ONLY_IN_A_COMMENT */ const y = 1;')),
);

const view = code(readFileSync('src/lib/auction-detail-view.tsx', 'utf8'));
check(
  'auction-detail-view holds exactly ONE robots decision',
  (view.match(/robots:/g) ?? []).length === 1 && /isConcludedIndexable\s*\(/.test(view),
);

console.log(failures === 0 ? '\ndetail robots single path: all checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
