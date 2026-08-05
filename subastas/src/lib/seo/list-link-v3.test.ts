/**
 * Internal-link parity tests: a LIST card must link at the same URL the DETAIL
 * page canonicalises to.
 *
 * Run with: npx tsx src/lib/seo/list-link-v3.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────
 *
 * Ken's post-flip audit (2026-08-05): with URL_V3_SWITCH=1 the Bizkaia Activas
 * list emitted legacy `/subastas/subasta/<hex>` links on 15/15 cards, while the
 * detail pages those links landed on canonicalised to v3 (Ghost verified
 * canonical == reached). Internal links pointing at legacy URLs dilute the
 * migration exactly while Google is re-crawling.
 *
 * There were never two link BUILDERS — `resolveAuctionPath` was already shared
 * and correct. The defect was that the two LIST surfaces never called it:
 *   - the SSR crawlable grid hardcoded `/subastas/subasta/${buildAuctionSlug(a)}`
 *   - the hydrated cards hardcoded `/auction/${id}` (a 301 to that same legacy
 *     path), and could not do better because `/api/auctions` projected no path
 *     at all and the mint table is not reachable from a client component.
 *
 * THE INVARIANT: for a MINTED auction, list link == detail canonical, on BOTH
 * the SSR and the hydrated surface. For an UNMINTED / held row, both fall back
 * to the legacy path — explicitly, because that path still 200s.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveAuctionPath, legacyAuctionPath } from './auction-url';
import { URL_V3_SWITCH_ENV } from './url-v3-switch';
import type { AuctionForSlug } from './auction-slug';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

// A Bizkaia row of the shape the sweep found.
const ROW = {
  id: 'd36bac68-8533-419c-9d0e-32080adbcf8f',
  title: 'VIVIENDA EN CALLE ZUMALACARREGUI Nº 5, 1º IZQUIERDA BARACALDO CP 48903 VIZCAYA',
  category: 'Viviendas',
  province: 'Bizkaia',
  municipality: 'Barakaldo',
  boeId: 'SUB-JA-2026-263754',
} as unknown as AuctionForSlug;

const MINTED_V3 = '/subastas/bizkaia/barakaldo/vivienda-calle-zumalacarregui-5-1-izquierda-sub-ja-2026-263754';

/**
 * The two list surfaces, expressed exactly as they now resolve their href.
 * Both take the SAME `detailPath` the server resolved, so parity is structural
 * — but we assert the fallback expressions too, because those are what run when
 * the field is absent and they are where the old hardcoded paths lived.
 */
const ssrGridHref = (detailPath: string | null | undefined, legacy: string) =>
  detailPath ?? legacy;
const hydratedCardHref = (
  detailPath: string | null | undefined,
  id: string,
) => detailPath ?? `/auction/${encodeURIComponent(id)}`;

