/**
 * SeoPagination — crawlable, PATH-BASED pagination for the hub/listing pages
 * (P2, SEO crawl-path unlock 2026-07-31).
 *
 * WHY path-based: robots.txt blocks `/*?` (all query strings), so `?page=2`
 * would be uncrawlable. Page N lives at `{basePath}/pagina/{N}`; page 1 is the
 * bare `{basePath}` (no `/pagina/1` — that URL redirects to base, keeping one
 * canonical URL per logical page-1).
 *
 * Emits real <a href> prev / next / numbered links so Googlebot can walk the
 * full inventory of a hub. `rel="prev"`/`rel="next"` are set on the prev/next
 * anchors (the crawlable, semantically-correct signal; Google reads href from
 * the initial HTML regardless of JS).
 *
 * HEAD `<link rel="prev|next">` (Forge 2026-08-12): the anchors carried `rel`
 * but the document head did not — Ken checked a live paginated
 * /subastas hub and found only robots + canonical. Emitted HERE, not in each
 * route own
 * `generateMetadata` because (a) Next's Metadata API has no field for
 * prev/next, and (b) one emission point means every consumer — the /subastas
 * hubs, their /pagina/N siblings, and the /resultados archive — gets it and
 * they cannot drift. React 19 hoists a `<link>` rendered anywhere in the tree
 * into <head>, so this lands in the head of the SSR HTML. Absolute hrefs
 * (SITE_ORIGIN) because a sequence signal spanning documents should not depend
 * on base-URL resolution.
 *
 * Server component — no client JS. Renders nothing when there is only one page.
 */

import Link from 'next/link';
import { SITE_ORIGIN } from '@/lib/seo/alternates';

export type SeoPaginationProps = {
  /** Base URL of the hub WITHOUT a trailing slash, e.g. `/subastas/valencia`. */
  basePath: string;
  /** 1-indexed current page. */
  page: number;
  /** Total number of pages (>=1). */
  totalPages: number;
  /** Accessible label for the <nav> (localised by the caller). */
  ariaLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
};

/** URL for a given page: page 1 → base, page N → base/pagina/N. */
function hrefFor(basePath: string, n: number): string {
  return n <= 1 ? basePath : `${basePath}/pagina/${n}`;
}

/**
 * Windowed page list: always first + last, current ±2, with `null` gaps that
 * render as an ellipsis. Keeps the anchor count bounded on 100+-page hubs.
 */
function pageWindow(page: number, totalPages: number): Array<number | null> {
  const set = new Set<number>([1, totalPages]);
  for (let n = page - 2; n <= page + 2; n++) {
    if (n >= 1 && n <= totalPages) set.add(n);
  }
  const sorted = Array.from(set).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}

export function SeoPagination({
  basePath,
  page,
  totalPages,
  ariaLabel = 'Paginación',
  prevLabel = 'Anterior',
  nextLabel = 'Siguiente',
}: SeoPaginationProps) {
  if (totalPages <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const items = pageWindow(page, totalPages);

  const linkCls =
    'inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-surface-muted)]';
  const currentCls =
    'inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-md border border-[var(--color-ink-primary)] bg-[var(--color-ink-primary)] text-[var(--color-page)] text-sm font-semibold';

  return (
    <nav aria-label={ariaLabel} className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {/* Hoisted into <head> by React 19. */}
      {hasPrev ? <link rel="prev" href={`${SITE_ORIGIN}${hrefFor(basePath, page - 1)}`} /> : null}
      {hasNext ? <link rel="next" href={`${SITE_ORIGIN}${hrefFor(basePath, page + 1)}`} /> : null}

      {hasPrev ? (
        <Link rel="prev" href={hrefFor(basePath, page - 1)} className={linkCls}>
          {prevLabel}
        </Link>
      ) : (
        <span className={`${linkCls} opacity-40 pointer-events-none`} aria-hidden="true">
          {prevLabel}
        </span>
      )}

      {items.map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 text-[var(--color-text-muted)]" aria-hidden="true">
            …
          </span>
        ) : n === page ? (
          <span key={n} aria-current="page" className={currentCls}>
            {n}
          </span>
        ) : (
          <Link key={n} href={hrefFor(basePath, n)} className={linkCls}>
            {n}
          </Link>
        ),
      )}

      {hasNext ? (
        <Link rel="next" href={hrefFor(basePath, page + 1)} className={linkCls}>
          {nextLabel}
        </Link>
      ) : (
        <span className={`${linkCls} opacity-40 pointer-events-none`} aria-hidden="true">
          {nextLabel}
        </span>
      )}
    </nav>
  );
}
