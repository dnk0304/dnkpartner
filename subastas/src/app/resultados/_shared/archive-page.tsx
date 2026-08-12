/**
 * /resultados archive pagination — the ONE shared piece (Forge, 2026-08-12).
 *
 * WHY THIS EXISTS
 * ---------------
 * `/resultados/{prov}` and `/resultados/{prov}/{muni}` rendered exactly one
 * page of the archive and offered no path-based way to reach the rest: the only
 * "more" affordance was the client island's `Cargar más` button, which fetches
 * `/api/registro/list?...` — a querystring URL that robots.txt disallows. So
 * every concluded auction past row 24 of its town was **link-orphaned**: present
 * in the sitemap (or about to be, once the widening lands) and reachable from
 * nothing. That is the textbook route to *Discovered – currently not indexed*.
 *
 * This module is the shared body for the `/pagina/{n}` routes. It deliberately
 * does NOT fork the /subastas pagination: the anchor/window/rel markup is
 * `<SeoPagination>`, the exact component the /subastas hubs use, so the two
 * surfaces cannot drift and the head `<link rel="prev|next">` fix lands on both
 * at once.
 *
 * PRECEDENT MATCH (verified live on /subastas/madrid/pagina/2, 2026-08-12):
 *   • `index,follow` when the page is in range and the scope is non-empty
 *   • self-canonical to the paginated URL (never to the bare hub)
 *   • `pagina/1` → redirect to the bare hub (one canonical URL per logical page)
 *   • out-of-range page → 404
 * Do not redesign any of the four. They are mirrored, not reinvented.
 *
 * PAGE SIZE is 24 — the value the hubs already pass to `readList` and the value
 * `RegistryArchiveClient` pages by. It lives in `@/lib/registro/archive-paging`
 * (React-free) so the sitemap's page-count arithmetic reads the SAME constant;
 * re-exported here so route files have one import.
 */

import { ResultadoRow } from '@/components/registro/ResultadoRow';
import { SeoPagination } from '@/components/seo/SeoPagination';
import type { Locale, RegistroListItem, ResultadosCopy } from '@/lib/registro/registro-ui';

// Re-exported so route files import paging + body from one place; the values
// themselves live in a React-free module the sitemap can also import.
export { ARCHIVE_PAGE_SIZE, parseArchivePage } from '@/lib/registro/archive-paging';

/**
 * The archive body for a deep page: the concluded rows as real SSR `<a href>`s
 * (each `item.detailPath` comes from `resolveAuctionPath`, so unmintable rows
 * correctly carry their legacy path — they are linked, never filtered out) plus
 * the crawlable prev/next/numbered nav.
 *
 * No client island on deep pages: the filter/`Cargar más` UI belongs on the hub,
 * and omitting it keeps these pages cheap — they exist for the crawl path.
 */
export function ArchivePageBody({
  items,
  page,
  totalPages,
  basePath,
  locale,
  copy,
  heading,
}: {
  items: RegistroListItem[];
  page: number;
  totalPages: number;
  /** Hub URL WITHOUT trailing slash, e.g. `/resultados/madrid/madrid`. */
  basePath: string;
  locale: Locale;
  copy: ResultadosCopy;
  heading: string;
}) {
  return (
    <section aria-label={heading}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--color-ink-primary)]">{heading}</h2>
      {items.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface-muted)] p-8 text-center text-sm text-[var(--color-ink-tertiary)]">
          {copy.empty}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <ResultadoRow key={item.id} item={item} locale={locale} />
          ))}
        </ul>
      )}
      <SeoPagination
        basePath={basePath}
        page={page}
        totalPages={totalPages}
        ariaLabel={copy.pagLabel}
        prevLabel={copy.pagPrev}
        nextLabel={copy.pagNext}
      />
    </section>
  );
}
