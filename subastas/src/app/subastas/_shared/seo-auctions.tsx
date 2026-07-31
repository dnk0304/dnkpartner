/**
 * Shared builder for the SSR crawlable auction block (P1 + P2, 2026-07-31).
 *
 * Both the hub page-1 routes (/subastas, /subastas/<prov>, /subastas/<prov>/
 * <muni>, /subastas/tipo/<t>) and their `/pagina/<n>` siblings render the SAME
 * block through here so the markup + label wiring stay in one place. The `_`
 * folder prefix keeps this out of the route tree.
 */

import { getTranslations } from 'next-intl/server';
import {
  findScopedAuctionsPage,
  type ScopedAuctionPage,
} from '@/lib/seo/page-data';
import { SeoAuctionSection } from '@/components/seo/SeoAuctionSection';

/** The dimension a hub locks. Mirrors page-data's CountInput (subset). */
export type HubFilter = {
  province?: string | null;
  municipality?: string | null;
  category?: string | null;
  auctionTypeKeys?: string[] | null;
};

/** Render the crawlable auction section for an already-fetched page of data. */
export async function seoAuctionsNode(
  data: ScopedAuctionPage,
  basePath: string,
  locationLabel: string,
): Promise<React.ReactNode> {
  const t = await getTranslations('listTemplates');
  return (
    <SeoAuctionSection
      data={data}
      basePath={basePath}
      heading={t('auctionsHeading', { location: locationLabel })}
      emptyMessage={t('noActiveAuctions')}
      paginationAriaLabel={t('paginationLabel')}
      prevLabel={t('paginationPrev')}
      nextLabel={t('paginationNext')}
    />
  );
}

/**
 * Fetch a hub's scope-gated page of auctions AND render the block. Returns both
 * so `/pagina/<n>` callers can read `data` (totalPages/total) for the range
 * guard + robots/metadata, while page-1 hubs just use `node`.
 */
export async function buildSeoAuctions(opts: {
  filter: HubFilter;
  basePath: string;
  locationLabel: string;
  page?: number;
}): Promise<{ data: ScopedAuctionPage; node: React.ReactNode }> {
  const data = await findScopedAuctionsPage({ ...opts.filter, page: opts.page ?? 1 });
  const node = await seoAuctionsNode(data, opts.basePath, opts.locationLabel);
  return { data, node };
}
