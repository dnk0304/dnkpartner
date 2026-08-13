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
  archiveNodePath,
  archivePagePath,
  archiveUrlsFromPlans,
  isReservedResultadosSegment,
  pageCountFor,
  planArchiveNode,
  planArchiveTree,
  remainingDimensions,
  safeMunicipioSegment,
  type ArchiveCountSource,
  type ArchiveDimension,
  type ArchiveNode,
} from './archive-partitions';
import { ARCHIVE_PAGE_SIZE } from '../registro/archive-paging';
import { TIPO_SLUGS } from './slugs';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

/** Build a count source from an explicit list of (node-key → count) rows. */
type Row = { muni: string; tipo: string; anio: number; outcome: string };
function sourceOf(rows: readonly Row[]): ArchiveCountSource {
  const matches = (n: ArchiveNode, r: Row) =>
    (n.muni === undefined || n.muni === r.muni) &&
    (n.tipo === undefined || n.tipo === r.tipo) &&
    (n.anio === undefined || n.anio === r.anio) &&
    (n.outcome === undefined || n.outcome === r.outcome);
  return {
    total: (n) => rows.filter((r) => matches(n, r)).length,
    children: (n, dim: ArchiveDimension) => {
      const by = new Map<string, number>();
      for (const r of rows) {
        if (!matches(n, r)) continue;
        const k = dim === 'municipio' ? r.muni : dim === 'tipo' ? r.tipo : String(r.anio);
        by.set(k, (by.get(k) ?? 0) + 1);
      }
      return [...by].map(([key, total]) => ({ key, total }));
    },
  };
}
function mkRows(n: number, f: (i: number) => Partial<Row>): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    muni: 'a', tipo: 'judicial', anio: 2024, outcome: 'adjudicadas', ...f(i),
  }));
}

// --- constants ------------------------------------------------------------
check('capacity is page size x max pages', ARCHIVE_NODE_CAPACITY === ARCHIVE_PAGE_SIZE * ARCHIVE_MAX_PAGES);
check('max pages is 10 (Dennis 2026-08-12)', ARCHIVE_MAX_PAGES === 10);

// --- 1. cap boundary ------------------------------------------------------
check('exactly capacity => exactly max pages, no split',
  pageCountFor(ARCHIVE_NODE_CAPACITY) === ARCHIVE_MAX_PAGES);
check('capacity+1 still reports max pages (never 11)',
  pageCountFor(ARCHIVE_NODE_CAPACITY + 1) === ARCHIVE_MAX_PAGES);
check('a million rows still reports max pages',
  pageCountFor(1_000_000) === ARCHIVE_MAX_PAGES);
check('zero rows => zero pages', pageCountFor(0) === 0);

{
  // 240 rows across 2 towns: fits, so it must NOT split even though it could.
  const at = planArchiveNode({ prov: 'madrid' },
    sourceOf(mkRows(ARCHIVE_NODE_CAPACITY, (i) => ({ muni: i % 2 ? 'a' : 'b' }))));
  check('at capacity: no split', at.splitDimension === null && at.children.length === 0);
  check('at capacity: 10 pages, 9 /pagina URLs', at.pages === 10 && at.pagePaths.length === 9);
  check('at capacity: not capped', !at.capped && at.unreachableRows === 0);

  // 241 rows: the first row that must push work onto the ladder.
  const over = planArchiveNode({ prov: 'madrid' },
    sourceOf(mkRows(ARCHIVE_NODE_CAPACITY + 1, (i) => ({ muni: i % 2 ? 'a' : 'b' }))));
  check('capacity+1: splits on the first rung', over.splitDimension === 'municipio');
  check('capacity+1: emits both towns', over.children.length === 2);
  check('capacity+1: still renders its own 10 pages', over.pages === 10);
  check('capacity+1: not reported as capped (children cover it)', !over.capped);
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
    stuck.unreachableRows === 1000 - ARCHIVE_NODE_CAPACITY);
  check('exhausted ladder still caps pages at 10', stuck.pages === ARCHIVE_MAX_PAGES);
  check('exhausted ladder reports all three skipped rungs',
    stuck.skippedDimensions.length === 3);

  // A fully-specified node has no rungs left by construction.
  check('leaf node has no remaining dimensions',
    remainingDimensions({ prov: 'm', muni: 'a', tipo: 'judicial', anio: 2024 }).length === 0);
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
check('escape mirrors the slug-v2 prefix precedent',
  safeMunicipioSegment('notarial') === 'municipio-notarial' && safeMunicipioSegment('getafe') === 'getafe');

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

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll archive-partitions tests passed.');
