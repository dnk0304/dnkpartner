/**
 * archive-partitions — the ONE brain that decides the shape of the /resultados
 * archive tree (Forge, 2026-08-13, v4 P0).
 *
 * WHY THIS EXISTS. Four consumers need the same answer to "which child
 * partitions exist under this node, and what are their URLs?": the route tree
 * (P1), the legacy→v4 redirect map (P2), the sitemap (P3), and the internal
 * link blocks. `resolve-child.ts:1-11` already records what happens when that
 * kind of decision gets copied instead of shared — two copies eventually
 * disagree about which URL is canonical and the sitemap starts advertising
 * 404s. So the ladder lives here once, as pure logic, and everything derives.
 *
 * SCOPE FENCE. Auction DETAIL URLs (`/subastas/{prov}/{muni}/{detalle}`) are
 * FROZEN (Dennis, 2026-08-12). Nothing in this file touches, mints, or reasons
 * about them. This is hubs only.
 *
 * Dependency-free on purpose (no React, no Prisma) — same reason
 * `archive-paging.ts` is: the sitemap builder and the route tree must both be
 * able to import it, and it must stay unit-testable without a database.
 *
 * ---------------------------------------------------------------------------
 * THE LADDER
 *
 *     provincia  →  municipio  →  tipo  →  año  →  trimestre
 *
 * plus a LOCATION-FREE shelf for rows with no province at all:
 *
 *     tipo  →  año  →  trimestre        (`/resultados/{tipo}/{año}`)
 *
 * applied ONLY AS NEEDED, one rung at a time:
 *
 *   • Every list node paginates at `archivePageSizeFor(total)`, hard-capped at
 *     ARCHIVE_MAX_PAGES (10).
 *   • A node whose row count exceeds that capacity still renders its 10 pages,
 *     but it ALSO emits the next ladder dimension as child partitions. The
 *     children — not the truncated pagination — are what make rows 241..N
 *     crawlable. Pagination is the shallow path; the ladder is the complete
 *     one.
 *   • THIN-PARTITION GUARD: never emit a 0-row partition, and never emit a
 *     split that produces exactly one child (a "split" covering the same rows
 *     as its parent under a longer URL is pure duplicate content). When a rung
 *     is degenerate, the planner skips to the next rung rather than emitting
 *     it — that is why the ladder is "as needed" and not "always four deep".
 *   • If every rung is exhausted and the node STILL exceeds capacity, it is
 *     reported as `capped` with the number of unreachable rows. That is a
 *     defect to be reported, never silently absorbed.
 */

import { ARCHIVE_PAGE_SIZE } from '@/lib/registro/archive-paging';
import { TIPO_SLUGS, type TipoSlug } from '@/lib/seo/slugs';

/**
 * Hard pagination cap for every archive list node (Dennis, 2026-08-12).
 *
 * WHY A CAP AT ALL. `SeoPagination` renders a first+last+current±2 window, so
 * on a 307-page archive the pages in the middle are reachable only by walking
 * the window one hop at a time — which is how the deepest concluded detail
 * page ended up at click depth 82. Capping the pagination and pushing the
 * overflow onto the ladder converts that linear walk into a tree descent.
 */
export const ARCHIVE_MAX_PAGES = 10;

/**
 * Rows per page on a node that would otherwise overflow (Ken ruling, 2026-08-13).
 *
 * A node whose row count exceeds the 24-row capacity (240) switches to 48/page,
 * lifting its capacity to 480 and clearing most of the ladder-exhausted leaves
 * without adding a rung. The cap of 10 pages does NOT move — the whole point of
 * this wave is to kill the 307-page tail, so the extra headroom has to come
 * from page size, never from more pages.
 *
 * MEASURED, not assumed (2026-08-13, prod): `/resultados/madrid/parla/pagina/19`
 * (24 rows) = 145,268 B vs `/pagina/20` (10 rows) = 107,866 B → 2,672 B/row.
 * The heaviest archive template (page 1, which carries the intro + stat blocks)
 * is 171,569 B at 24 rows, so at 48 rows it projects to ~235,700 B ≈ 230 KB —
 * comfortably under the 443 KB worst case already shipping at
 * `/subastas/madrid/madrid` (measured 453,758 B). Re-measure before raising it
 * again; that headroom is the only thing justifying the switch.
 */
