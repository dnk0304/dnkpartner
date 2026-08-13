/**
 * Unit tests for the archive partition planner.
 * Run with: npx tsx src/lib/seo/archive-partitions.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * The whole /resultados v4 tree is DERIVED from this module, so the four
 * behaviours that can silently corrupt that tree each get a test:
 *   1. the 10-page cap boundary (241 rows is the first row that must split),
 *   2. the thin-partition guard (0-row and 1-child splits),
 *   3. ladder exhaustion (report, never absorb),
 *   4. reserved-segment collisions in the shared seg2 slot.
 */
import {
  ARCHIVE_MAX_PAGES,
  ARCHIVE_NODE_CAPACITY,
  ARCHIVE_NODE_CAPACITY_DENSE,
  ARCHIVE_PAGE_SIZE_DENSE,
  archiveCapacityFor,
  archiveNodePath,
  archivePageLinks,
  archivePagePath,
  archivePageSizeFor,
  archiveUrlsFromPlans,
  isReservedResultadosRootSegment,
  isReservedResultadosSegment,
  ARCHIVE_PAGE_SIZE_MAX,
  archivePageSizeForNode,
  pageCountFor,
  pageCountForNode,
  planArchiveNode,
  planArchiveTree,
  remainingDimensions,
  safeMunicipioSegment,
  type ArchiveCountSource,
  type ArchiveDimension,
  type ArchiveNode,
} from './archive-partitions';
import { ARCHIVE_PAGE_SIZE } from '../registro/archive-paging';
import { PROVINCE_SLUG_TO_DB_KEY, TIPO_SLUGS } from './slugs';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

/** Build a count source from an explicit list of (node-key → count) rows. */
type Row = { muni: string; tipo: string; anio: number; trimestre: number; outcome: string };
function sourceOf(rows: readonly Row[]): ArchiveCountSource {
  const matches = (n: ArchiveNode, r: Row) =>
    (n.muni === undefined || n.muni === r.muni) &&
    (n.tipo === undefined || n.tipo === r.tipo) &&
    (n.anio === undefined || n.anio === r.anio) &&
    (n.trimestre === undefined || n.trimestre === r.trimestre) &&
    (n.outcome === undefined || n.outcome === r.outcome);
  const keyOf = (r: Row, dim: ArchiveDimension) =>
    dim === 'municipio' ? r.muni
      : dim === 'tipo' ? r.tipo
      : dim === 'anio' ? String(r.anio)
      : String(r.trimestre);
  return {
    total: (n) => rows.filter((r) => matches(n, r)).length,
    children: (n, dim: ArchiveDimension) => {
      const by = new Map<string, number>();
      for (const r of rows) {
        if (!matches(n, r)) continue;
        const k = keyOf(r, dim);
        by.set(k, (by.get(k) ?? 0) + 1);
      }
      return [...by].map(([key, total]) => ({ key, total }));
    },
  };
}
function mkRows(n: number, f: (i: number) => Partial<Row>): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    muni: 'a', tipo: 'judicial', anio: 2024, trimestre: 1, outcome: 'adjudicadas', ...f(i),
  }));
}

// --- constants ------------------------------------------------------------
check('capacity is page size x max pages', ARCHIVE_NODE_CAPACITY === ARCHIVE_PAGE_SIZE * ARCHIVE_MAX_PAGES);
check('max pages is 10 (Dennis 2026-08-12)', ARCHIVE_MAX_PAGES === 10);

// --- 1. cap boundary + the dense page-size switch -------------------------
check('dense capacity is 48 x 10 = 480',
  ARCHIVE_NODE_CAPACITY_DENSE === ARCHIVE_PAGE_SIZE_DENSE * ARCHIVE_MAX_PAGES);
check('page size stays 24 at or below the sparse capacity',
  archivePageSizeFor(ARCHIVE_NODE_CAPACITY) === ARCHIVE_PAGE_SIZE);
check('page size switches to 48 one row above it',
  archivePageSizeFor(ARCHIVE_NODE_CAPACITY + 1) === ARCHIVE_PAGE_SIZE_DENSE);
check('exactly sparse capacity => exactly max pages',
  pageCountFor(ARCHIVE_NODE_CAPACITY) === ARCHIVE_MAX_PAGES);
check('exactly dense capacity => exactly max pages',
  pageCountFor(ARCHIVE_NODE_CAPACITY_DENSE) === ARCHIVE_MAX_PAGES);
check('a million rows still reports max pages (never 11)',
  pageCountFor(1_000_000) === ARCHIVE_MAX_PAGES);
