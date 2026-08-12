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
import { buildAuctionSlug, type AuctionForSlug } from './auction-slug';
import { mapNotificationRow } from '../notifications/history';

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

/**
 * The surfaces converted in the second sweep, expressed exactly as they now
 * resolve their href. Every one of them used to hardcode
 * `/subastas/subasta/{slug}`; each now prefers a server-resolved path and
 * keeps the legacy expression ONLY as the fallback.
 */
const carouselCardHref = (detailPath: string | null | undefined, slug: string) =>
  detailPath ?? `/subastas/subasta/${slug}`;
const similarCardHref = carouselCardHref;
/** HomeCarouselSection's AuthGatePopup `next` for a gated card click. */
const gatePopupNextHref = carouselCardHref;
/** ParticiparButton's logged-out post-register destination. */
const participarDest = (
  detailPath: string | null | undefined,
  slug: string | null | undefined,
  pathname: string | null,
) => detailPath ?? (slug ? `/subastas/subasta/${slug}` : pathname || '/');

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

  // ── second sweep: the surfaces that used to hardcode /subastas/subasta/ ──
  const slug = buildAuctionSlug(ROW);
  check('carousel card link == canonical', carouselCardHref(detailPath, slug) === canonical);
  check('similar-auctions card link == canonical', similarCardHref(detailPath, slug) === canonical);
  check('auth-gate popup `next` == canonical', gatePopupNextHref(detailPath, slug) === canonical);
  check(
    'ParticiparButton logged-out dest == canonical (detailPath beats slug)',
    participarDest(detailPath, slug, '/somewhere-else') === canonical,
  );
  check(
    'notification history url == canonical',
    mapNotificationRow(
      {
        id: 'n1',
        auctionId: ROW.id,
        channel: 'email',
        sentAt: null,
        auctionType: ROW.auctionType,
        province: ROW.province,
        municipality: ROW.municipality,
      },
      MINTED_V3,
    ).url === canonical,
  );
  check(
    'every converted surface agrees with the SSR grid',
    new Set([
      ssrGridHref(detailPath, legacyAuctionPath(ROW)),
      hydratedCardHref(detailPath, ROW.id),
      carouselCardHref(detailPath, slug),
      gatePopupNextHref(detailPath, slug),
      participarDest(detailPath, slug, null),
    ]).size === 1,
  );
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

  // ── second sweep: unminted → legacy, and the fallbacks still 200 ─────────
  const slug = buildAuctionSlug(ROW);
  check('carousel card falls back to legacy', carouselCardHref(detailPath, slug) === legacy);
  check('similar-auctions card falls back to legacy', similarCardHref(detailPath, slug) === legacy);
  check('auth-gate popup `next` falls back to legacy', gatePopupNextHref(detailPath, slug) === legacy);
  check(
    'absent detailPath → carousel card still emits the legacy path',
    carouselCardHref(undefined, slug) === legacy,
  );
  check(
    'ParticiparButton without detailPath OR slug falls back to the pathname',
    participarDest(undefined, null, '/subastas/foo') === '/subastas/foo',
  );
  check(
    'ParticiparButton with neither path, slug, nor pathname never emits an empty href',
    participarDest(undefined, null, null) === '/',
  );
  check(
    'notification history url falls back to legacy when unminted',
    mapNotificationRow(
      {
        id: 'n1',
        auctionId: ROW.id,
        channel: 'email',
        sentAt: null,
        auctionType: ROW.auctionType,
        province: ROW.province,
        municipality: ROW.municipality,
      },
      null,
    ).url === legacy,
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
  const slug = buildAuctionSlug(ROW);
  check('carousel card legacy when switch off', carouselCardHref(detailPath, slug) === legacyAuctionPath(ROW));
  check('auth-gate popup `next` legacy when switch off', gatePopupNextHref(detailPath, slug) === legacyAuctionPath(ROW));
  check(
    'notification history legacy when switch off even with a minted url',
    mapNotificationRow(
      {
        id: 'n1',
        auctionId: ROW.id,
        channel: 'email',
        sentAt: null,
        auctionType: ROW.auctionType,
        province: ROW.province,
        municipality: ROW.municipality,
      },
      MINTED_V3,
    ).url === legacyAuctionPath(ROW),
  );
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

// ─────────────────────────────────────────────────────────────────────────
console.log('\n5. source guards — second sweep (carousels, registro, redirects)');

{
  // CLIENT surfaces: they cannot query the mint table, so the ONLY acceptable
  // shape is "server-provided path ?? legacy". Assert both halves — the
  // fallback alone would be the old bug, and no fallback would risk an empty
  // href on a payload that predates the projection.
  const carousel = read('components/observatory/ForexCarousel.tsx');
  check(
    'ForexCarousel resolves the card href from the server detailPath',
    /const detailHref = auction\.detailPath \?\? `\/subastas\/subasta\/\$\{detailSlug\}`/.test(carousel),
  );
  check('ForexCarousel anchors at the resolved href', /href=\{detailHref\}/.test(carousel));
  check(
    'ForexCarousel resolves the href EXACTLY once (Link and Participar share it)',
    (carousel.match(/const detailHref = /g) || []).length === 1,
  );
  check(
    'ForexCarousel hands the same resolved path to ParticiparButton',
    /detailPath=\{detailHref\}/.test(carousel),
  );
  check('ForexCarousel declares detailPath on FeedAuction', /detailPath\?: string \| null;/.test(carousel));

  const home = read('components/observatory/HomeCarouselSection.tsx');
  check(
    'HomeCarouselSection gate `next` prefers the server detailPath',
    /setNextHref\(auction\.detailPath \?\? `\/subastas\/subasta\/\$\{slug\}`\)/.test(home),
  );

  const similar = read('components/auction/SimilarAuctionsCarousel.tsx');
  check(
    'SimilarAuctionsCarousel resolves from the /api/auctions detailPath',
    /const detailHref = auction\.detailPath \?\? `\/subastas\/subasta\/\$\{slug\}`/.test(similar),
  );
  check('SimilarAuctionsCarousel anchors at the resolved href', /href=\{detailHref\}/.test(similar));
  check(
    'SimilarAuctionsCarousel declares detailPath on its row type',
    /detailPath\?: string \| null;/.test(similar),
  );

  const participar = read('components/auction/ParticiparButton.tsx');
  check(
    'ParticiparButton prefers detailPath over the legacy slug path',
    /const dest = detailPath \?\? \(slug \? `\/subastas\/subasta\/\$\{slug\}` : pathname \|\| "\/"\)/.test(participar),
  );
  check(
    'ParticiparButton re-derives dest when detailPath changes',
    /\[status, slug, detailPath, pathname, auctionId, router\]/.test(participar),
  );
}
{
  // The carousel feed is where the client surfaces get their path from.
  const mix = read('app/api/auctions/carousel-mix/route.ts');
  check('carousel-mix projects detailPath', /detailPath: string;/.test(mix));
  check(
    'carousel-mix resolves it through the resolver',
    /projectAuction\(a, resolveAuctionPath\(a, v3\.get\(a\.id\) \?\? null\)\)/.test(mix),
  );
  check(
    'carousel-mix uses the BATCH lookup (no N+1)',
    /fetchV3UrlsBatch\(merged\.map\(/.test(mix) && !/fetchV3Url\(/.test(mix),
  );
  check(
    'carousel-mix batches ONCE per response, not per card',
    (mix.match(/fetchV3UrlsBatch\(/g) || []).length === 1,
  );
  check(
    'carousel-mix detailPath lookup is non-fatal',
    /try \{[\s\S]{0,200}fetchV3UrlsBatch[\s\S]{0,300}catch/.test(mix),
  );
}
{
  // Registro list — server-rendered rows AND the JSON endpoint feeding them.
  for (const f of ['lib/registro/registro-read.ts', 'app/api/registro/list/route.ts']) {
    const src = read(f);
    check(
      `${f} no longer hardcodes the legacy detailPath`,
      !/detailPath: `\/subastas\/subasta\/\$\{slug\}`/.test(src),
    );
    check(
      `${f} resolves detailPath through the resolver`,
      /detailPath: resolveAuctionPath\(forSlug, v3\.get\(r\.id\) \?\? null\)/.test(src),
    );
    check(
      `${f} uses the BATCH lookup (no N+1)`,
      /fetchV3UrlsBatch\(rows\.map\(\(r\) => r\.id\)\)/.test(src) && !/fetchV3Url\(/.test(src),
    );
    check(
      `${f} batches AFTER the page slice, once per response`,
      (src.match(/fetchV3UrlsBatch\(/g) || []).length === 1,
    );
  }
}
{
  // Notification history: the mapper stays PURE (no DB import) — the route
  // owns the single batched probe. A `fetchV3Url` here would be an N+1.
  const hist = read('lib/notifications/history.ts');
  check('history mapper resolves the url', /url: resolveAuctionPath\(forSlug, v3Url \?\? null\)/.test(hist));
  // Call form, not the bare name — the doc comment legitimately NAMES the
  // batch helper to say who is expected to call it.
  check('history mapper stays pure (no DB fetch)', !/fetchV3Urls?(Batch)?\(/.test(hist));
  const notifRoute = read('app/api/user/notifications/route.ts');
  check(
    'notifications route batches the v3 lookup',
    /fetchV3UrlsBatch\(rows\.map\(\(r\) => r\.auctionId\)\)/.test(notifRoute) &&
      !/fetchV3Url\(/.test(notifRoute),
  );
  check(
    'notifications route passes the batched url per row',
    /mapNotificationRow\(r, v3\.get\(r\.auctionId\) \?\? null\)/.test(notifRoute),
  );
}
{
  // Server REDIRECT targets — one auction each, so the single-row primary-key
  // probe is correct here and the batch helper would be wrong.
  const follow = read('app/api/follow/confirm/route.ts');
  check(
    'follow/confirm no longer hardcodes any legacy redirect target',
    !/`\/subastas\/subasta\/\$\{buildAuctionSlug\(row\)\}/.test(follow),
  );
  check(
    'follow/confirm resolves through the resolver',
    /return `\$\{resolveAuctionPath\(row, v3Url\)\}\?follow=\$\{flag\}`/.test(follow),
  );
  check(
    'follow/confirm routes ALL FOUR outcomes through the one helper',
    (follow.match(/detailPathWithFlag\(row, /g) || []).length === 4,
  );
  check(
    'follow/confirm probe failure degrades to legacy rather than 500ing',
    /fetchV3Url\(row\.id\)\.catch\(\(\) => null\)/.test(follow),
  );

  const part = read('app/api/participar/[id]/route.ts');
  check(
    'participar no longer hardcodes the legacy detailPath',
    !/`\/subastas\/subasta\/\$\{buildAuctionSlug\(/.test(part),
  );
  check(
    'participar resolves detailPath through the resolver',
    /const detailPath = resolveAuctionPath\(/.test(part),
  );
  check(
    'participar probe failure degrades to legacy rather than 500ing',
    /fetchV3Url\(row\.id\)\.catch\(\(\) => null\)/.test(part),
  );
}
{
  // Belt-and-suspenders: no converted surface may still contain a bare
  // hardcoded legacy detail link. Only the documented `?? legacy` FALLBACK
  // expressions are allowed, and each is asserted individually above.
  for (const f of [
    'lib/registro/registro-read.ts',
    'app/api/registro/list/route.ts',
    'lib/notifications/history.ts',
    'app/api/follow/confirm/route.ts',
    'app/api/participar/[id]/route.ts',
  ]) {
    check(
      `${f} contains no /subastas/subasta/ link construction at all`,
      !/`\/subastas\/subasta\//.test(read(f)),
    );
  }
}

console.log(
  failures === 0
    ? '\nAll list-link v3 parity tests passed.'
    : `\n${failures} list-link v3 test(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