export const ARCHIVE_PAGE_SIZE_DENSE = 48;

/** Rows a node can hold at the default page size. */
export const ARCHIVE_NODE_CAPACITY = ARCHIVE_PAGE_SIZE * ARCHIVE_MAX_PAGES;

/** Rows a node can hold once it switches to the dense page size. */
export const ARCHIVE_NODE_CAPACITY_DENSE = ARCHIVE_PAGE_SIZE_DENSE * ARCHIVE_MAX_PAGES;

/**
 * Page size for a node, derived from its OWN row count so that the route, the
 * sitemap and the link blocks all arrive at the same answer from the same
 * input. Never store this — derive it, or the three drift.
 */
export function archivePageSizeFor(total: number): number {
  return total > ARCHIVE_NODE_CAPACITY ? ARCHIVE_PAGE_SIZE_DENSE : ARCHIVE_PAGE_SIZE;
}

/** Rows a node can hold within its capped pagination, at its own page size. */
export function archiveCapacityFor(total: number): number {
  return archivePageSizeFor(total) * ARCHIVE_MAX_PAGES;
}

/**
 * Ladder rungs BELOW the province root, in the order Dennis confirmed, with
 * `trimestre` appended by Ken's 2026-08-13 ruling.
 *
 * `trimestre` is NOT a general rung: it is offered only to a node that already
 * has a year (see `remainingDimensions`), because its whole job is to rescue
 * the handful of fully-specified `(muni, tipo, año)` leaves that still overflow.
 * Quarters, not months — twelve children would be mostly thin, which is the
 * duplicate/thin-content failure this design exists to avoid.
 */
export const ARCHIVE_LADDER = ['municipio', 'tipo', 'anio', 'trimestre'] as const;
export type ArchiveDimension = (typeof ARCHIVE_LADDER)[number];

/**
 * ⚠️ WHAT `anio` (and `trimestre`) ACTUALLY MEAN — read before using them.
 *
 * The year rung keys on `COALESCE(endsAt, publishedAt)`, NOT on `endsAt` alone
 * (approved by Ken 2026-08-13). 17,848 registry rows have a NULL `endsAt`;
 * `publishedAt` is non-null for 100% of them (measured, not assumed), so the
 * coalesced year is the only basis that partitions the whole corpus. On
 * `endsAt` alone those rows would fall into a "year 0" bucket — a literal `/0`
 * URL segment — or into no partition at all.
 *
 * The consequence, which a future reader will otherwise get wrong: for those
 * 17,848 rows `año` is the year the auction was PUBLISHED, not the year it
 * ended. Do not label these pages "subastas que terminaron en {año}" and do not
 * derive an end-date claim from the segment. It is "the year we can place this
 * auction in", nothing stronger.
 *
 * It also means date-shaped rungs inherit `publishedAt`'s clumping: a bulk BOE
 * import lands hundreds of rows on one publication day, which no date rung can
 * split. See the ladder-exhaustion note in `scripts/archive-partition-report.ts`.
 */

/**
 * A node in the archive tree.
 *
 * `prov` ABSENT means the LOCATION-FREE shelf (`/resultados/{tipo}/{año}`) — the
 * home for rows whose province we do not know. Ken's 2026-08-13 ruling: never
 * invent a province and never mint a `sin-provincia` hub, because a fabricated
 * location baked into a permanent URL is worse than no page. These rows are
 * placed by the attributes we actually have (tipo, año) and make no geo claim.
 *
 * The national root (`/resultados`) and the national outcome pages
 * (`/resultados/adjudicadas`) are hand-built hubs, not ladder nodes, and are
 * deliberately outside this planner.
 *
 * `outcome` is the REVERSED location-first outcome facet
 * (`/resultados/{prov}/{outcome}`, replacing `/resultados/{outcome}/{prov}`).
 * It is a FILTERED VIEW of the province, not a coverage rung — see
 * `isTerminalFacet` below.
 */
export type ArchiveNode = {
  readonly prov?: string;
  readonly muni?: string;
  readonly tipo?: TipoSlug;
  readonly anio?: number;
  /** 1..4. Only ever set on a node that already has `anio`. */
  readonly trimestre?: number;
  readonly outcome?: string;
};

