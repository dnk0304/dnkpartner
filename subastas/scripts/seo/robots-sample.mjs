/**
 * scripts/seo/robots-sample.mjs — live indexability sampler.
 *
 * WHY: GSC reported 1,310 URLs "Excluded by 'noindex' tag" (flat since 09-07,
 * town rows last crawled mostly in JUNE). The question is whether that is a LIVE
 * defect or a stale Google snapshot. The only way to answer it is to ask the
 * live origin what it serves TODAY, per URL, and to do it on a stratified sample
 * of the exact rows in the GSC export — not on a handful of hand-picked URLs.
 *
 * Reads the GSC Table.csv export, stratifies (town / auction-detail / province /
 * /en, apex vs www host), fetches each URL following redirects, and records:
 *   HTTP code, final URL after redirects, <meta name="robots">, X-Robots-Tag,
 *   <link rel="canonical">.
 *
 * Output is CSV on stdout (redirect it into the ledger folder; do NOT commit the
 * result into the repo).
 *
 * Usage:
 *   node scripts/seo/robots-sample.mjs --table <path-to-Table.csv> [--n 50] > out.csv
 *
 * Deliberately dependency-free (global fetch, Node >= 18) so it runs from a bare
 * worktree with no install.
 */

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const TABLE = argOf('--table', null);
if (!TABLE) {
  console.error('usage: node robots-sample.mjs --table <Table.csv> [--n 50]');
  process.exit(2);
}
const CONCURRENCY = Number(argOf('--concurrency', '6'));

/** Strata: [key, howMany]. Mirrors the brief's 40/5/3/2 split. */
const PLAN = [
  ['town-apex', 25],
  ['town-www', 15],
  ['detail', 5],
  ['province', 3],
  ['en', 2],
];

/** Classify a GSC row URL into one of the strata keys. */
function classify(url) {
  const isWww = /\/\/www\./.test(url);
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  if (path.startsWith('/en/')) return 'en';
  const seg = path.split('/').filter(Boolean);
  if (seg[0] !== 'subastas') return 'other';
  // ⚠️ `/subastas/subasta/<slug>` is the LEGACY auction-detail route and is two
  // segments deep, exactly like a town hub. Classifying purely on depth files it
  // as a town and then reports its (correct, intentional) noindex as a town-hub
  // defect. The literal `subasta` segment is the discriminator — check it BEFORE
  // the depth ladder.
  if (seg[1] === 'subasta') return 'detail';
  const depth = seg.length - 1; // segments after /subastas
  if (depth === 1) return 'province';
  if (depth === 2) return isWww ? 'town-www' : 'town-apex';
  if (depth === 3) return 'detail'; // v3 route: /subastas/<prov>/<town>/<slug>
  return 'other';
}

/** Minimal CSV parse — the GSC export is 2 plain columns, no embedded commas. */
function readTable(path) {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  lines.shift(); // header
  return lines.map((l) => {
    const i = l.indexOf(',');
    return { url: l.slice(0, i), lastCrawled: l.slice(i + 1) };
  });
}

/**
 * Deterministic stride sample. NOT Math.random: a re-run must hit the same URLs
 * so a later re-sample is comparable to this one. Spreading by stride over the
 * export's own order also spreads over `Last crawled`, which is what we are
 * testing against (June-crawled rows are the whole question).
 */
function stride(rows, n) {
  if (rows.length <= n) return rows.slice();
  const step = rows.length / n;
  return Array.from({ length: n }, (_, i) => rows[Math.floor(i * step)]);
}

const RE_META_ROBOTS =
  /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i;
const RE_META_ROBOTS_REV =
  /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']robots["']/i;
const RE_CANONICAL =
  /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i;
const RE_CANONICAL_REV =
  /<link[^>]+href=["']([^"']*)["'][^>]*rel=["']canonical["']/i;

async function probe(row) {
  const out = {
    url: row.url,
    lastCrawled: row.lastCrawled,
    stratum: classify(row.url),
    status: '',
    finalUrl: '',
    redirected: '',
    metaRobots: '',
    xRobotsTag: '',
    canonical: '',
    note: '',
  };
  try {
    const res = await fetch(row.url, {
      redirect: 'follow',
      headers: {
        // Identify as a normal browser: the origin may vary by UA, and we want
        // what a crawler-ish client actually receives, not a bot-blocked page.
        'User-Agent':
          'Mozilla/5.0 (compatible; forge-seo-audit/1.0; +robots-sample.mjs)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    out.status = String(res.status);
    out.finalUrl = res.url;
    out.redirected = res.url !== row.url ? 'yes' : 'no';
    out.xRobotsTag = res.headers.get('x-robots-tag') ?? '';
    const html = await res.text();
    // ⚠️ SCAN THE WHOLE DOCUMENT, NOT JUST THE <head>.
    //
    // An earlier version sliced at `</head>` on the reasonable-sounding theory
    // that metadata lives in the head. It does not, here: this is a streaming
    // Next App Router app, and the metadata tags it renders (robots, canonical)
    // are flushed with the page shell AFTER the initial `</head>`. Verified
    // 2026-09-17 on /subastas/las-palmas/tinajo/... — the head slice reported NO
    // robots meta while the full document plainly contains
    // `<meta name="robots" content="noindex,follow"/>`.
    //
    // That failure direction is the dangerous one for THIS audit: a missing
    // robots tag reads as "indexable by default", so head-slicing silently turns
    // noindex pages into apparent passes. Matching on the literal tag markup is
    // specific enough that scanning the body does not produce false positives.
    out.metaRobots =
      (html.match(RE_META_ROBOTS) ?? html.match(RE_META_ROBOTS_REV))?.[1] ?? '';
    out.canonical =
      (html.match(RE_CANONICAL) ?? html.match(RE_CANONICAL_REV))?.[1] ?? '';
  } catch (e) {
    out.note = `FETCH_ERROR: ${e?.message ?? e}`;
  }
  return out;
}

async function pool(items, fn, limit) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const rows = readTable(TABLE);
const byStratum = new Map();
for (const r of rows) {
  const k = classify(r.url);
  if (!byStratum.has(k)) byStratum.set(k, []);
  byStratum.get(k).push(r);
}

const sample = [];
for (const [key, want] of PLAN) {
  const pool_ = byStratum.get(key) ?? [];
  if (pool_.length < want) {
    console.error(`WARN stratum ${key}: wanted ${want}, export has ${pool_.length}`);
  }
  sample.push(...stride(pool_, want));
}

console.error(`sampling ${sample.length} of ${rows.length} exported URLs`);
const results = await pool(sample, probe, CONCURRENCY);

const COLS = [
  'stratum',
  'url',
  'lastCrawled',
  'status',
  'redirected',
  'finalUrl',
  'metaRobots',
  'xRobotsTag',
  'canonical',
  'note',
];
const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
console.log(COLS.join(','));
for (const r of results) console.log(COLS.map((c) => esc(r[c] ?? '')).join(','));

// Summary to stderr so stdout stays clean CSV.
const tally = new Map();
for (const r of results) {
  const k = `${r.stratum} | ${r.status} | robots=${r.metaRobots || '(none)'} | redirected=${r.redirected}`;
  tally.set(k, (tally.get(k) ?? 0) + 1);
}
console.error('\n--- summary ---');
for (const [k, v] of [...tally].sort()) console.error(`${String(v).padStart(3)}  ${k}`);
