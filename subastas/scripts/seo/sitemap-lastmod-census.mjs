#!/usr/bin/env node
/**
 * sitemap-lastmod-census.mjs — how many sitemap URLs actually carry a <lastmod>?
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────
 *
 * A missing <lastmod> is VALID XML. The sitemap still parses, GSC still accepts
 * it, nothing anywhere goes red — and Google gets no freshness signal for the
 * page. That is how a town-hub lastmod bug survived two waves: it has no
 * failure mode you can trip over, only a number nobody was counting.
 *
 * This is the counter. Ken's ad-hoc parse on live wave215 (2026-09-17 15:40) is
 * the reference this must reproduce:
 *
 *     sitemap/0.xml   towns 5595   with lastmod 617
 *
 * ─── USAGE ───────────────────────────────────────────────────────────────
 *
 *   node scripts/seo/sitemap-lastmod-census.mjs
 *   node scripts/seo/sitemap-lastmod-census.mjs --base http://127.0.0.1:3005
 *   node scripts/seo/sitemap-lastmod-census.mjs --only 0 --gsc <path/to/gsc-towns.txt>
 *
 *   --base <url>   origin to read the sitemap index from (default: prod)
 *   --only <ids>   comma-separated child ids (default: every child in the index)
 *   --gsc <file>   newline-separated `province/town` slugs; adds the coverage
 *                  report that the GSC recrawl is actually judged on
 *   --json         machine-readable output
 *
 * ⚠️ The index's <loc>s are ABSOLUTE and point at the PROD host. Following them
 * verbatim while pointed at a local server silently audits production instead
 * (a green run that proves nothing). Every child URL is therefore re-hosted
 * onto --base before it is fetched. Same class of trap as the SSR head-slicing
 * one in robots-sample.mjs.
 */

const DEFAULT_BASE = 'https://subastasactivas.com';
const TOWN_RE = /^\/subastas\/([a-z0-9-]+)\/([a-z0-9-]+)$/;

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  // Guard the `--flag --nextflag` spelling: a missing value must not silently
  // swallow the next flag and look like a deliberate choice.
  if (v === undefined || v.startsWith('--')) {
    console.error(`census: --${name} requires a value`);
    process.exit(2);
  }
  return v;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const BASE = (arg('base', DEFAULT_BASE)).replace(/\/+$/, '');
const AS_JSON = hasFlag('json');

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'dnksubastas-lastmod-census' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/** Re-host an absolute <loc> from the index onto --base. See the warning above. */
function rehost(loc) {
  try {
    const u = new URL(loc);
    return `${BASE}${u.pathname}${u.search}`;
  } catch {
    return `${BASE}${loc.startsWith('/') ? '' : '/'}${loc}`;
  }
}

/** Every <url> block with its <loc> and whether it carries a non-empty <lastmod>. */
function parseUrlset(xml) {
  const out = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const block = m[1];
    const loc = /<loc>([\s\S]*?)<\/loc>/.exec(block)?.[1]?.trim() ?? '';
    const lastmod = /<lastmod>([\s\S]*?)<\/lastmod>/.exec(block)?.[1]?.trim() ?? '';
    out.push({ loc, lastmod });
  }
  return out;
}

function pathOf(loc) {
  try {
    return new URL(loc).pathname;
  } catch {
    return loc;
  }
}

/**
 * A town hub is `/subastas/<province>/<town>` — exactly two segments. Province
 * hubs (one segment), `/subastas/tipo/...`, paginated `/pagina/N` and detail
 * URLs are all excluded by the shape, not by a blocklist.
 */
const RESERVED_FIRST_SEGMENT = new Set(['tipo', 'categoria', 'subasta', 'pagina']);
function townSlugOf(loc) {
  const m = TOWN_RE.exec(pathOf(loc));
  if (!m) return null;
  if (RESERVED_FIRST_SEGMENT.has(m[1])) return null;
  return `${m[1]}/${m[2]}`;
}