// ─────────────────────────────────────────────────────────────────────────
console.log('\n1. switch ON + minted row → list link == detail canonical');
process.env[URL_V3_SWITCH_ENV] = '1';
{
  // What the DETAIL route computes for its canonical.
  const canonical = resolveAuctionPath(ROW, MINTED_V3);
  check('detail canonical is the minted v3 url', canonical === MINTED_V3);

  // What the server now hands both list surfaces.
  const detailPath = resolveAuctionPath(ROW, MINTED_V3);

  check('SSR grid link == canonical', ssrGridHref(detailPath, legacyAuctionPath(ROW)) === canonical);
  check('hydrated card link == canonical', hydratedCardHref(detailPath, ROW.id) === canonical);
  check(
    'both list surfaces agree with each other',
    ssrGridHref(detailPath, legacyAuctionPath(ROW)) === hydratedCardHref(detailPath, ROW.id),
  );
  check('the link is NOT the legacy path', detailPath !== legacyAuctionPath(ROW));
  check('the link is NOT the /auction/<id> route', !detailPath.startsWith('/auction/'));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n2. switch ON + UNMINTED/held row → explicit legacy fallback');
{
  const detailPath = resolveAuctionPath(ROW, null);
  const legacy = legacyAuctionPath(ROW);
  check('unminted resolves to the legacy path', detailPath === legacy);
  check('legacy path is the /subastas/subasta/ route', legacy.startsWith('/subastas/subasta/'));
  check('SSR grid falls back to legacy', ssrGridHref(detailPath, legacy) === legacy);
  check('hydrated card falls back to legacy', hydratedCardHref(detailPath, ROW.id) === legacy);
  check(
    'detail canonical for the same unminted row is ALSO legacy (still parity)',
    resolveAuctionPath(ROW, null) === legacy,
  );
  // …and if the field never arrives at all, the card must still produce a
  // path that 200s rather than an empty href.
  check(
    'absent detailPath → SSR grid still emits the legacy path',
    ssrGridHref(undefined, legacy) === legacy,
  );
  check(
    'absent detailPath → hydrated card still emits the /auction/<id> 301 source',
    hydratedCardHref(undefined, ROW.id) === `/auction/${encodeURIComponent(ROW.id)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n3. switch OFF → everything legacy, no v3 leaks pre-flip');
delete process.env[URL_V3_SWITCH_ENV];
{
  const detailPath = resolveAuctionPath(ROW, MINTED_V3);
  check('switch off ignores even a minted url', detailPath === legacyAuctionPath(ROW));
  check('SSR grid legacy when switch off', ssrGridHref(detailPath, legacyAuctionPath(ROW)) === legacyAuctionPath(ROW));
  check('hydrated card legacy when switch off', hydratedCardHref(detailPath, ROW.id) === legacyAuctionPath(ROW));
}
process.env[URL_V3_SWITCH_ENV] = '1';

// ─────────────────────────────────────────────────────────────────────────
console.log('\n4. source guards — no hardcoded legacy links, ONE batched probe');

const SRC = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

{
  const grid = read('components/seo/SeoAuctionGrid.tsx');
  check(
    'SSR grid no longer hardcodes the anchor href',
    !/<Link href=\{`\/subastas\/subasta\/\$\{slug\}`\}/.test(grid),
  );
  check('SSR grid anchors at the resolved href', /<Link href=\{href\}/.test(grid));
  check('SSR grid reads detailPath', /a\.detailPath \?\?/.test(grid));
  check(
    'SSR grid ItemList JSON-LD uses the SAME resolved path as the anchor',
    /itemListElement[\s\S]{0,400}a\.detailPath \?\?/.test(grid),
  );
}
{
  for (const f of [
    'components/observatory/AuctionResultRow.tsx',
    'components/observatory/AuctionListCard.tsx',
  ]) {
    const src = read(f);
    check(
      `${f} no longer hardcodes /auction/<id> in an href`,
      !/href=\{`\/auction\/\$\{encodeURIComponent\(item\.id\)\}`\}/.test(src),
    );
    check(`${f} links at the resolved detailHref`, /href=\{detailHref\}/.test(src));
    check(
      `${f} falls back to the legacy id route`,
      /const detailHref = item\.detailPath \?\? `\/auction\/\$\{encodeURIComponent\(item\.id\)\}`/.test(src),
    );
  }
}
{
  const route = read('app/api/auctions/route.ts');
  check('API projects detailPath', /masked\[i\]\.detailPath = resolveAuctionPath\(/.test(route));
  check(
    'API uses the BATCH lookup (no N+1)',
    /fetchV3UrlsBatch\(dbRows\.map\(/.test(route) && !/fetchV3Url\(/.test(route),
  );
  check(
    'API detailPath lookup is non-fatal',
    /try \{[\s\S]{0,200}fetchV3UrlsBatch[\s\S]{0,300}catch/.test(route),
  );
  check(
    'enrichment runs once per response, not per row',
    (route.match(/await enrichWithDetailPath\(/g) || []).length === 1,
  );
}
{
  const pd = read('lib/seo/page-data.ts');
  check('page-data resolves detailPath', /detailPath: resolveAuctionPath\(r, v3\.get\(r\.id\) \?\? null\)/.test(pd));
  check(
    'page-data batches AFTER the slice (probe is page-sized, not province-sized)',
    /const slice = sorted\.slice\([\s\S]{0,900}fetchV3UrlsBatch\(slice\.map\(/.test(pd),
  );
  check('page-data uses the batch helper only', !/fetchV3Url\(/.test(pd));
}
{
  // ADDITIVE contract: nothing was removed to make room for detailPath.
  const types = read('types/index.ts');
  check('AuctionItem.detailPath is optional (additive)', /detailPath\?: string \| null;/.test(types));
  check('AuctionItem.endDate still present', /endDate: Date \| null;/.test(types));
  check('AuctionItem.id still present', /\n {2}id: string;/.test(types));
}

console.log(
  failures === 0
    ? '\nAll list-link v3 parity tests passed.'
    : `\n${failures} list-link v3 test(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