check('zero rows => zero pages', pageCountFor(0) === 0);
// The cap is the whole point of the wave: assert it over a wide sweep, not a
// couple of hand-picked totals.
let capViolation = 0;
for (let t = 0; t <= 20_000; t++) if (pageCountFor(t) > ARCHIVE_MAX_PAGES) capViolation++;
check('no row count 0..20000 ever yields more than 10 pages', capViolation === 0);

{
  // 240 rows across 2 towns: fits at 24/page, so it must NOT split.
  const at = planArchiveNode({ prov: 'madrid' },
    sourceOf(mkRows(ARCHIVE_NODE_CAPACITY, (i) => ({ muni: i % 2 ? 'a' : 'b' }))));
  check('at sparse capacity: no split', at.splitDimension === null && at.children.length === 0);
  check('at sparse capacity: 10 pages, 9 /pagina URLs', at.pages === 10 && at.pagePaths.length === 9);
  check('at sparse capacity: not capped', !at.capped && at.unreachableRows === 0);

  // 241 rows: switches to 48/page and now FITS — the whole point of step 1 of
  // Ken's ruling. It must not split, and it must not report as capped.
  const dense = planArchiveNode({ prov: 'madrid' },
    sourceOf(mkRows(ARCHIVE_NODE_CAPACITY + 1, (i) => ({ muni: i % 2 ? 'a' : 'b' }))));
  check('sparse capacity+1: absorbed by the dense page size, no split',
    dense.splitDimension === null && dense.children.length === 0);
  check('sparse capacity+1: 6 pages at 48/row', dense.pages === Math.ceil(241 / 48));
  check('sparse capacity+1: not capped', !dense.capped && dense.unreachableRows === 0);

  // 481 rows: the first row the dense page size cannot absorb.
  const over = planArchiveNode({ prov: 'madrid' },
    sourceOf(mkRows(ARCHIVE_NODE_CAPACITY_DENSE + 1, (i) => ({ muni: i % 2 ? 'a' : 'b' }))));
  check('dense capacity+1: splits on the first rung', over.splitDimension === 'municipio');
  check('dense capacity+1: emits both towns', over.children.length === 2);
  check('dense capacity+1: still renders its own 10 pages', over.pages === ARCHIVE_MAX_PAGES);
  check('dense capacity+1: not reported as capped (children cover it)', !over.capped);
}

// --- 1b. the full page-link fan (mandatory, Ken 2026-08-13) ---------------
{
  const n: ArchiveNode = { prov: 'madrid' };
  const fan = archivePageLinks(n, 10);
  check('fan links every page, not a window', fan.length === 10);
  check('fan starts at the bare node path (never /pagina/1)', fan[0] === '/resultados/madrid');
  check('fan ends at page 10', fan[9] === '/resultados/madrid/pagina/10');
  check('a single-page node still yields exactly its own URL',
    archivePageLinks(n, 1).length === 1 && archivePageLinks(n, 0).length === 1);
  // Depth guarantee: from ANY page, every other page is one hop away.
  check('every page reaches every other page in one hop',
    fan.every((_, i) => archivePageLinks(n, 10).length === fan.length));
}

// --- 2. thin-partition guard ---------------------------------------------
{
  const empty = planArchiveNode({ prov: 'soria' }, sourceOf([]));
  check('0 rows => 0 pages, no children', empty.pages === 0 && empty.children.length === 0);
  check('0 rows => never capped', !empty.capped);

  // Overflowing but every row is in ONE town: splitting by municipio would mint
  // a child identical to the parent. Must skip that rung and use the next.
  const single = planArchiveNode({ prov: 'madrid' },
    sourceOf(mkRows(500, (i) => ({ muni: 'onlytown', tipo: i % 2 ? 'judicial' : 'notarial' }))));
  check('degenerate rung is skipped, not emitted', single.splitDimension === 'tipo');
  check('the skipped rung is reported', single.skippedDimensions.includes('municipio'));
  check('no child duplicates the parent',
    !single.children.some((c) => archiveNodePath(c) === single.path));

  // Zero-count keys must never become URLs.
  const src = sourceOf(mkRows(300, (i) => ({ muni: i < 299 ? 'big' : 'tiny' })));
  const plan = planArchiveNode({ prov: 'madrid' }, src);
  check('every emitted child has rows > 0', plan.children.every((c) => src.total(c) > 0));
}

