/**
 * URL-v3 SITEMAP — GENERATE, DO NOT PUBLISH.
 *
 * ⭐ Ken's ruling (2026-08-04): *"Sitemap generation to the new URLs — built but
 * NOT published. Generation and publication are separate acts; publication is
 * the crawl event and it belongs to the switch dispatch."*
 *
 * This script is that separation, made physical. It writes `<urlset>` files to
 * a LOCAL DIRECTORY. It does not touch a served route, it is not imported by
 * anything under `src/app`, and running it cannot cause a single crawl. The
 * served sitemap (`/sitemap.xml` + `/sitemap/{id}.xml`) keeps emitting legacy
 * urls until `URL_V3_SWITCH=1`, at which point it starts emitting these same
 * urls from the same resolver — so what you inspect here is what will ship,
 * not a parallel construction that could disagree with it.
 *
 * Why generate at all before publishing: so the switch dispatch flips a switch
 * on a sitemap that has already been read by a human, rather than discovering
 * the shape of 192,589 urls at the moment Google does.
 *
 * Run (needs DATABASE_URL):
 *   npx tsx scripts/url-v3-sitemap-generate.ts
 *   npx tsx scripts/url-v3-sitemap-generate.ts --out ./tmp/sitemap-v3
 *
 * Exit codes: 0 all children written and every url accounted for; 1 otherwise.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildSitemapLayout } from '../src/lib/seo/sitemap-config';
import { buildAggregationEntries, buildSitemapEntries } from '../src/lib/seo/sitemap-entries';
import { URL_V3_SWITCH_ENV } from '../src/lib/seo/url-v3-switch';

const SITE = 'https://subastasactivas.com';

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderUrlset(entries: Awaited<ReturnType<typeof buildSitemapEntries>>): string {
  const body = entries
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(e.url)}</loc>`];
      if (e.lastModified) {
        const d = e.lastModified instanceof Date ? e.lastModified : new Date(e.lastModified);
        if (!Number.isNaN(d.getTime())) parts.push(`    <lastmod>${d.toISOString()}</lastmod>`);
      }
      if (e.changeFrequency) parts.push(`    <changefreq>${e.changeFrequency}</changefreq>`);
      if (e.priority != null) parts.push(`    <priority>${e.priority}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function main(): Promise<number> {
  const outArg = process.argv.indexOf('--out');
  const outDir = resolve(outArg > -1 ? process.argv[outArg + 1] : 'tmp/sitemap-v3');

  // ⭐ Force the switch ON for THIS PROCESS ONLY.
  //
  // The whole point is to see the v3 sitemap without turning the switch on for
  // anything that serves traffic. `process.env` is per-process, so this cannot
  // leak into the running app — and it means the file below is produced by the
  // exact same code path the switch will later enable, rather than by a second
  // url builder written just for this script.
  process.env[URL_V3_SWITCH_ENV] = '1';

  mkdirSync(outDir, { recursive: true });
  console.log(`URL-v3 sitemap GENERATION (not publication) -> ${outDir}`);

  let total = 0;
  let v3Count = 0;
  let legacyCount = 0;

  // The aggregation band's width is derived from its own URL count (v4 P3), so
  // the layout has to be resolved before the children can be enumerated.
  const aggregation = await buildAggregationEntries();
  const layout = buildSitemapLayout(aggregation.length);

  for (let id = 0; id < layout.totalChildren; id += 1) {
    const chunk = layout.classify(id);
    const entries =
      chunk.kind === 'aggregation'
        // ⭐ `layout.sliceAggregation`, NOT an open-coded slice. Dark serves the
        // WHOLE band as one child (pinned to wave192); lit serves 20k windows.
        // This generator writing a lit-shaped slice while the app serves a
        // dark-shaped one is exactly the drift that put a 6-child index on a
        // dark prod build and got the release rolled back.
        ? layout.sliceAggregation(aggregation, id)
        : await buildSitemapEntries(id, layout.aggregationChunks);
    writeFileSync(join(outDir, `${id}.xml`), renderUrlset(entries), 'utf8');
    for (const e of entries) {
      const path = e.url.startsWith(SITE) ? e.url.slice(SITE.length) : e.url;
      if (path.startsWith('/subastas/subasta/')) legacyCount += 1;
      else if (/^\/subastas\/[^/]+\/[^/]+\/[^/]+$/.test(path)) v3Count += 1;
    }
    total += entries.length;
    console.log(`  child ${id}: ${entries.length} urls`);
  }

  // The index, written for completeness so the generated set is inspectable as
  // a whole. Still a file. Still not served.
  const index =
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    layout.urls(SITE).map((u: string) => `  <sitemap><loc>${xmlEscape(u)}</loc></sitemap>`).join('\n') +
    `\n</sitemapindex>\n`;
  writeFileSync(join(outDir, 'index.xml'), index, 'utf8');

  console.log(`\ntotal urls        : ${total}`);
  console.log(`v3 detail urls    : ${v3Count}`);
  console.log(`legacy detail urls: ${legacyCount}  (hex-legacy / held / degraded / quarantined — expected, not a defect)`);
  console.log(`\nGENERATED ONLY. Nothing was published; /sitemap.xml still serves legacy urls`);
  console.log(`until ${URL_V3_SWITCH_ENV}=1 is set on a running app. That flip is the switch dispatch.`);

  if (total === 0) {
    console.error('FAIL: generated an empty sitemap');
    return 1;
  }
  if (v3Count === 0) {
    console.error('FAIL: no v3 urls generated — the resolver is not reading auction_url_v3');
    return 1;
  }
  return 0;
}

// `tsx` compiles a .ts file as CJS, so there is no top-level await here.
main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
