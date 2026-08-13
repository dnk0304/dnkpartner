/**
 * archive-legacy-redirects — the PURE half of the v4 P2 redirect map.
 *
 * WHAT MOVES, AND WHAT DOES NOT
 * -----------------------------
 * v4 does not rename the archive so much as it reverses one facet and caps the
 * pagination. Exactly three legacy shapes therefore need a permanent redirect:
 *
 *   /resultados/{outcome}/{prov}[/pagina/{n}]  → /resultados/{prov}/{outcome}[…]
 *   /resultados/{prov}/municipios/pagina/{n}   → /resultados/{prov}/municipios
 *   …/pagina/{n} where n is past the v4 page cap → the PARTITION holding row n
 *
 * ⭐ AND ONE SHAPE THAT DELIBERATELY DOES NOT REDIRECT: `/resultados/{prov}/
 * pagina/{n}` and `/resultados/{prov}/{muni}/pagina/{n}` for n WITHIN the v4
 * page count. Those URLs exist in both grammars, so under v4 they simply MEAN
 * the v4 page and are served, not redirected.
 *
 * That is not a convenience — it is the only chain-free reading available. The
 * legacy page size is 24 and a v4 node's is 24, 48 or up to 84, so "map old page
 * n onto the v4 page holding its first row" would send `/pagina/5` → `/pagina/3`
 * → `/pagina/2` → `/pagina/1`: every hop is itself a legacy URL that the same
 * rule would rewrite again. A redirect rule whose TARGET matches its own SOURCE
 * pattern is a chain generator, and §4.1 of the brief makes one hop the release
 * gate. Keeping the in-range pages as identity is what makes max chain length 1
 * a property of the design rather than something to be measured and hoped for.
 *
 * The visible consequence at flip time is a CONTENT shift, not a URL shift: on
 * an overflowing node `/pagina/2` starts at row 49 instead of row 25. That is
 * inherent to the v4 page-size ruling (P0), same URL, still 200, still indexed.
 *
 * Dependency-free on purpose (no Prisma, no React) so the decision can be unit
 * tested with hand-built numbers; the runtime half that needs row counts and the
 * partition descent lives in `@/lib/registro/archive-legacy-target.ts`.
 */

/**
 * Rows per page in the LEGACY (pre-v4) archive pagination.
 *
 * Pinned as its own constant rather than imported from `archive-paging`: this
 * number is history — it is what the URLs Google already crawled were built
 * with — and it must not follow `ARCHIVE_PAGE_SIZE` if that ever changes. If it
 * did, the row offset we probe for the overflow target would silently start
 * pointing at a different row than the old URL ever showed.
 */
import type { ArchiveNode } from '@/lib/seo/archive-partitions';

export const LEGACY_ARCHIVE_PAGE_SIZE = 24;

export type LegacyPageMapping =
  /** The page number survives v4 unchanged; serve (or target) it as-is. */
  | { readonly kind: 'page'; readonly page: number }
  /**
   * Past the v4 10-page cap. There is no page URL to send this to, so the
   * caller must find the PARTITION that now holds the rows this page showed —
   * `rowOffset` is the 0-based index of that page's FIRST row in the node's
   * ordering, which is the only fact about the old page that survives.
   */
  | { readonly kind: 'overflow'; readonly rowOffset: number };

/**
 * Where does legacy page `oldPage` of a node land under v4?
 *
 * `newPages` is the node's v4 page count (`pageCountForNode`), always ≤ 10.
 */
export function mapLegacyArchivePage(oldPage: number, newPages: number): LegacyPageMapping {
  if (oldPage <= newPages) return { kind: 'page', page: oldPage };
  return { kind: 'overflow', rowOffset: (oldPage - 1) * LEGACY_ARCHIVE_PAGE_SIZE };
}

/**
 * The node one rung up the ladder — the redirect target of last resort.
 *
 * ⭐ WHY A ZERO-ROW TARGET NEEDS THIS. The planner refuses to emit a zero-row
 * partition, so a v4 node with no rows is a 404. A legacy shape can still
 * resolve to one — `/resultados/adjudicadas/{prov}` renders an empty
 * `noindex,follow` 200 today for a province with no adjudicadas — and 301ing
 * that onto a 404 would break the one gate the brief calls unacceptable: a URL
 * that used to work must not stop working. So an empty target falls back a rung,
 * to the province hub, which always has rows if the province resolved.
 *
 * Reverse ladder order, dropping exactly one dimension: outcome (a facet hangs
 * directly off the province) then trimestre → anio → tipo → muni.
 */
export function archiveParentNode(node: ArchiveNode): ArchiveNode {
  const { outcome, trimestre, anio, tipo, muni, muniDbName, ...rest } = node;
  if (outcome !== undefined) return rest;
  if (trimestre !== undefined) return { ...rest, muni, muniDbName, tipo, anio };
  if (anio !== undefined) return { ...rest, muni, muniDbName, tipo };
  if (tipo !== undefined) return { ...rest, muni, muniDbName };
  if (muni !== undefined) return rest;
  return node;
}