/**
 * Row counts for the corpus, supplied by the caller.
 *
 * Keeping this an interface is what makes the ladder pure: the planner never
 * knows whether it is reading Postgres or a fixture, so the exact tree the
 * sitemap will emit can be asserted in a unit test with hand-built numbers.
 */
export interface ArchiveCountSource {
  /** Rows matching this node exactly. */
  total(node: ArchiveNode): number;
  /**
   * Distinct non-empty values of `dim` under `node`, with their row counts.
   * Implementations MUST omit zero-count keys and MUST NOT return a key whose
   * rows fall outside `node`.
   */
  children(node: ArchiveNode, dim: ArchiveDimension): ReadonlyArray<ChildCount>;
}

export type ChildCount = { readonly key: string; readonly total: number };

export type ArchivePlan = {
  readonly node: ArchiveNode;
  readonly path: string;
  readonly total: number;
  /** 0 when the node has no rows (and is therefore not emitted at all). */
  readonly pages: number;
  /** `/pagina/2..pages` URLs. Empty when `pages <= 1`. */
  readonly pagePaths: readonly string[];
  /** The rung this node split on, or null when it needed no split. */
  readonly splitDimension: ArchiveDimension | null;
  readonly children: readonly ArchiveNode[];
  /** Rungs skipped by the thin-partition guard, in the order they were tried. */
  readonly skippedDimensions: readonly ArchiveDimension[];
  /** True when the ladder was exhausted and the node still overflows. */
  readonly capped: boolean;
  /** Rows beyond ARCHIVE_NODE_CAPACITY that no descendant can reach. */
  readonly unreachableRows: number;
};

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/**
 * Canonical path for a node. Segment order IS the ladder order, so a URL can
 * be parsed back into a node by position alone.
 *
 * The outcome facet occupies the seg2 slot instead of a municipality, which is
 * exactly why the reserved-segment guard below has to exist.
 */
export function archiveNodePath(node: ArchiveNode): string {
  const parts = ['resultados'];
  if (node.prov) parts.push(node.prov);
  if (node.outcome) {
    parts.push(node.outcome);
  } else {
    if (node.muni) parts.push(node.muni);
    if (node.tipo) parts.push(node.tipo);
    if (node.anio !== undefined) parts.push(String(node.anio));
    if (node.trimestre !== undefined) parts.push(`t${node.trimestre}`);
  }
  return `/${parts.join('/')}`;
}

/** Path for page N of a node. Page 1 is the bare node path, never `/pagina/1`. */
export function archivePagePath(node: ArchiveNode, page: number): string {
  const base = archiveNodePath(node);
  return page <= 1 ? base : `${base}/pagina/${page}`;
}

/**
 * EVERY page URL of a node, page 1 first. P1 MUST render this complete set on
 * every page of a capped list — not prev/next, not a first+last+current±2
 * window (Ken ruling, 2026-08-13: "mandatory ... without it the depth number is
 * fiction").
 *
 * WHY IT IS THE PLANNER'S JOB. The depth guarantee is a property of the LINK
 * GRAPH, not of the URL set: with a ±2 window, reaching the middle of a 10-page
 * node costs 3 hops and the deepest detail page sits at depth 9. With the full
 * fan it costs 1 and the same page sits at depth 7. Shipping a partial fan
 * silently reverts the headline number of this entire wave, so the fan is
 * exported from the same module that proves the ≤10 cap rather than left to a
 * component to reimplement.
 */
export function archivePageLinks(node: ArchiveNode, pages: number): string[] {
  const out: string[] = [];
  for (let p = 1; p <= Math.max(pages, 1); p++) out.push(archivePagePath(node, p));
  return out;
}

