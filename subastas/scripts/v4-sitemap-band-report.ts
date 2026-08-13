/**
 * v4-sitemap-band-report — size the AGGREGATION band and prove the `<loc>` diff.
 *
 * Run:  npx tsx scripts/v4-sitemap-band-report.ts <rollup.csv> [--v3-nonarchive N]
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS ANSWERS (P3 brief §5 + §5b.1)
 *
 *   1. the aggregation URL count today (v3) and after the flip (v4);
 *   2. how many 20k children that needs, and that none of them is empty;
 *   3. the `<loc>` union diff — added / removed / net, removals BY SHAPE;
 *   4. that every removal is a URL that now 301s, not one that silently vanished.
 *
 * ⭐ THE INPUT IS THE COMMITTED PROD ROLLUP, produced by the committed query:
 *
 *     npx tsx scripts/archive-rollup-sql.ts            # print it
 *     npx tsx scripts/archive-rollup-sql.ts --verify   # prove its outcome CASE
 *
 * `scripts/archive-rollup-2026-08-13.csv` is the run this report was sized from
 * (87,294 cells, 195,408 rows). Ken's §5b.1: STATE WHICH RUN. The previous gate
 * query lived only in an ellipsis inside a comment; this one is a file with a
 * date in its name and a query that regenerates it.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ SIZING vs SERVING — they use different sources ON PURPOSE
 *
 * This report sizes the band from the SQL rollup. The SERVED sitemap builds its
 * URL list from `readArchiveCensus()`, which runs the same SQL at request time
 * against the live DB. They share `archiveUrlSetFromCells` — one derivation —
 * so the only thing that can differ is the corpus's age, which is the point:
 * a constant sized on a snapshot, content read live.
 */
