/**
 * archive-partition-report — measure the v4 archive tree the planner produces
 * against the REAL prod corpus, and produce the six P0 go/no-go numbers.
 *
 * Run:  npx tsx scripts/archive-partition-report.ts <rollup.csv>
 *
 * The CSV is a prod rollup produced read-only by the query in
 * `scripts/archive-rollup-sql.ts`:
 *
 *   npx tsx scripts/archive-rollup-sql.ts            # print it
 *   npx tsx scripts/archive-rollup-sql.ts --verify   # prove its outcome CASE
 *                                                    # agrees with auctionOutcome()
 *
 * ⚠️ It used to be documented HERE, as `CASE ... END  -- SQL projection of
 * outcomeWhere()`. An ellipsis. The six P0 numbers that sized this wave came out
 * of a query that existed in no repo — the same failure class as P1's vanished
 * corpus, and Ken's T2 ticket. The query is now committed, the staleness window
 * is interpolated from the taxonomy constant rather than typed, and `--verify`
 * fails on a single row where the SQL and the app disagree.
 *
 * See `archive-partitions.ts` (`anio` rung) for why the year coalesces onto
 * `publishedAt` and what that means for the meaning of "año".
 */
import { readFileSync } from 'node:fs';
import {
  ARCHIVE_MAX_PAGES,
  ARCHIVE_NODE_CAPACITY,
  ARCHIVE_NODE_CAPACITY_DENSE,
  ARCHIVE_PAGE_SIZE_DENSE,
  archiveNodePath,
  archivePagePath,
  municipioIndexPath,
  pageCountFor,
  planArchiveTree,
  safeMunicipioSegment,
  type ArchiveCountSource,
  type ArchiveDimension,
  type ArchiveNode,
  type ArchivePlan,
} from '../src/lib/seo/archive-partitions';
import { ARCHIVE_PAGE_SIZE, HUB_MUNI_PREVIEW, MUNI_INDEX_PAGE_SIZE } from '../src/lib/registro/archive-paging';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from '../src/lib/seo/slugs';
import { DB_AUCTIONTYPE_TO_TIPO_SLUG, type TipoSlug } from '../src/lib/seo/slugs';
import { OUTCOME_TO_SLUG, REGISTRY_OUTCOME_ORDER } from '../src/lib/registro/registro-ui';

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------
function parseCsvLine(l: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) {
      if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

type Cell = {
  prov: string; muni: string; tipo: string; anio: number; qtr: number; outcome: string; n: number;
};

const csvPath = process.argv[2];
if (!csvPath) { console.error('usage: archive-partition-report.ts <rollup.csv>'); process.exit(2); }

const cells: Cell[] = [];
let locationFreeRows = 0;
let excludedRows = 0;       // no province AND no tipo AND no usable date -> no page, no sitemap
let unplaceableRows = 0;    // no province, no tipo, but a date -> no shelf exists; reported
let skippedNoMuni = 0;
/** province slug -> muni slug -> canonical DB name (largest wins, mirrors registro-read) */
const muniNameBySlug = new Map<string, Map<string, { name: string; n: number }>>();
const locationFreeTipos = new Set<TipoSlug>();

for (const line of readFileSync(csvPath, 'utf8').trim().split('\n').slice(1)) {
  const [provDb, muniDb, typeDb, yrRaw, qtrRaw, outcome, nRaw] = parseCsvLine(line);
  const n = Number(nRaw);
  const anio = Number(yrRaw);
  const qtr = Number(qtrRaw);
  const tipo = typeDb ? DB_AUCTIONTYPE_TO_TIPO_SLUG[typeDb] : undefined;
  const prov = PROVINCE_DB_KEY_TO_SLUG[provDb] ?? '';

  if (!prov) {
    // Ken 2026-08-13: NEVER invent a province and never mint a `sin-provincia`
    // hub. These rows live on the location-free shelf /resultados/{tipo}/{año},
    // placed only by attributes we actually have. With no tipo AND no date
    // there is nothing to place them by, so they leave the archive tree AND the
    // sitemap entirely — we do not advertise a page we cannot place.
    if (!tipo && !anio) { excludedRows += n; continue; }
    if (!tipo) { unplaceableRows += n; continue; }
    locationFreeRows += n;
    locationFreeTipos.add(tipo);
    cells.push({ prov: '', muni: '', tipo, anio, qtr, outcome, n });
    continue;
  }

  const rawMuniSlug = muniDb ? slugify(muniDb) : '';
  if (!rawMuniSlug) skippedNoMuni += n;
  const muni = rawMuniSlug ? safeMunicipioSegment(rawMuniSlug) : 'sin-municipio';
  if (rawMuniSlug) {
    let m = muniNameBySlug.get(prov);
    if (!m) { m = new Map(); muniNameBySlug.set(prov, m); }
    const prev = m.get(rawMuniSlug);
    if (!prev || n > prev.n) m.set(rawMuniSlug, { name: muniDb, n });
  }
  cells.push({ prov, muni, tipo: tipo ?? 'judicial', anio, qtr, outcome, n });
}

// ---------------------------------------------------------------------------
// count source — indexed so the tree walk is not O(cells) per node
// ---------------------------------------------------------------------------
const OUTCOME_SLUGS = REGISTRY_OUTCOME_ORDER.map((o) => OUTCOME_TO_SLUG[o]);
const OUTCOME_DB_TO_SLUG = Object.fromEntries(
  REGISTRY_OUTCOME_ORDER.map((o) => [o, OUTCOME_TO_SLUG[o]]),
) as Record<string, string>;

const totals = new Map<string, number>();
const childIdx = new Map<string, Map<string, number>>();
const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
function bumpChild(nodeKey: string, dim: ArchiveDimension, key: string, n: number) {
  const k = `${nodeKey}#${dim}`;
  let m = childIdx.get(k);
  if (!m) { m = new Map(); childIdx.set(k, m); }
  bump(m, key, n);
}

/**
 * Index EVERY node shape the ladder can reach, not just the four full prefixes.
 * The thin-partition guard makes the planner skip rungs, so it legitimately
 * asks for e.g. `children({prov, muni}, 'anio')` on a town whose tipo rung was
 * degenerate. Indexing only the prefixes returns an empty child list there,
 * which the planner correctly reads as "nothing to split by" and reports as a
 * false ladder exhaustion. All 8 subsets of {muni,tipo,anio} are indexed.
 */
const DIMS = ['municipio', 'tipo', 'anio', 'trimestre'] as const;
for (const c of cells) {
  const oSlug = OUTCOME_DB_TO_SLUG[c.outcome];
  const val = {
    municipio: c.muni, tipo: c.tipo, anio: String(c.anio), trimestre: String(c.qtr),
  } as const;
  for (let mask = 0; mask < 16; mask++) {
    const has = DIMS.map((_, i) => Boolean(mask & (1 << i)));
    // `trimestre` only ever exists on a node that already has `anio`, so the
    // shapes where it appears without one are not reachable and not indexed.
    if (has[3] && !has[2]) continue;
    const k = `${c.prov}|${has[0] ? c.muni : ''}|${has[1] ? c.tipo : ''}|${has[2] ? c.anio : ''}|${has[3] ? c.qtr : ''}|`;
    bump(totals, k, c.n);
    for (let i = 0; i < DIMS.length; i++) {
      if (has[i]) continue;
      if (DIMS[i] === 'trimestre' && !has[2]) continue;   // not offered before a year
      bumpChild(k, DIMS[i], val[DIMS[i]], c.n);
    }
  }
  if (oSlug) bump(totals, `${c.prov}|||||${oSlug}`, c.n);
}

const nodeKey = (n: ArchiveNode) =>
  `${n.prov ?? ''}|${n.muni ?? ''}|${n.tipo ?? ''}|${n.anio ?? ''}|${n.trimestre ?? ''}|${n.outcome ?? ''}`;

const counts: ArchiveCountSource = {
  total: (n) => totals.get(nodeKey(n)) ?? 0,
  children: (n, dim) => [...(childIdx.get(`${nodeKey(n)}#${dim}`) ?? new Map())]
    .map(([key, total]) => ({ key, total })),
};

const provinces = [...new Set(cells.map((c) => c.prov))].filter(Boolean).sort();

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------
const plans = planArchiveTree(provinces, counts, {
  outcomeSlugs: OUTCOME_SLUGS,
  locationFreeTipos: [...locationFreeTipos].sort(),
});
const byPath = new Map<string, ArchivePlan>(plans.map((p) => [p.path, p]));

const level = (p: ArchivePlan): string =>
  p.node.outcome ? 'outcome' :
  p.node.prov === undefined ? 'sin-provincia' :
  p.node.trimestre !== undefined ? 'trimestre' :
  p.node.anio !== undefined ? 'anio' :
  p.node.tipo !== undefined ? 'tipo' :
  p.node.muni !== undefined ? 'municipio' : 'provincia';

const LEVELS = ['provincia', 'municipio', 'tipo', 'anio', 'trimestre', 'outcome', 'sin-provincia'] as const;
const nodeCount: Record<string, number> = {};
const pageCount: Record<string, number> = {};
for (const p of plans) {
  const l = level(p);
  nodeCount[l] = (nodeCount[l] ?? 0) + 1;
  pageCount[l] = (pageCount[l] ?? 0) + p.pagePaths.length;
}

// /municipios index (unchanged from wave 2bf550b; not produced by the planner)
let muniIndexUrls = 0;
const muniIndexPagesByProv = new Map<string, number>();
for (const prov of provinces) {
  const total = muniNameBySlug.get(prov)?.size ?? 0;
  const pages = total > HUB_MUNI_PREVIEW ? Math.ceil(total / MUNI_INDEX_PAGE_SIZE) : 0;
  muniIndexPagesByProv.set(prov, pages);
  muniIndexUrls += pages; // page 1 = /municipios, pages 2..N = /municipios/pagina/N
}

const capped = plans.filter((p) => p.capped);
const totalNodes = plans.length;
const totalPageUrls = plans.reduce((a, p) => a + p.pagePaths.length, 0);
const deepestPage = plans.reduce((a, p) => Math.max(a, p.pages), 0);

// ---------------------------------------------------------------------------
// click depth — BFS over the actual link graph
// ---------------------------------------------------------------------------
/**
 * Pagination cost under the two link models.
 *
 * WINDOW = today's SeoPagination (first + last + current±2): reaching page 6 of
 * a 10-page node costs 3 hops, which is what put the deepest detail at 9.
 * FAN = Ken's mandated full page fan: every page links every other page, so the
 * worst page is 1 hop from page 1. This is the entire mechanism by which the
 * depth number becomes 7 — hence it is measured, not assumed.
 */
function paginationDepthsWindow(pages: number, nodeDepth: number): number[] {
  const d = new Array(pages + 1).fill(Infinity);
  d[1] = nodeDepth;
  const q = [1];
  while (q.length) {
    const p = q.shift() as number;
    const links = new Set<number>([1, pages, p - 2, p - 1, p + 1, p + 2]);
    for (const t of links) {
      if (t < 1 || t > pages) continue;
      if (d[t] > d[p] + 1) { d[t] = d[p] + 1; q.push(t); }
    }
  }
  return d;
}

// depth of each archive node
const depth = new Map<string, number>();
const HOME = 0;
const RESULTADOS = HOME + 1;             // / -> /resultados
for (const prov of provinces) depth.set(`/resultados/${prov}`, RESULTADOS + 1);

// province hub links: outcome facets, /municipios index pages (all, <=5),
// the top-HUB_MUNI_PREVIEW town preview, and its own ladder children.
const provPreview = new Map<string, Set<string>>();
for (const prov of provinces) {
  const munis = [...(muniNameBySlug.get(prov) ?? new Map())]
    .map(([slug, v]) => ({ slug: safeMunicipioSegment(slug), n: v.n }))
    .sort((a, b) => b.n - a.n).slice(0, HUB_MUNI_PREVIEW);
  provPreview.set(prov, new Set(munis.map((m) => m.slug)));
}

// The location-free shelf roots hang off /resultados exactly like the province
// hubs do. P1 MUST link them from /resultados — they have no other parent, and
// without that link all 23 shelf nodes are orphans (which is precisely what
// this BFS reported before the seed was added).
for (const tipo of locationFreeTipos) depth.set(`/resultados/${tipo}`, RESULTADOS + 1);

// BFS the node graph
const queue: string[] = [
  ...provinces.map((p) => `/resultados/${p}`),
  ...[...locationFreeTipos].map((t) => `/resultados/${t}`),
];
while (queue.length) {
  const path = queue.shift() as string;
  const plan = byPath.get(path);
  if (!plan) continue;
  const d = depth.get(path) as number;
  const kids: string[] = plan.children.map(archiveNodePath);
  if (level(plan) === 'provincia') {
    for (const s of OUTCOME_SLUGS) kids.push(`/resultados/${plan.node.prov}/${s}`);
    // town preview links straight from the hub (depth d+1); the /municipios
    // index carries the rest at d+2 (hub -> index page -> town).
    for (const slug of provPreview.get(plan.node.prov) ?? []) {
      kids.push(`/resultados/${plan.node.prov}/${slug}`);
    }
  }
  for (const k of kids) {
    if (!byPath.has(k)) continue;
    if ((depth.get(k) ?? Infinity) > d + 1) { depth.set(k, d + 1); queue.push(k); }
  }
}
// towns not in the hub preview are reached via a /municipios index page (d+2)
for (const p of plans) {
  if (level(p) !== 'municipio') continue;
  const hubD = depth.get(`/resultados/${p.node.prov}`) as number;
  const viaIndex = hubD + 2;
  if ((depth.get(p.path) ?? Infinity) > viaIndex) depth.set(p.path, viaIndex);
}
// re-relax descendants after the index shortcut
for (let pass = 0; pass < 4; pass++) {
  for (const p of plans) {
    const d = depth.get(p.path);
    if (d === undefined) continue;
    for (const c of p.children) {
      const cp = archiveNodePath(c);
      if (byPath.has(cp) && (depth.get(cp) ?? Infinity) > d + 1) depth.set(cp, d + 1);
    }
  }
}

// deepest DETAIL page: a detail link sits on whichever paginated page holds it.
// Two scenarios, because the pagination WIDGET is a free variable now that the
// cap is 10: the current first+last+current±2 window costs up to 3 hops to
// reach the middle of a 10-page node, whereas linking all 10 pages costs 1.
let deepestDetail = 0;
let deepestDetailAt = '';
let deepestDetailAll = 0;
let deepestDetailAllAt = '';
let deepestDetailNoQtr = 0;
let deepestDetailNoQtrAt = '';
let unreachableNodes = 0;
let unreachableRowsTotal = 0;
const detailDepthHist = new Map<number, number>();
for (const p of plans) {
  const d = depth.get(p.path);
  if (d === undefined) { unreachableNodes++; continue; }
  unreachableRowsTotal += p.unreachableRows;
  const pd = paginationDepthsWindow(p.pages, d);
  const worst = Math.max(...pd.slice(1, p.pages + 1));
  if (worst + 1 > deepestDetail) { deepestDetail = worst + 1; deepestDetailAt = p.path; }
  // FAN: page 1 at d, every other page at d+1
  const worstAll = p.pages > 1 ? d + 1 : d;
  if (worstAll + 1 > deepestDetailAll) { deepestDetailAll = worstAll + 1; deepestDetailAllAt = p.path; }
  // Ken accepted depth 8 for the trimestre minority specifically; everything
  // else must hold at <=7, so the two are measured separately rather than one
  // max hiding behind the other.
  if (p.node.trimestre === undefined && worstAll + 1 > deepestDetailNoQtr) {
    deepestDetailNoQtr = worstAll + 1;
    deepestDetailNoQtrAt = p.path;
  }
  // Only LEAF nodes: every row lives in exactly one leaf, so parents would double-count.
  if (p.children.length === 0 && !p.node.outcome) detailDepthHist.set(worstAll + 1, (detailDepthHist.get(worstAll + 1) ?? 0) + p.total);
}

// ---------------------------------------------------------------------------
// TODAY's tree, same corpus — for the delta
// ---------------------------------------------------------------------------
let todayUrls = 1 + OUTCOME_SLUGS.length;                     // /resultados + 4 national outcome
for (const prov of provinces) {
  const t = totals.get(`${prov}|||||`) ?? 0;
  todayUrls += Math.ceil(t / ARCHIVE_PAGE_SIZE);              // /resultados/{prov} UNCAPPED pagination
  todayUrls += OUTCOME_SLUGS.length;                          // /resultados/{outcome}/{prov}
  todayUrls += muniIndexPagesByProv.get(prov) ?? 0;
}
for (const [k, t] of totals) {
  const [prov, muni, tipo, anio, qtr, outcome] = k.split('|');
  if (prov && muni && !tipo && !anio && !qtr && !outcome) {
    todayUrls += Math.ceil(t / ARCHIVE_PAGE_SIZE);            // town, uncapped
  }
}
const v4Urls = totalNodes + totalPageUrls + muniIndexUrls + 1 + OUTCOME_SLUGS.length;

// ---------------------------------------------------------------------------
// collision census
// ---------------------------------------------------------------------------
let collisions = 0;
const collisionExamples: string[] = [];
for (const [prov, m] of muniNameBySlug) {
  for (const slug of m.keys()) {
    if (safeMunicipioSegment(slug) !== slug) {
      collisions++;
      if (collisionExamples.length < 10) collisionExamples.push(`${prov}/${slug}`);
    }
  }
}
const totalMuniSlugs = [...muniNameBySlug.values()].reduce((a, m) => a + m.size, 0);

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
const corpus = cells.reduce((a, c) => a + c.n, 0);
const L = console.log;
L('=== v4 ARCHIVE PARTITION REPORT (Ken ruling 2026-08-13 applied) ===');
L(`corpus rows in archive scope : ${corpus.toLocaleString()}`);
L(`  province-less -> location-free shelf /resultados/{tipo}/{ano} : ${locationFreeRows.toLocaleString()}`);
L(`  EXCLUDED (no province, no tipo, no date; no page, no sitemap) : ${excludedRows.toLocaleString()}`);
L(`  no province + no tipo but dated (no shelf exists; reported)   : ${unplaceableRows.toLocaleString()}`);
L(`  rows with no municipality  : ${skippedNoMuni.toLocaleString()} -> muni segment 'sin-municipio'`);
L(`page size ${ARCHIVE_PAGE_SIZE} x ${ARCHIVE_MAX_PAGES} = ${ARCHIVE_NODE_CAPACITY} rows/node; dense ${ARCHIVE_PAGE_SIZE_DENSE} x ${ARCHIVE_MAX_PAGES} = ${ARCHIVE_NODE_CAPACITY_DENSE}`);
L('');
L('--- 1. URL COUNT BY LEVEL ---');
for (const l of LEVELS) {
  L(`  ${l.padEnd(10)} nodes ${String(nodeCount[l] ?? 0).padStart(7)}   /pagina URLs ${String(pageCount[l] ?? 0).padStart(7)}`);
}
L(`  ${'municipios'.padEnd(10)} nodes ${String(muniIndexUrls).padStart(7)}   (A-Z index, incl. its own /pagina)`);
L(`  national   nodes ${String(1 + OUTCOME_SLUGS.length).padStart(7)}   (/resultados + 4 outcome hubs, unchanged)`);
L(`  TOTAL v4 archive URLs: ${v4Urls.toLocaleString()}`);
L('');
L('--- 2. MAX CLICK DEPTH (/ -> deepest concluded detail page) ---');
L(`  A) OLD SeoPagination window (first+last+current±2): ${deepestDetail}   worst: ${deepestDetailAt}`);
L(`  B) MANDATED full page fan (every page links all <=10): ${deepestDetailAll}   worst: ${deepestDetailAllAt}`);
L(`     excluding the trimestre minority              : ${deepestDetailNoQtr}   worst: ${deepestDetailNoQtrAt}`);
L(`     gate: <=7 outside trimestre  -> ${deepestDetailNoQtr <= 7 ? 'PASS' : 'FAIL'}`);
L(`     gate: <=8 including trimestre (Ken accepted 8) -> ${deepestDetailAll <= 8 ? 'PASS' : 'FAIL'}`);
L(`  archive nodes unreachable by link: ${unreachableNodes}`);
L('  detail-page depth distribution under the mandated fan, by row count:');
for (const k of [...detailDepthHist.keys()].sort((a, b) => a - b)) {
  L(`    depth ${k}: ${(detailDepthHist.get(k) as number).toLocaleString()} rows`);
}
L('');
L('--- 3. DEEPEST /pagina/N ANYWHERE ---');
L(`  ${deepestPage}  (cap ${ARCHIVE_MAX_PAGES}; ${deepestPage <= ARCHIVE_MAX_PAGES ? 'HOLDS' : 'VIOLATED'})`);
L(`  max page number appearing in any emitted URL: ${plans.reduce((a, p) => Math.max(a, p.pagePaths.length ? p.pages : 1), 0)}`);
L('');
L('--- 4. LADDER-EXHAUSTED NODES (gate: unreachable rows MUST be 0) ---');
const cappedRows = capped.reduce((a, p) => a + p.unreachableRows, 0);
L(`  ${capped.length} node(s); unreachable rows ${cappedRows.toLocaleString()}  ${cappedRows === 0 ? 'PASS' : 'FAIL'}`);
for (const p of capped.slice(0, 15)) L(`    ${p.path}  total=${p.total} unreachable=${p.unreachableRows}`);
if (cappedRows > 0) {
  L('  ROOT CAUSE (measured against prod, 2026-08-13): NOT a ladder-shape problem.');
  L('    Madrid 2026/t1 = 840 rows, of which 753 are endsAt-NULL, dated by the');
  L('    publishedAt fallback, ALL outcome=canceladas, and 475+278 of them land on');
  L('    exactly two days (2026-02-04, 2026-02-05) — one bulk BOE cancellation import.');
  L('    No date rung splits a same-day clump: month leaves Madrid Feb at 782, and an');
  L('    outcome rung leaves canceladas at 753 (both still over 480, and both emit');
  L('    thin siblings). The fix is data-side — populate endsAt for those rows, which');
  L('    redistributes them across real auction end dates — not another URL segment.');
  L('    Scraper tables are Ghost-owned and fenced out of this wave.');
}
L('');
L('--- 5. RESERVED-SEGMENT COLLISIONS ---');
L(`  municipality slugs checked: ${totalMuniSlugs.toLocaleString()}`);
L(`  collisions: ${collisions}${collisionExamples.length ? ' -> ' + collisionExamples.join(', ') : ''}`);
L('');
L('--- 6. BEFORE / AFTER URL DELTA ---');
L(`  today's archive tree : ${todayUrls.toLocaleString()}`);
L(`  v4 archive tree      : ${v4Urls.toLocaleString()}`);
L(`  delta                : ${(v4Urls - todayUrls >= 0 ? '+' : '') + (v4Urls - todayUrls).toLocaleString()}`);