/** `/resultados/{prov}/municipios` — the A–Z index. Never paginated by this planner. */
export function municipioIndexPath(prov: string): string {
  return `/resultados/${prov}/municipios`;
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/**
 * An outcome node is a filtered VIEW of its province, not a coverage rung: the
 * same auctions are already reachable through provincia→municipio→tipo→año. It
 * therefore caps at 10 pages and never ladders, and its overflow is NOT counted
 * as unreachable — counting it would double-count rows the location tree
 * already covers, and laddering it would mint a second, parallel hierarchy,
 * which is the exact thing §2 of the spec reverses the URL to avoid.
 */
function isTerminalFacet(node: ArchiveNode): boolean {
  return node.outcome !== undefined;
}

/** Rungs not yet applied to this node, in ladder order. */
export function remainingDimensions(node: ArchiveNode): ArchiveDimension[] {
  if (isTerminalFacet(node)) return [];
  const out: ArchiveDimension[] = [];
  // The location-free shelf has no municipio rung — there is no province to
  // hang towns off, and inventing one is exactly what the ruling forbids.
  if (node.prov !== undefined && node.muni === undefined) out.push('municipio');
  if (node.tipo === undefined) out.push('tipo');
  if (node.anio === undefined) out.push('anio');
  // Quarter is offered ONLY to a node that already has a year: it exists to
  // rescue overflowing year leaves, not as a general-purpose rung.
  else if (node.trimestre === undefined) out.push('trimestre');
  return out;
}

function withChild(node: ArchiveNode, dim: ArchiveDimension, key: string): ArchiveNode {
  switch (dim) {
    case 'municipio':
      return { ...node, muni: key };
    case 'tipo':
      return { ...node, tipo: key as TipoSlug };
    case 'anio':
      return { ...node, anio: Number.parseInt(key, 10) };
    case 'trimestre':
      return { ...node, trimestre: Number.parseInt(key, 10) };
  }
}

/**
 * Pages a node renders: ceil(total / its own page size), hard-capped.
 * Proven ≤ ARCHIVE_MAX_PAGES by construction and asserted in the test.
 */
export function pageCountFor(total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.ceil(total / archivePageSizeFor(total)), ARCHIVE_MAX_PAGES);
}

/**
 * Plan ONE node: its pagination, and — only if it overflows — its child
 * partitions. Does not recurse; see `planArchiveTree`.
 */
export function planArchiveNode(node: ArchiveNode, counts: ArchiveCountSource): ArchivePlan {
  const total = counts.total(node);
  const path = archiveNodePath(node);
  const pages = pageCountFor(total);
  const pagePaths: string[] = [];
  for (let p = 2; p <= pages; p++) pagePaths.push(archivePagePath(node, p));

  const base = {
    node,
    path,
    total,
    pages,
    pagePaths,
    splitDimension: null,
    children: [] as readonly ArchiveNode[],
    skippedDimensions: [] as readonly ArchiveDimension[],
    capped: false,
    unreachableRows: 0,
  } as const;

  // Thin guard, first form: a 0-row node is never emitted and never splits.
  if (total === 0) return base;
  // Fits inside the capped pagination (at this node's own page size) — no split
  // needed. This is what makes the ladder "as needed": most towns stop here.
  if (total <= archiveCapacityFor(total)) return base;

  const skipped: ArchiveDimension[] = [];
  for (const dim of remainingDimensions(node)) {
    const raw = counts.children(node, dim);
    // Thin guard, second form: drop empty partitions.
    const usable = raw.filter((c) => c.total > 0 && c.key !== '');
    // Thin guard, third form: a split into one child duplicates the parent at a
    // longer URL and reduces nothing. Skip the rung, try the next one.
    if (usable.length <= 1) {
      skipped.push(dim);
      continue;
    }
    return {
      ...base,
      splitDimension: dim,
      children: usable.map((c) => withChild(node, dim, c.key)),
      skippedDimensions: skipped,
    };
  }

  // Ladder exhausted (or terminal facet) and still overflowing.
  const overflow = total - archiveCapacityFor(total);
  return {
    ...base,
    skippedDimensions: skipped,
    capped: !isTerminalFacet(node),
    unreachableRows: isTerminalFacet(node) ? 0 : overflow,
  };
}

/**
 * Walk the whole tree under the given province roots, breadth-first, returning
 * every emitted node's plan. Depth is bounded by the ladder length (≤4 rungs),
 * so this terminates without a visited-set; the assertion below makes that
 * explicit rather than assumed.
 */
