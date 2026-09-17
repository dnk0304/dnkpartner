#!/usr/bin/env node
/**
 * route-robots-check.mjs — the ROUTE-LEVEL gate: does the running app actually
 * serve the robots value the predicate says it should?
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────
 *
 * The town-<lastmod> wave (2026-09-17) shipped tsc-green, unit-green and
 * build-green code that threw a 500 on the real /sitemap/0.xml route, because a
 * Date round-tripped through unstable_cache's JSON arrives as a string that
 * TypeScript still types as a Date. Nothing short of fetching the route could
 * have caught it. Since then the standing rule is: build against a real
 * Postgres and curl the routes.
 *
 * Checks:
 *   1. /sitemap.xml and /sitemap/0.xml return 200 and parse as XML.
 *   2. every case in the case file returns 200 (following redirects) and
 *      carries EXACTLY the expected `<meta name="robots">` content.
 *   3. `sitemap ⊆ indexable` at RUNTIME: a sample of concluded detail URLs
 *      taken from the sitemap children must every one render index,follow.
 *      A sitemapped URL that renders noindex is the GSC error the whole
 *      predicate exists to prevent, and this is the only place it is observed
 *      rather than argued.
 *
 *   node scripts/seo/route-robots-check.mjs --base http://127.0.0.1:3117 \
 *        --cases .seo-gate-cases.json [--sitemap-sample 25]
 */
import { readFileSync } from 'node:fs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  // `--flag --next` must not silently swallow the next flag and look deliberate.
  if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
  return v;
}

const BASE = arg('base', 'http://127.0.0.1:3005').replace(/\/$/, '');
const CASES = arg('cases', '.seo-gate-cases.json');
const SAMPLE = Number(arg('sitemap-sample', '25'));

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** The robots meta as the crawler reads it. Scans the WHOLE body: Next streams,
 *  so head-slicing can miss a tag that is flushed after </head>. */
function robotsOf(html) {
  const m = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i);
  if (!m) return null;
  const c = m[0].match(/content=["']([^"']+)["']/i);
  return c ? c[1].trim() : null;
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'follow' });
  return { status: res.status, url: res.url, body: await res.text() };
}

async function main() {
  console.log(`route-robots-check against ${BASE}\n`);

  // 1. Sitemaps serve.
  for (const p of ['/sitemap.xml', '/sitemap/0.xml']) {
    const r = await get(p);
    check(`${p} → 200`, r.status === 200, `got ${r.status}`);
    check(`${p} is XML`, /^\s*<\?xml|<(urlset|sitemapindex)/i.test(r.body), r.body.slice(0, 80));
  }

  // 2. The per-row expectations.
  const cases = JSON.parse(readFileSync(CASES, 'utf8'));
  const byBoeId = new Map();
  for (const c of cases) {
    const r = await get(c.path);
    const robots = robotsOf(r.body);
    check(`${c.boeId} ${c.path} → 200`, r.status === 200, `got ${r.status}`);
    check(`${c.boeId} robots=${c.expect} (${c.note})`, robots === c.expect, `got ${robots ?? '<none>'}`);
    const seen = byBoeId.get(c.boeId) ?? [];
    seen.push({ path: c.path, robots });
    byBoeId.set(c.boeId, seen);
  }

  // 2b. Same row, both routes, same answer — the "v3-route inconsistency" guard
  //     observed at runtime rather than asserted from the source.
  for (const [boeId, seen] of byBoeId) {
    if (seen.length < 2) continue;
    const distinct = new Set(seen.map((s) => s.robots));
    check(
      `${boeId} serves the SAME robots over all ${seen.length} routes`,
      distinct.size === 1,
      seen.map((s) => `${s.path}=${s.robots}`).join(' | '),
    );
  }

  // 3. sitemap ⊆ indexable, sampled at runtime.
  const index = await get('/sitemap.xml');
  const children = [...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const detail = [];
  for (const child of children) {
    // The index's <loc>s are ABSOLUTE and point at the PROD host. Following them
    // verbatim while pointed at a local server silently audits production.
    const localPath = new URL(child).pathname;
    const c = await get(localPath);
    for (const [, loc] of c.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const p = new URL(loc).pathname;
      // Auction detail URLs only — hubs have their own indexability tier.
      if (/^\/subastas\/subasta\//.test(p) || p.split('/').length === 5) detail.push(p);
    }
    if (detail.length >= SAMPLE) break;
  }
  const sample = detail.slice(0, SAMPLE);
  check('the sitemap yielded detail URLs to sample', sample.length > 0, `found ${detail.length}`);
  let bad = 0;
  for (const p of sample) {
    const r = await get(p);
    if (robotsOf(r.body) !== 'index,follow') {
      bad++;
      console.error(`       sitemapped but not index,follow: ${p} → ${robotsOf(r.body)}`);
    }
  }
  check(`sitemap ⊆ indexable over ${sample.length} sampled URLs`, bad === 0, `${bad} violations`);

  console.log(failures === 0 ? '\nroute-robots-check: all checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
