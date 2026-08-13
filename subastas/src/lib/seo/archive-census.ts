/**
 * archive-census — turn a flat corpus ROLLUP into the `ArchiveCountSource` the
 * planner eats (Forge, 2026-08-13, v4 P3).
 *
 * WHY THIS EXISTS. `archive-partitions.ts` is the one brain that decides the
 * SHAPE of the tree, and it is deliberately pure — it takes counts and returns
 * plans. Something still has to turn "195,408 auction rows" into those counts,
 * and until P3 that something existed in exactly one place: 80 lines inside
 * `scripts/archive-partition-report.ts`, a one-shot CSV script.
 *
 * P3 needs the same answer at REQUEST time (the sitemap must advertise the tree
 * the routes actually serve). Copying the indexer into the sitemap is the exact
 * failure `archive-partitions.ts:5-11` was written to prevent — two copies
 * eventually disagree and the sitemap starts advertising 404s. So the indexer
 * moved HERE, pure and dependency-free (no Prisma, no React), and both the
 * report script and the request-time reader call it.
 *
 * ⚠️ PURE ON PURPOSE. Do not import `@/lib/prisma` into this file. The DB read
 * that produces the cells lives in `src/lib/registro/archive-census-read.ts`;
 * this module must stay unit-testable against hand-written cells.
 */

import {
  archiveNodePath,
  archivePagePath,
  archiveUrlsFromPlans,
  municipioIndexPath,
  pageCountForNode,
  planArchiveTree,
  type ArchiveCountSource,
  type ArchiveDimension,
  type ArchiveNode,
  type ChildCount,
} from '@/lib/seo/archive-partitions';
import { HUB_MUNI_PREVIEW } from '@/lib/registro/archive-paging';
import type { TipoSlug } from '@/lib/seo/slugs';

/**
 * One rollup cell: a distinct (province, municipality, tipo, año, trimestre,
 * outcome) combination and how many rows are in it.
 *
 * Slugs, not DB keys — the caller has already mapped province/municipality/type
 * through the slug tables and through `safeMunicipioSegment`, because the URL is
 * what the tree is made of. `prov: ''` means the LOCATION-FREE shelf.
 */
export type ArchiveCell = {
  readonly prov: string;
  readonly muni: string;
  /**
   * The town's RAW slug before `safeMunicipioSegment`, or `''` when the row has
   * no municipality at all. Carried separately from `muni` because the two
   * answer different questions: `muni` is the URL segment (and is the literal
   * `sin-municipio` for province-only rows), while this is "is there a real town
   * here?" — which is what sizes the `/municipios` A–Z index. Counting
   * `sin-municipio` as a town would inflate that index by one per province and
   * could tip a 60-town province over `HUB_MUNI_PREVIEW` into publishing an
   * index page that 307s.
   */
  readonly rawMuni: string;
  readonly tipo: string;
  readonly anio: number;
  readonly qtr: number;
  /** Outcome SLUG (`adjudicadas`, `desiertas`, …) or `''` when unmapped. */
  readonly outcome: string;
  readonly n: number;
};

export interface ArchiveCensus {
  readonly counts: ArchiveCountSource;
  /** Province slugs present in the corpus, sorted — the ladder's roots. */
  readonly provinces: readonly string[];
  /** Total rows indexed (sum of `n`) — the corpus size the tree was sized from. */
  readonly rows: number;
}

const DIMS = ['municipio', 'tipo', 'anio', 'trimestre'] as const;

function nodeKey(n: ArchiveNode): string {
  return `${n.prov ?? ''}|${n.muni ?? ''}|${n.tipo ?? ''}|${n.anio ?? ''}|${n.trimestre ?? ''}|${n.outcome ?? ''}`;
}

/**
 * Index every node shape the ladder can reach.
 *
 * ⭐ ALL 8 SUBSETS OF {muni, tipo, anio}, not just the four full prefixes. The
 * thin-partition guard makes the planner SKIP degenerate rungs, so it
 * legitimately asks for e.g. `children({prov, muni}, 'anio')` on a town whose
 * tipo rung was degenerate. Indexing only the prefixes returns an empty child
 * list there, which the planner correctly reads as "nothing to split by" and
 * reports as a FALSE ladder exhaustion — i.e. as unreachable rows that are in
 * fact perfectly reachable. That bug is why this loop masks over 16 shapes
 * instead of walking a prefix chain.
 *
 * `trimestre` never appears without `anio` (it is only offered after a year
 * rung), so those shapes are unreachable and are not indexed.
 */