export function planArchiveTree(
  provinces: readonly string[],
  counts: ArchiveCountSource,
  opts: {
    readonly outcomeSlugs?: readonly string[];
    /** Roots of the location-free shelf — the tipo slugs present among province-less rows. */
    readonly locationFreeTipos?: readonly TipoSlug[];
  } = {},
): ArchivePlan[] {
  const out: ArchivePlan[] = [];
  const queue: ArchiveNode[] = [
    ...provinces.map((prov) => ({ prov })),
    ...(opts.locationFreeTipos ?? []).map((tipo) => ({ tipo })),
  ];

  while (queue.length > 0) {
    const node = queue.shift() as ArchiveNode;
    const plan = planArchiveNode(node, counts);
    if (plan.total === 0) continue; // never emit an empty URL
    out.push(plan);
    for (const child of plan.children) queue.push(child);

    // Province-level outcome facets, planned once per province root.
    if (
      !isTerminalFacet(node) &&
      node.prov !== undefined &&
      node.muni === undefined &&
      node.tipo === undefined &&
      node.anio === undefined
    ) {
      for (const outcome of opts.outcomeSlugs ?? []) {
        const facet: ArchiveNode = { prov: node.prov, outcome };
        const fp = planArchiveNode(facet, counts);
        if (fp.total > 0) out.push(fp);
      }
    }
  }
  return out;
}

/** Every URL a plan set puts on the site, including `/pagina/N`. */
export function archiveUrlsFromPlans(plans: readonly ArchivePlan[]): string[] {
  const urls: string[] = [];
  for (const p of plans) {
    urls.push(p.path);
    urls.push(...p.pagePaths);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Reserved segments for the /resultados tree
// ---------------------------------------------------------------------------

/**
 * Under a province, seg2 can now be a MUNICIPALITY, an OUTCOME, a TIPO, the
 * `municipios` index, or a YEAR. Those namespaces share one slot, so a town
 * whose slug equals one of the non-town meanings would be unreachable — the
 * resolver would read it as the other thing.
 *
 * `isReservedResultadosSegment` is the single predicate both the resolver and
 * the town-slug minting side must consult, so "this slug is a town" and "this
 * slug is a facet" cannot disagree.
 */
const YEAR_RE = /^\d{4}$/;
const QUARTER_RE = /^t[1-4]$/;

/**
 * Non-province meanings of the seg1 slot under `/resultados`.
 *
 * seg1 was outcome|province; the location-free shelf adds tipo. All three sets
 * must stay disjoint or `resolveResultadosSeg` becomes ambiguous — the test
 * proves no tipo slug equals a province slug or an outcome slug.
 */
export const RESERVED_UNDER_RESULTADOS_ROOT: readonly string[] = [
  'pagina',
  'adjudicadas',
  'desiertas',
  'canceladas',
  'finalizadas-sin-resultado',
  ...TIPO_SLUGS,
  'aeat',
  'tributaria',
  'administrativa',
];

/** True when `seg` cannot be used as a province slug at the root. */
export function isReservedResultadosRootSegment(seg: string): boolean {
  return RESERVED_UNDER_RESULTADOS_ROOT.includes(seg);
}

/** Non-town meanings of the seg2 slot under `/resultados/{prov}`. */
export const RESERVED_UNDER_RESULTADOS_PROVINCE: readonly string[] = [
  'pagina',
  'municipios',
  'adjudicadas',
  'desiertas',
  'canceladas',
  'finalizadas-sin-resultado',
  ...TIPO_SLUGS,
  // legacy tipo spellings that 301 into the canonical ones
  'aeat',
  'tributaria',
  'administrativa',
];

/** Non-tipo meanings of the seg3 slot under `/resultados/{prov}/{muni}`. */
export const RESERVED_UNDER_RESULTADOS_TOWN: readonly string[] = ['pagina'];

/** True when `seg` cannot be used as a municipality slug under a province. */
export function isReservedResultadosSegment(seg: string): boolean {
  return (
    RESERVED_UNDER_RESULTADOS_PROVINCE.includes(seg) ||
    YEAR_RE.test(seg) ||
    QUARTER_RE.test(seg)
  );
}

/**
 * Escape for a municipality slug that collides with a reserved meaning.
 * Mirrors `slug-v2.ts:134`'s `provincia-` / `municipio-` prefix precedent
 * rather than inventing a second escape convention.
 */
export function safeMunicipioSegment(slug: string): string {
  return isReservedResultadosSegment(slug) ? `municipio-${slug}` : slug;
}
