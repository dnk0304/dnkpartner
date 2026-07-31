/**
 * SeoAuctionSection — the SSR crawlable auction block for hub/listing pages
 * (P1 + P2, SEO crawl-path unlock 2026-07-31).
 *
 * Combines:
 *   - a heading (so the block reads as real, unique content — kills the thin/
 *     near-duplicate hub signal),
 *   - <SeoAuctionGrid> — full-info cards, each a real <a href> to the detail
 *     page (the crawl path Googlebot was missing),
 *   - <SeoPagination> — path-based prev/next/numbered links (the deep-crawl
 *     path through the whole hub).
 *
 * Rendered SERVER-side. On the hub pages it is passed into SubastasListClient
 * as the `seoAuctionsSlot`, which paints it as the initial/no-JS content; the
 * client list hydrates on top for real users. Googlebot (which cannot fetch
 * the robots-blocked /api/auctions) keeps seeing this block in the rendered
 * DOM, so the links persist for discovery.
 */

import { SeoAuctionGrid } from '@/components/seo/SeoAuctionGrid';
import { SeoPagination } from '@/components/seo/SeoPagination';
import type { ScopedAuctionPage } from '@/lib/seo/page-data';

export type SeoAuctionSectionProps = {
  data: ScopedAuctionPage;
  /** Base URL of this hub WITHOUT trailing slash, e.g. `/subastas/valencia`. */
  basePath: string;
  /** Visible <h2> above the grid. */
  heading: string;
  /** Shown when this hub currently has no in-scope active auctions. */
  emptyMessage?: string;
  paginationAriaLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
};

export function SeoAuctionSection({
  data,
  basePath,
  heading,
  emptyMessage,
  paginationAriaLabel,
  prevLabel,
  nextLabel,
}: SeoAuctionSectionProps) {
  return (
    <section aria-label={heading}>
      <h2 className="sr-only">{heading}</h2>
      <SeoAuctionGrid auctions={data.rows} emptyMessage={emptyMessage} />
      <SeoPagination
        basePath={basePath}
        page={data.page}
        totalPages={data.totalPages}
        ariaLabel={paginationAriaLabel}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
      />
    </section>
  );
}