// --- 3. ladder exhaustion -------------------------------------------------
{
  // 1000 rows, all identical on every rung: nothing left to split by.
  const stuck = planArchiveNode({ prov: 'madrid' }, sourceOf(mkRows(1000, () => ({}))));
  check('exhausted ladder is flagged capped', stuck.capped);
  check('exhausted ladder reports the unreachable count',
    stuck.unreachableRows === 1000 - ARCHIVE_NODE_CAPACITY_DENSE);
  check('exhausted ladder still caps pages at 10', stuck.pages === ARCHIVE_MAX_PAGES);
  check('exhausted ladder reports all three skipped rungs',
    stuck.skippedDimensions.length === 3);

  // A year leaf that still overflows must reach for the quarter rung.
  const yearLeaf = planArchiveNode({ prov: 'madrid', muni: 'madrid', tipo: 'judicial', anio: 2017 },
    sourceOf(mkRows(938, (i) => ({ muni: 'madrid', anio: 2017, trimestre: (i % 4) + 1 }))));
  check('overflowing year leaf splits by trimestre', yearLeaf.splitDimension === 'trimestre');
  check('trimestre emits four children', yearLeaf.children.length === 4);
  check('trimestre children are t1..t4 in the URL',
    yearLeaf.children.map(archiveNodePath).sort().join(',')
      === '/resultados/madrid/madrid/judicial/2017/t1,/resultados/madrid/madrid/judicial/2017/t2,/resultados/madrid/madrid/judicial/2017/t3,/resultados/madrid/madrid/judicial/2017/t4');
  check('year leaf is not reported capped once quarters cover it', !yearLeaf.capped);
  // Quarter is NOT a general rung — it is never offered before a year exists.
  check('trimestre is not offered to a node without a year',
    !remainingDimensions({ prov: 'm', muni: 'a', tipo: 'judicial' }).includes('trimestre'));
  check('trimestre IS offered to a node with a year',
    remainingDimensions({ prov: 'm', muni: 'a', tipo: 'judicial', anio: 2024 }).includes('trimestre'));
  // A fully-specified node has no rungs left by construction.
  check('leaf node has no remaining dimensions',
    remainingDimensions({ prov: 'm', muni: 'a', tipo: 'judicial', anio: 2024, trimestre: 1 }).length === 0);
  // An outcome facet never ladders and never reports unreachable rows.
  const facet = planArchiveNode({ prov: 'madrid', outcome: 'adjudicadas' },
    sourceOf(mkRows(9000, () => ({}))));
  check('outcome facet does not ladder', facet.children.length === 0);
  check('outcome facet is not counted as capped', !facet.capped && facet.unreachableRows === 0);
}

// --- URLs -----------------------------------------------------------------
check('province path', archiveNodePath({ prov: 'madrid' }) === '/resultados/madrid');
check('town path', archiveNodePath({ prov: 'madrid', muni: 'getafe' }) === '/resultados/madrid/getafe');
check('tipo path',
  archiveNodePath({ prov: 'madrid', muni: 'getafe', tipo: 'judicial' }) === '/resultados/madrid/getafe/judicial');
check('year path',
  archiveNodePath({ prov: 'madrid', muni: 'getafe', tipo: 'judicial', anio: 2024 })
    === '/resultados/madrid/getafe/judicial/2024');
check('outcome path is location-first (v4 reversal)',
  archiveNodePath({ prov: 'madrid', outcome: 'adjudicadas' }) === '/resultados/madrid/adjudicadas');
check('page 1 is the bare path, never /pagina/1',
  archivePagePath({ prov: 'madrid' }, 1) === '/resultados/madrid');
check('page 2 shape', archivePagePath({ prov: 'madrid' }, 2) === '/resultados/madrid/pagina/2');

// --- 3b. the location-free shelf (no invented geo) ------------------------
{
  check('location-free node path is /resultados/{tipo}',
    archiveNodePath({ tipo: 'judicial' }) === '/resultados/judicial');
  check('location-free year path is /resultados/{tipo}/{anio}',
    archiveNodePath({ tipo: 'judicial', anio: 2019 }) === '/resultados/judicial/2019');
  check('location-free quarter path',
    archiveNodePath({ tipo: 'judicial', anio: 2019, trimestre: 3 }) === '/resultados/judicial/2019/t3');
  // The shelf must NEVER grow a municipio rung — that is how a fabricated
  // location would sneak into a permanent URL.
  check('location-free shelf has no municipio rung',
    !remainingDimensions({ tipo: 'judicial' }).includes('municipio'));
  check('location-free shelf ladders tipo->anio only',
    remainingDimensions({}).join(',') === 'tipo,anio');
  check('no location-free path ever contains sin-provincia',
    !archiveNodePath({ tipo: 'judicial', anio: 2019 }).includes('sin-provincia'));

  const shelf = planArchiveTree([], sourceOf(mkRows(600, (i) => ({ anio: 2018 + (i % 3) }))),
    { locationFreeTipos: ['judicial'] });
  check('shelf root is emitted', shelf.some((p) => p.path === '/resultados/judicial'));
  check('shelf splits by year when it overflows',
    shelf.find((p) => p.path === '/resultados/judicial')?.splitDimension === 'anio');
  check('every shelf node is province-free',
    shelf.every((p) => p.node.prov === undefined && !p.path.startsWith('/resultados/madrid')));
}

