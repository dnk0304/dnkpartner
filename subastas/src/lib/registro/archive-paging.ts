/**
 * /resultados archive paging primitives (Forge, 2026-08-12).
 *
 * Deliberately dependency-free (no React, no Prisma) so BOTH the page tree and
 * `sitemap-entries.ts` can import it. The sitemap's page-count arithmetic
 * (`ceil(total / ARCHIVE_PAGE_SIZE)`) MUST use the same constant the routes page
 * by — if they drift, the sitemap advertises `/pagina/N` URLs the route answers
 * with a 404, which is the single worst thing a sitemap can contain.
 */

/** Rows per archive page. Single source of truth for routes + sitemap + hubs. */
export const ARCHIVE_PAGE_SIZE = 24;

/**
 * Municipality links per `/resultados/{prov}/municipios[/pagina/N]` page.
 *
 * WHY 200. The province hub rendered `munis.slice(0, 60)`, which left 8,673 of
 * 11,677 town archives (74%, 50 of 52 provinces) with NO inbound internal link
 * anywhere on the site — sitemap-present, link-orphaned, i.e. the textbook
 * *Discovered – currently not indexed* profile. Inlining the full list instead
 * was measured and rejected: Barcelona has 839 municipalities and the chip
 * markup took `/resultados/barcelona` from 274 KB to 671 KB of raw HTML (gzip
 * +11.7 KB, but raw DOM is what costs mobile parse time).
 *
 * 200 is chosen against the measured distribution (max 839, p95 444):
 *   • worst case ceil(839/200) = 5 index pages — so `SeoPagination`'s
 *     first+last+current±2 window never needs an ellipsis on page 1, and the
 *     province hub can afford to link EVERY index page directly (<=5 anchors).
 *     That is what keeps the deepest town archive at click depth 4, not 5+.
 *   • 200 chips is ~1/4 of the Barcelona inline case, on a page that carries no
 *     charts and no client archive island.
 *
 * Lowering this raises the page count per province and can push the window past
 * 5, which reintroduces an ellipsis and buries an index page. Re-check the
 * depth proof if you change it.
 */
export const MUNI_INDEX_PAGE_SIZE = 200;

/**
 * Municipality chips rendered inline on the province hub.
 *
 * This is the SAME number that used to be the `slice(0, 60)` truncation; it is
 * now a preview, because everything past it is carried by the `/municipios`
 * index. Kept here rather than in the hub because it is also the predicate for
 * whether that index exists at all:
 *
 *   total <= HUB_MUNI_PREVIEW  → the hub already lists every municipality, so
 *                                the hub IS the index; `/municipios` redirects
 *                                to it (one canonical URL for one list, and no
 *                                orphaned index page nobody links).
 *   total >  HUB_MUNI_PREVIEW  → `/municipios` renders, and the hub links it.
 *
 * Both sides read this constant, so "the hub links it" and "the URL is a 200"
 * cannot disagree — a drift there would either orphan the index page or link a
 * redirect.
 */
export const HUB_MUNI_PREVIEW = 60;

/**
 * Parse a `/pagina/{raw}` segment. Strict: positive integers with no leading
 * zero, so `/pagina/01`, `/pagina/2x` and `/pagina/-1` are 404s rather than
 * duplicate-content aliases of a real page. Mirrors the /subastas parser.
 */
export function parseArchivePage(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}