async function main() {
  const indexXml = await fetchText(`${BASE}/sitemap.xml`);
  const childLocs = [...indexXml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => m[1].trim());
  if (childLocs.length === 0) {
    console.error(`census: ${BASE}/sitemap.xml advertised no children — is it a <urlset>?`);
    process.exit(1);
  }

  const onlyRaw = arg('only', null);
  const only = onlyRaw === null ? null : new Set(onlyRaw.split(',').map((s) => s.trim()));
  const idOf = (loc) => /sitemap\/([^/]+?)\.xml/.exec(pathOf(loc))?.[1] ?? pathOf(loc);

  const targets = childLocs.filter((l) => only === null || only.has(idOf(l)));
  if (targets.length === 0) {
    console.error(`census: --only ${onlyRaw} matched none of ${childLocs.length} children`);
    process.exit(1);
  }

  const gscFile = arg('gsc', null);
  let gscTowns = null;
  if (gscFile) {
    const { readFileSync } = await import('node:fs');
    gscTowns = new Set(
      readFileSync(gscFile, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim().replace(/^\/+|\/+$/g, ''))
        .filter(Boolean),
    );
  }

  const files = [];
  const townsSeen = new Map(); // slug -> hasLastmod
  for (const loc of targets) {
    const id = idOf(loc);
    let urls;
    try {
      urls = parseUrlset(await fetchText(rehost(loc)));
    } catch (e) {
      console.error(`census: sitemap/${id}.xml FAILED — ${e.message}`);
      process.exitCode = 1;
      continue;
    }
    let towns = 0;
    let townsWithLastmod = 0;
    let withLastmod = 0;
    for (const u of urls) {
      if (u.lastmod) withLastmod++;
      const slug = townSlugOf(u.loc);
      if (!slug) continue;
      towns++;
      if (u.lastmod) townsWithLastmod++;
      if (!townsSeen.get(slug)) townsSeen.set(slug, Boolean(u.lastmod));
    }
    files.push({ id, urls: urls.length, withLastmod, towns, townsWithLastmod });
  }

  const totals = files.reduce(
    (a, f) => ({
      urls: a.urls + f.urls,
      withLastmod: a.withLastmod + f.withLastmod,
      towns: a.towns + f.towns,
      townsWithLastmod: a.townsWithLastmod + f.townsWithLastmod,
    }),
    { urls: 0, withLastmod: 0, towns: 0, townsWithLastmod: 0 },
  );

  let gsc = null;
  if (gscTowns) {
    let present = 0;
    let dated = 0;
    const absent = [];
    const undated = [];
    for (const t of gscTowns) {
      if (!townsSeen.has(t)) {
        absent.push(t);
        continue;
      }
      present++;
      if (townsSeen.get(t)) dated++;
      else undated.push(t);
    }
    gsc = { total: gscTowns.size, present, dated, undated: undated.length, absent: absent.length, undatedSample: undated.slice(0, 20), absentSample: absent.slice(0, 20) };
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ base: BASE, files, totals, gsc }, null, 2));
  } else {
    console.log(`sitemap lastmod census — ${BASE}`);
    console.log('  file            urls   w/lastmod    towns   towns w/lastmod');
    for (const f of files) {
      console.log(
        `  sitemap/${f.id}.xml`.padEnd(18) +
          String(f.urls).padStart(6) +
          String(f.withLastmod).padStart(12) +
          String(f.towns).padStart(9) +
          String(f.townsWithLastmod).padStart(18),
      );
    }
    console.log(
      '  TOTAL'.padEnd(18) +
        String(totals.urls).padStart(6) +
        String(totals.withLastmod).padStart(12) +
        String(totals.towns).padStart(9) +
        String(totals.townsWithLastmod).padStart(18),
    );
    if (gsc) {
      console.log(`\nGSC towns (${gsc.total} unique from the export):`);
      console.log(`  in sitemap:            ${gsc.present}`);
      console.log(`  ...with <lastmod>:     ${gsc.dated}`);
      console.log(`  ...without <lastmod>:  ${gsc.undated}`);
      console.log(`  absent from sitemap:   ${gsc.absent}`);
      if (gsc.undatedSample.length) console.log(`  undated sample: ${gsc.undatedSample.join(', ')}`);
      if (gsc.absentSample.length) console.log(`  absent sample:  ${gsc.absentSample.join(', ')}`);
    }
  }
}

main().catch((e) => {
  console.error(`census: ${e.stack || e.message}`);
  process.exit(1);
});