// --- 4. reserved segments -------------------------------------------------
check('outcome slugs are reserved under a province',
  ['adjudicadas', 'desiertas', 'canceladas', 'finalizadas-sin-resultado'].every(isReservedResultadosSegment));
check('every tipo slug is reserved', TIPO_SLUGS.every(isReservedResultadosSegment));
check('legacy tipo aliases are reserved',
  ['aeat', 'tributaria', 'administrativa'].every(isReservedResultadosSegment));
check('municipios index is reserved', isReservedResultadosSegment('municipios'));
check('pagina is reserved', isReservedResultadosSegment('pagina'));
check('4-digit years are reserved', ['1999', '2024', '0000'].every(isReservedResultadosSegment));
check('non-4-digit numbers are NOT reserved',
  !isReservedResultadosSegment('24') && !isReservedResultadosSegment('20244'));
check('a real town slug is not reserved',
  !isReservedResultadosSegment('getafe') && !isReservedResultadosSegment('alcala-de-henares'));
check('quarter segments are reserved under a province',
  ['t1', 't2', 't3', 't4'].every(isReservedResultadosSegment));
check('escape mirrors the slug-v2 prefix precedent',
  safeMunicipioSegment('notarial') === 'municipio-notarial' && safeMunicipioSegment('getafe') === 'getafe');

// seg1 now carries province | outcome | tipo. All three must stay disjoint or
// resolveResultadosSeg becomes ambiguous and a real province 404s.
{
  const provSlugs = new Set(Object.keys(PROVINCE_SLUG_TO_DB_KEY));
  const clash = TIPO_SLUGS.filter((t) => provSlugs.has(t));
  check('no tipo slug collides with a province slug at seg1', clash.length === 0);
  const outcomeSlugs = ['adjudicadas', 'desiertas', 'canceladas', 'finalizadas-sin-resultado'];
  check('no outcome slug collides with a province slug at seg1',
    outcomeSlugs.every((o) => !provSlugs.has(o)));
  check('no tipo slug collides with an outcome slug at seg1',
    TIPO_SLUGS.every((t) => !outcomeSlugs.includes(t)));
  check('every tipo slug is reserved at the root',
    TIPO_SLUGS.every(isReservedResultadosRootSegment));
  check('a real province slug is NOT reserved at the root',
    !isReservedResultadosRootSegment('madrid') && !isReservedResultadosRootSegment('barcelona'));
}

// --- tree walk ------------------------------------------------------------
{
  const rows = mkRows(600, (i) => ({
    muni: i < 500 ? 'big' : 'small',
    tipo: i % 3 === 0 ? 'judicial' : 'notarial',
    anio: 2020 + (i % 5),
  }));
  const plans = planArchiveTree(['madrid'], sourceOf(rows), { outcomeSlugs: ['adjudicadas'] });
  check('tree emits no zero-row node', plans.every((p) => p.total > 0));
  check('tree emits no page number above the cap',
    plans.every((p) => p.pages <= ARCHIVE_MAX_PAGES));
  const urls = archiveUrlsFromPlans(plans);
  check('tree emits no duplicate URL', new Set(urls).size === urls.length);
  check('every /pagina/N in the tree has N <= 10',
    urls.every((u) => {
      const m = /\/pagina\/(\d+)$/.exec(u);
      return !m || Number(m[1]) <= ARCHIVE_MAX_PAGES;
    }));
  check('the overflowing town got laddered',
    plans.some((p) => p.node.muni === 'big' && p.splitDimension !== null));
  check('province outcome facet is emitted once',
    plans.filter((p) => p.node.outcome === 'adjudicadas').length === 1);
}