import { readFileSync } from 'node:fs';
import {
  archiveUrlSetFromCells,
  compareArchiveUrls,
  type ArchiveCell,
} from '../src/lib/seo/archive-census';
import { safeMunicipioSegment } from '../src/lib/seo/archive-partitions';
import { ARCHIVE_PAGE_SIZE } from '../src/lib/registro/archive-paging';
import { CHILD_SITEMAP_SIZE } from '../src/lib/seo/sitemap-config';
import {
  DB_AUCTIONTYPE_TO_TIPO_SLUG,
  PROVINCE_DB_KEY_TO_SLUG,
  slugify,
  type TipoSlug,
} from '../src/lib/seo/slugs';
import { OUTCOME_TO_SLUG, REGISTRY_OUTCOME_ORDER } from '../src/lib/registro/registro-ui';

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function parseCsvLine(l: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) {
      if (ch === '"') {
        if (l[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('usage: v4-sitemap-band-report.ts <rollup.csv> [--v3-nonarchive N]');
  process.exit(2);
}
/**
 * URLs in today's aggregation child that are NOT `/resultados` (core, provinces,
 * active towns, tipos, categories, guias, noticias). v4 does not touch a single
 * one of them, so they are a constant on both sides of the diff — supplied
 * rather than recomputed, because they come from tables this CSV does not carry.
 * Default 11,430 = the 16,516 measured live on prod 2026-08-12 minus the 5,086
 * `/resultados/.../pagina/N` URLs that measurement recorded separately.
 */
const nonArchiveIdx = process.argv.indexOf('--v3-nonarchive');
const V3_NON_ARCHIVE = nonArchiveIdx > 0 ? Number(process.argv[nonArchiveIdx + 1]) : 11_430;

const OUTCOME_SLUGS = REGISTRY_OUTCOME_ORDER.map((o) => OUTCOME_TO_SLUG[o]);
const OUTCOME_DB_TO_SLUG = Object.fromEntries(
  REGISTRY_OUTCOME_ORDER.map((o) => [o, OUTCOME_TO_SLUG[o]]),
) as Record<string, string>;

const cells: ArchiveCell[] = [];
const locationFreeTipos = new Set<TipoSlug>();
let unplaceableRows = 0;

/** province slug -> muni slug -> row count (drives the v3 archive band). */
const v3Muni = new Map<string, Map<string, number>>();
/** province slug -> per-outcome totals (drives the v3 outcome-first shapes). */
const v3Prov = new Map<string, Map<string, number>>();

for (const line of readFileSync(csvPath, 'utf8').trim().split('\n').slice(1)) {
  const [provDb, muniDb, typeDb, yrRaw, qtrRaw, outcomeDb, nRaw] = parseCsvLine(line);
  const n = Number(nRaw);
  const tipo = typeDb ? DB_AUCTIONTYPE_TO_TIPO_SLUG[typeDb] : undefined;
  const prov = PROVINCE_DB_KEY_TO_SLUG[provDb] ?? '';
  const outcome = OUTCOME_DB_TO_SLUG[outcomeDb] ?? '';

  if (!prov) {
    if (!tipo) { unplaceableRows += n; continue; }
    locationFreeTipos.add(tipo);
    cells.push({ prov: '', muni: '', rawMuni: '', tipo, anio: Number(yrRaw), qtr: Number(qtrRaw), outcome, n });
    continue;
  }

  const rawMuni = muniDb ? slugify(muniDb) : '';
  cells.push({
    prov,
    muni: rawMuni ? safeMunicipioSegment(rawMuni) : 'sin-municipio',
    rawMuni,
    tipo: tipo ?? 'judicial',
    anio: Number(yrRaw),
    qtr: Number(qtrRaw),
    outcome,
    n,
  });

  let pm = v3Prov.get(prov);
  if (!pm) { pm = new Map(); v3Prov.set(prov, pm); }
  pm.set(outcomeDb, (pm.get(outcomeDb) ?? 0) + n);
  if (rawMuni) {
    let mm = v3Muni.get(prov);
    if (!mm) { mm = new Map(); v3Muni.set(prov, mm); }
    mm.set(rawMuni, (mm.get(rawMuni) ?? 0) + n);
  }
}

// ---------------------------------------------------------------------------
// TODAY: the /resultados URLs the aggregation child emits right now
// (sitemap-entries.ts @ 41c1d3e, the `--- /resultados registry ---` block)
// ---------------------------------------------------------------------------
const v3: string[] = ['/resultados'];
for (const [prov, counts] of [...v3Prov].sort()) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) continue;
  v3.push(`/resultados/${prov}`);
  // The OUTCOME-FIRST shapes — superseded by v4's `/resultados/{prov}/{outcome}`.
  if ((counts.get('VENDIDA') ?? 0) > 0) v3.push(`/resultados/${OUTCOME_TO_SLUG.VENDIDA}/${prov}`);
  if ((counts.get('DESIERTA') ?? 0) > 0) v3.push(`/resultados/${OUTCOME_TO_SLUG.DESIERTA}/${prov}`);
}
for (const [prov, munis] of [...v3Muni].sort()) {
  for (const [slug] of [...munis].sort()) v3.push(`/resultados/${prov}/${safeMunicipioSegment(slug)}`);
}
// `/pagina/N` at the town level only, n = 2..ceil(total/24), UNCAPPED here so the
// diff shows the true shape of what v4 replaces (the live code truncates at
// CHILD_SITEMAP_SIZE, which is the defect this brief removes).
let v3PaginaOverCap = 0;
for (const [prov, munis] of [...v3Muni].sort()) {
  for (const [slug, total] of [...munis].sort()) {
    const pages = Math.ceil(total / ARCHIVE_PAGE_SIZE);
    for (let n = 2; n <= pages; n++) {
      v3.push(`/resultados/${prov}/${safeMunicipioSegment(slug)}/pagina/${n}`);
      if (n > 10) v3PaginaOverCap++;
    }
  }
}

// ---------------------------------------------------------------------------
// AFTER: the v4 tree, from the planner
// ---------------------------------------------------------------------------
const set = archiveUrlSetFromCells(cells, {
  outcomeSlugs: OUTCOME_SLUGS,
  locationFreeTipos: [...locationFreeTipos].sort(),
});
const v4 = [...set.urls];

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------
const A = new Set(v3);
const B = new Set(v4);
const added = v4.filter((u) => !A.has(u)).sort(compareArchiveUrls);
const removed = v3.filter((u) => !B.has(u)).sort(compareArchiveUrls);

/** Classify a removed URL by SHAPE, so "why did this go" is answered structurally. */
function shapeOf(u: string): string {
  const seg = u.split('/').filter(Boolean); // ['resultados', ...]
  const pIdx = seg.indexOf('pagina');
  if (pIdx > 0) {
    const n = Number(seg[pIdx + 1]);
    return n > 10
      ? 'pagina/{n>10}          — beyond the 10-page cap; 301 -> the ladder child'
      : 'pagina/{n<=10}         — town no longer a leaf; 301 -> its ladder child';
  }
  if (seg.length === 3 && OUTCOME_SLUGS.includes(seg[1])) {
    return '{outcome}/{prov}       — reversed to /{prov}/{outcome}; 301';
  }
  return `OTHER (${seg.length} segs)  — INVESTIGATE`;
}
const byShape = new Map<string, number>();
for (const u of removed) byShape.set(shapeOf(u), (byShape.get(shapeOf(u)) ?? 0) + 1);

// ---------------------------------------------------------------------------
// band sizing
// ---------------------------------------------------------------------------
const v3Total = V3_NON_ARCHIVE + v3.length;
const v4Total = V3_NON_ARCHIVE + v4.length;
const childrenNeeded = Math.max(1, Math.ceil(v4Total / CHILD_SITEMAP_SIZE));

const pad = (n: number) => n.toLocaleString('en-US').padStart(9);
console.log('=== v4 SITEMAP AGGREGATION BAND REPORT ===');
console.log(`source rollup            : ${csvPath}`);
console.log(`corpus rows placed       : ${pad(set.rows)}`);
console.log(`rows with no province+tipo (no page, no sitemap): ${unplaceableRows}`);
console.log('');
console.log('--- 1. AGGREGATION URL COUNT ---');
console.log(`  non-/resultados (unchanged by v4) : ${pad(V3_NON_ARCHIVE)}`);
console.log(`  /resultados TODAY  (v3)           : ${pad(v3.length)}`);
console.log(`  /resultados AFTER  (v4)           : ${pad(v4.length)}`);
console.log(`  BAND TOTAL today                  : ${pad(v3Total)}`);
console.log(`  BAND TOTAL after                  : ${pad(v4Total)}`);
console.log(`  (today's live child 0 truncates at ${CHILD_SITEMAP_SIZE}; ${v3PaginaOverCap} of the v3`);
console.log(`   pagina URLs are also beyond the 10-page cap and now 301)`);
console.log('');
console.log('--- 2. CHILDREN ---');
console.log(`  CHILD_SITEMAP_SIZE                : ${pad(CHILD_SITEMAP_SIZE)}  (FIRM)`);
console.log(`  ceil(${v4Total} / ${CHILD_SITEMAP_SIZE})                : ${childrenNeeded}`);
for (let i = 0; i < childrenNeeded; i++) {
  const lo = i * CHILD_SITEMAP_SIZE;
  const size = Math.min(CHILD_SITEMAP_SIZE, v4Total - lo);
  console.log(`    child ${i}: skip ${String(lo).padStart(6)}  urls ${pad(size)}  ${size > 0 ? 'NON-EMPTY' : '*** EMPTY ***'}`);
}
console.log('');
console.log('--- 3. <loc> UNION DIFF (aggregation band) ---');
console.log(`  added   : ${pad(added.length)}`);
console.log(`  removed : ${pad(removed.length)}`);
console.log(`  net     : ${pad(added.length - removed.length)}`);
console.log('  removals by shape:');
for (const [shape, n] of [...byShape].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(7)}  ${shape}`);
}
const unexplained = [...byShape].filter(([s]) => s.startsWith('OTHER'));
console.log('');
console.log('--- 4. GATE: every removal is a 301, not a silent disappearance ---');
if (unexplained.length === 0) {
  console.log('  PASS — every removed URL matches a superseded shape that P2 301s.');
} else {
  console.log('  FAIL — unclassified removals:');
  for (const u of removed.filter((x) => shapeOf(x).startsWith('OTHER')).slice(0, 20)) {
    console.log(`    ${u}`);
  }
}
console.log('');
console.log('--- 5. SAMPLES ---');
console.log('  first 5 added  :', added.slice(0, 5).join('  '));
console.log('  first 5 removed:', removed.slice(0, 5).join('  '));

process.exit(unexplained.length === 0 ? 0 : 1);
