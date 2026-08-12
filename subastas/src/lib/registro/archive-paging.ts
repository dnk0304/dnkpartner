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
 * Parse a `/pagina/{raw}` segment. Strict: positive integers with no leading
 * zero, so `/pagina/01`, `/pagina/2x` and `/pagina/-1` are 404s rather than
 * duplicate-content aliases of a real page. Mirrors the /subastas parser.
 */
export function parseArchivePage(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}