export function indexArchiveCells(cells: readonly ArchiveCell[]): ArchiveCensus {
  const totals = new Map<string, number>();
  const childIdx = new Map<string, Map<string, number>>();
  let rows = 0;

  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  const bumpChild = (key: string, dim: ArchiveDimension, val: string, n: number) => {
    const k = `${key}#${dim}`;
    let m = childIdx.get(k);
    if (!m) {
      m = new Map();
      childIdx.set(k, m);
    }
    bump(m, val, n);
  };

  for (const c of cells) {
    rows += c.n;
    const val = {
      municipio: c.muni,
      tipo: c.tipo,
      anio: String(c.anio),
      trimestre: String(c.qtr),
    } as const;
    for (let mask = 0; mask < 16; mask++) {
      const has = DIMS.map((_, i) => Boolean(mask & (1 << i)));
      if (has[3] && !has[2]) continue; // trimestre is never offered before a year
      const k = `${c.prov}|${has[0] ? c.muni : ''}|${has[1] ? c.tipo : ''}|${has[2] ? c.anio : ''}|${has[3] ? c.qtr : ''}|`;
      bump(totals, k, c.n);
      for (let i = 0; i < DIMS.length; i++) {
        if (has[i]) continue;
        if (DIMS[i] === 'trimestre' && !has[2]) continue;
        bumpChild(k, DIMS[i], val[DIMS[i]], c.n);
      }
    }
    // The outcome facet is a FILTERED VIEW of the province, not a ladder rung,
    // so it is indexed as its own leaf key and never as a child dimension.
    if (c.outcome) bump(totals, `${c.prov}|||||${c.outcome}`, c.n);
  }

  const counts: ArchiveCountSource = {
    total: (n) => totals.get(nodeKey(n)) ?? 0,
    children: (n, dim): ChildCount[] =>
      [...(childIdx.get(`${nodeKey(n)}#${dim}`) ?? new Map<string, number>())].map(
        ([key, total]) => ({ key, total }),
      ),
  };

  const provinces = [...new Set(cells.map((c) => c.prov))].filter(Boolean).sort();

  return { counts, provinces, rows };
}

// ---------------------------------------------------------------------------
// The complete v4 URL set
// ---------------------------------------------------------------------------

/**
 * Depth-shallowest, then lexicographic. `/pagina/N` sorts NUMERICALLY within its
 * own node — a plain string sort puts page 10 before page 2, which is harmless
 * for correctness but makes every diff of this list unreadable.
 *
 * ⭐ THIS ORDER IS A CONTRACT. Two mechanisms depend on it:
 *
 *  1. CHUNKING — the aggregation band is sliced into 20k children by offset. If
 *     the order wobbled between requests, URLs would migrate between children on
 *     every fetch and Google would see the whole band churn.
 *  2. THE RAMP — Ken publishes the band one child at a time, and "children are
 *     only ever added, never removed" is only true if raising the knob APPENDS.
 *     A comparator that depended on ROW COUNTS would reshuffle overnight as
 *     auctions conclude, pushing already-submitted URLs past the published
 *     boundary — silently de-indexing pages we just asked Google to crawl. This
 *     comparator is a total order over the URL STRING alone, so it cannot.
 */
