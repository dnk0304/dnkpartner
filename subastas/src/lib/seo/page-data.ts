/**
 * Server-side data fetchers for SEO programmatic pages.
 *
 * These run at request time (Server Components) so the title/intro show LIVE
 * active counts (the count-in-title pattern is the duplicate-content defence,
 * 07 §3.1). Cached briefly with `unstable_cache` to keep the SEO pages cheap.
 */

import { unstable_cache } from 'next/cache';
import { AuctionStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TIPO_SLUG_TO_DB_KEYS, type TipoSlug } from './slugs';

/** "Active" auctions for the count-in-title — celebrandose + pre-auction. */
const ACTIVE_STATUSES: AuctionStatus[] = [
  AuctionStatus.ACTIVE,
  AuctionStatus.CELEBRANDOSE,
  AuctionStatus.PRE_AUCTION,
  AuctionStatus.PROXIMA_APERTURA,
];

type CountInput = {
  province?: string | null;
  auctionTypeKeys?: string[] | null;
  category?: string | null;
};

async function _countActive({ province, auctionTypeKeys, category }: CountInput): Promise<number> {
  const where: Prisma.AuctionWhereInput = { status: { in: ACTIVE_STATUSES } };
  if (province) where.province = province;
  if (auctionTypeKeys && auctionTypeKeys.length > 0) where.auctionType = { in: auctionTypeKeys };
  if (category) where.category = category;
  return prisma.auction.count({ where });
}

/** Memoised count (60s cache — survives traffic bursts without hammering PG). */
export const countActiveAuctions = unstable_cache(
  _countActive,
  ['seo-active-count'],
  { revalidate: 60, tags: ['seo-counts'] },
);

async function _findActive(args: CountInput & { take: number }) {
  const where: Prisma.AuctionWhereInput = { status: { in: ACTIVE_STATUSES } };
  if (args.province) where.province = args.province;
  if (args.auctionTypeKeys && args.auctionTypeKeys.length > 0) where.auctionType = { in: args.auctionTypeKeys };
  if (args.category) where.category = args.category;
  return prisma.auction.findMany({
    where,
    orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
    take: args.take,
    select: {
      id: true,
      title: true,
      category: true,
      province: true,
      municipality: true,
      status: true,
      auctionType: true,
      currentBid: true,
      minimumBid: true,
      appraisalValue: true,
      endsAt: true,
      publishedAt: true,
      imageUrl: true,
      latitude: true,
      longitude: true,
    },
  });
}

export const findActiveAuctions = unstable_cache(
  _findActive,
  ['seo-active-list'],
  { revalidate: 60, tags: ['seo-counts'] },
);

/** Resolve a tipo slug to its DB auctionType keys. */
export function tipoSlugToDbKeys(slug: TipoSlug): string[] {
  return TIPO_SLUG_TO_DB_KEYS[slug] ?? [];
}

/** Minimum starting price across active auctions for a given filter (Euros). */
async function _minStartingPrice({ province, auctionTypeKeys, category }: CountInput): Promise<number | null> {
  const where: Prisma.AuctionWhereInput = {
    status: { in: ACTIVE_STATUSES },
    OR: [{ minimumBid: { gt: 0 } }, { currentBid: { gt: 0 } }],
  };
  if (province) where.province = province;
  if (auctionTypeKeys && auctionTypeKeys.length > 0) where.auctionType = { in: auctionTypeKeys };
  if (category) where.category = category;
  const row = await prisma.auction.aggregate({
    where,
    _min: { minimumBid: true, currentBid: true },
  });
  const candidates = [row._min.minimumBid, row._min.currentBid].filter((v): v is number => typeof v === 'number' && v > 0);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

export const minStartingPrice = unstable_cache(_minStartingPrice, ['seo-min-price'], { revalidate: 300 });

/** Slugs of the indexable provinces that actually have inventory (for sitemap). */
export async function provincesWithInventory(): Promise<Set<string>> {
  const rows = await prisma.auction.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    select: { province: true },
    distinct: ['province'],
  });
  return new Set(rows.map((r) => r.province as string));
}

/** Active-count per category label (for sitemap / threshold check). */
export async function categoryActiveCounts(): Promise<Map<string, number>> {
  const rows = await prisma.auction.groupBy({
    by: ['category'],
    where: { status: { in: ACTIVE_STATUSES } },
    _count: { _all: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.category) m.set(r.category, r._count?._all ?? 0);
  }
  return m;
}
