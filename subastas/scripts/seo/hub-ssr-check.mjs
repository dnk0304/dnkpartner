/**
 * scripts/seo/hub-ssr-check.mjs — does a town hub server-render its listings?
 *
 * WHY: a hub whose auction list only appears after hydration gives Googlebot no
 * internal crawl path to its detail pages, and a hub that server-renders a "0
 * subastas" counter tells Googlebot the page is empty. Both are invisible in a
 * browser and both are plain in `curl`. This asserts, with no JS:
 *
 *   1. HTTP 200
 *   2. >= 1 crawlable auction-detail <a href> in the raw HTML
 *   3. the <title> count and the body do not CONTRADICT each other, i.e. a hub
 *      whose title claims N>0 auctions must not also ship the literal
 *      "0 subastas" counter text
 *
 * Check 3 is the one that regressed: checks 1 and 2 passed live on 2026-09-17
 * while 3 failed on every hub.
 *
 * Usage: node scripts/seo/hub-ssr-check.mjs [--base https://subastasactivas.com]
 * Exit 0 = all hubs pass; exit 1 = at least one failed (CI-usable).
 */

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = argOf('--base', 'https://subastasactivas.com').replace(/\/$/, '');

/** Five hubs known to carry active inventory (live counts, 2026-09-17). */
const HUBS = [
  '/subastas/teruel/calamocha',
  '/subastas/valencia/rafelbunyol',
  '/subastas/madrid/madrid',
  '/subastas/barcelona/barcelona',
  '/subastas/girona/llagostera',
];

/**
 * A crawlable auction-detail link: /subastas/<province>/<town>/<slug>. Three
 * path segments after /subastas is what distinguishes a DETAIL url from the hub
 * itself and from a province hub.
 */
const RE_DETAIL_HREF = /href="(\/subastas\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+)"/g;
const RE_TITLE_COUNT = /<title>\s*([\d.,]+)\s+subastas/i;

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`    ok   ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    failures++;
    console.error(`    FAIL ${label}${detail ? ` (${detail})` : ''}`);
  }
}

for (const path of HUBS) {
  const url = `${BASE}${path}`;
  console.log(`\n${url}`);
  let res, html;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; forge-hub-ssr-check/1.0)' },
    });
    html = await res.text();
  } catch (e) {
    failures++;
    console.error(`    FAIL fetch: ${e?.message ?? e}`);
    continue;
  }

  check('HTTP 200', res.status === 200, String(res.status));

  const hrefs = new Set();
  for (const m of html.matchAll(RE_DETAIL_HREF)) hrefs.add(m[1]);
  check('>=1 server-rendered auction-detail anchor', hrefs.size >= 1, `${hrefs.size} unique`);

  // Title count vs the "0 subastas" counter text. Spanish thousands separators
  // are dots, so strip both separators before parsing.
  const titleCount = Number((html.match(RE_TITLE_COUNT)?.[1] ?? '').replace(/[.,]/g, ''));
  const hasZeroCounter = /0 subastas \(activas/.test(html);
  if (Number.isFinite(titleCount) && titleCount > 0) {
    check(
      'no contradictory "0 subastas" counter in the body',
      !hasZeroCounter,
      `title says ${titleCount}`,
    );
  } else {
    console.log(`    skip title/body count cross-check (title count unreadable)`);
  }
}

console.log(
  failures > 0
    ? `\nhub-ssr-check: ${failures} assertion(s) FAILED`
    : `\nhub-ssr-check: all hubs pass`,
);
process.exit(failures > 0 ? 1 : 0);