export function compareArchiveUrls(a: string, b: string): number {
  const da = a.split('/').length;
  const db = b.split('/').length;
  if (da !== db) return da - db;
  const ma = /^(.*)\/pagina\/(\d+)$/.exec(a);
  const mb = /^(.*)\/pagina\/(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface ArchiveUrlSet {
  /** Every `/resultados` path the v4 tree serves, in the stable order above. */
  readonly urls: readonly string[];
  /** Rows placed by the census — the corpus the tree was sized from. */
  readonly rows: number;
}

/**
 * Cells → every `/resultados` URL the v4 tree puts on the site.
 *
 * The single derivation, shared by the request-time reader
 * (`registro/archive-census-read.ts`) and the offline reports. Generated from
 * the planner, never from a hand-maintained list (P3 brief §2), which is also
 * why the superseded shapes (`/resultados/{outcome}/{prov}`,
 * `municipios/pagina/{n}` under the old cap, `pagina/{n>10}`) cannot appear
 * here: nothing produces them.
 */
export function archiveUrlSetFromCells(
  cells: readonly ArchiveCell[],
  opts: {
    readonly outcomeSlugs: readonly string[];
    readonly locationFreeTipos: readonly TipoSlug[];
  },
): ArchiveUrlSet {
  const census = indexArchiveCells(cells);
  const plans = planArchiveTree(census.provinces, census.counts, {
    outcomeSlugs: opts.outcomeSlugs,
    locationFreeTipos: opts.locationFreeTipos,
  });

  const urls = new Set<string>(archiveUrlsFromPlans(plans));

  // The national hubs are hand-built pages, not ladder nodes, so the planner
  // does not produce them — but they are the tree's roots and must be advertised.
  urls.add('/resultados');
  for (const s of opts.outcomeSlugs) urls.add(`/resultados/${s}`);

  // ⭐ EVERY REGISTRY TOWN, whether or not the planner split its province.
  //
  // MEASURED, and it is the one real defect P3 found (Forge, 2026-08-13). The
  // planner splits "as needed": a province whose rows fit inside its own
  // pagination never emits a `municipio` rung at all, so `planArchiveTree` does
  // not produce hubs for its towns. 167 town hubs that are in TODAY's sitemap —
  // all of Soria, Ceuta and Melilla — came out of the v4 plan set for exactly
  // that reason.
  //
  // They do NOT 301. Traced through the live route: `resolve-child.ts:82-109`
  // resolves the town by DB lookup and never consults the planner, so the page
  // is a 200; `generateMetadata` in `resultados/[seg1]/[seg2]/page.tsx` gives it
  // a SELF canonical and `robots: total > 0 ? 'index,follow' : …` — identical
  // with the switch on or off. Dropping them from the sitemap would therefore
  // un-advertise 167 live, indexable, self-canonical pages that Google already
  // has, which is precisely the silent disappearance the P3 brief §5.4 forbids
  // and the opposite of the ramp's "added, never removed" doctrine.
  //
  // Derived from the corpus, NOT hand-listed: the condition below is the same
  // one the page's own index gate uses (`total > 0`), so the sitemap town set
  // and the indexable town set cannot drift. Pages are capped by
  // `pageCountForNode`, so nothing beyond the 10-page cap is advertised.
  const townTotals = new Map<string, number>();
  for (const c of cells) {
    if (!c.prov || !c.rawMuni) continue;
    const k = `${c.prov}/${c.muni}`;
    townTotals.set(k, (townTotals.get(k) ?? 0) + c.n);
  }
  for (const [k, total] of townTotals) {
    if (total <= 0) continue;
    const [prov, muni] = k.split('/');
    const node: ArchiveNode = { prov, muni };
    urls.add(archiveNodePath(node));
    const pages = pageCountForNode(node, total);
    for (let p = 2; p <= pages; p++) urls.add(archivePagePath(node, p));
  }

  // The /municipios A–Z index — the BARE index only.
  //
  // ⛔ NO `/municipios/pagina/{n}`. v4 DE-PAGINATES this index: P2 retires every
  // `/resultados/{prov}/municipios/pagina/{n}` with a 308 onto the bare index
  // (asserted in `verify-v4-redirects.sh`, "the municipality index
  // de-paginates"). Emitting them here put a 301 in the sitemap — caught by the
  // lit run of `verify-v4-sitemap.sh`, not by reading the code, which is the
  // argument for running the assertions in both switch states.
  //
  // ⛔ And a province at or under HUB_MUNI_PREVIEW towns has NO index at all:
  // `/municipios` 307s back to the hub there. Same rule, same reason — a
  // redirect in a sitemap is a wasted crawl (P3 brief §2).
  const muniSlugsByProv = new Map<string, Set<string>>();
  for (const c of cells) {
    if (!c.prov || !c.rawMuni) continue;
    let s = muniSlugsByProv.get(c.prov);
    if (!s) {
      s = new Set();
      muniSlugsByProv.set(c.prov, s);
    }
    s.add(c.rawMuni);
  }
  for (const [prov, slugs] of muniSlugsByProv) {
    if (slugs.size <= HUB_MUNI_PREVIEW) continue;
    urls.add(municipioIndexPath(prov));
  }

  return { urls: [...urls].sort(compareArchiveUrls), rows: census.rows };
}