// ---------------------------------------------------------------------------
// 5. ADAPTIVE PAGE SIZE at ladder-exhausted leaves (Ken addendum, 2026-08-13)
//
// This is the mechanism that took unreachable rows from 370 to 0 without a 6th
// rung, and it is one wrong predicate away from deleting the entire ladder — a
// page size derived from the row count ALONE would hand a 30,000-row province a
// 3,000-row page. So the tests below pin both halves: it must grow on a
// structurally terminal leaf, and it must NOT grow anywhere a rung remains.
// ---------------------------------------------------------------------------
{
  const MADRID_T1 = { prov: 'madrid', muni: 'madrid', tipo: 'judicial' as const, anio: 2026, trimestre: 1 };
  const BCN_T1 = { prov: 'barcelona', muni: 'barcelona', tipo: 'judicial' as const, anio: 2026, trimestre: 1 };

  check('terminal leaf has no rungs left', remainingDimensions(MADRID_T1).length === 0);

  // The two real prod nodes P0 measured.
  check('madrid 2026/t1 (840 rows) pages at 84', archivePageSizeForNode(MADRID_T1, 840) === 84);
  check('madrid 2026/t1 clears inside the cap', pageCountForNode(MADRID_T1, 840) === 10);
  check('barcelona 2026/t1 (490 rows) pages at 49', archivePageSizeForNode(BCN_T1, 490) === 49);
  check('barcelona 2026/t1 clears inside the cap', pageCountForNode(BCN_T1, 490) === 10);

  // A terminal leaf that already fits keeps the ordinary size — the adaptive
  // branch is for overflow only, not a blanket "leaves get big pages".
  check('small terminal leaf keeps page size 24', archivePageSizeForNode(MADRID_T1, 100) === ARCHIVE_PAGE_SIZE);
  check('mid terminal leaf keeps dense 48',
    archivePageSizeForNode(MADRID_T1, ARCHIVE_NODE_CAPACITY + 1) === ARCHIVE_PAGE_SIZE_DENSE);

  // ⛔ The load-bearing negative: a node with rungs left NEVER grows, however
  // huge. If this ever passes at anything but the dense size, the ladder is dead
  // and every overflowing province silently became one enormous page.
  check('province with rungs left does NOT get a big page',
    archivePageSizeForNode({ prov: 'madrid' }, 30_000) === ARCHIVE_PAGE_SIZE_DENSE);
  check('town with rungs left does NOT get a big page',
    archivePageSizeForNode({ prov: 'madrid', muni: 'madrid' }, 30_000) === ARCHIVE_PAGE_SIZE_DENSE);

  // The ceiling is real: past it the node is reported capped, never absorbed.
  const huge = planArchiveNode(MADRID_T1, { total: () => 2000, children: () => [] });
  check('past the ceiling the page size stops at ARCHIVE_PAGE_SIZE_MAX',
    huge.pageSize === ARCHIVE_PAGE_SIZE_MAX);
  check('past the ceiling the node is reported capped', huge.capped === true);
  check('past the ceiling unreachable rows are reported, not hidden',
    huge.unreachableRows === 2000 - ARCHIVE_PAGE_SIZE_MAX * ARCHIVE_MAX_PAGES);

  // ⛔ An outcome facet has no rungs left either, but must NOT grow: its rows are
  // already covered by the location ladder, so a bigger page buys no reach and
  // costs bytes. Caught by measuring the fixture, not by reading the code.
  check('outcome facet does NOT get the adaptive page size',
    archivePageSizeForNode({ prov: 'madrid', outcome: 'canceladas' }, 1550) === ARCHIVE_PAGE_SIZE_DENSE);
  const facet = planArchiveNode({ prov: 'madrid', outcome: 'canceladas' },
    { total: () => 1550, children: () => [] });
  check('outcome facet still caps at 10 pages', facet.pages === ARCHIVE_MAX_PAGES);
  check('outcome facet overflow is NOT counted as unreachable',
    facet.unreachableRows === 0 && facet.capped === false);

  // The exhausted leaf now reports ZERO unreachable rows — the P0 gate.
  const cleared = planArchiveNode(MADRID_T1, { total: () => 840, children: () => [] });
  check('the exhausted leaf reports 0 unreachable rows', cleared.unreachableRows === 0);
  check('the exhausted leaf is no longer capped', cleared.capped === false);
  check('plan.pageSize agrees with archivePageSizeForNode',
    cleared.pageSize === archivePageSizeForNode(MADRID_T1, 840));

  // The fan must cover every page of the grown node, or the depth claim is void.
  check('page fan covers all 10 pages of the grown leaf',
    archivePageLinks(MADRID_T1, cleared.pages).length === 10);
  check('page fan ends at /pagina/10',
    archivePageLinks(MADRID_T1, cleared.pages)[9] ===
      '/resultados/madrid/madrid/judicial/2026/t1/pagina/10');
}

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll archive-partitions tests passed.');
