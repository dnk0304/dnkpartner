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
import {
  TIPO_SLUG_TO_DB_KEYS,
  type TipoSlug,
  PROVINCE_DB_KEY_TO_SLUG,
  slugify,
} from './slugs';

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
  /** Wave 56 — exact-DB-name municipality scope, paired with province. */
  municipality?: string | null;
};

async function _countActive({ province, auctionTypeKeys, category, municipality }: CountInput): Promise<number> {
  const where: Prisma.AuctionWhereInput = { status: { in: ACTIVE_STATUSES } };
  if (province) where.province = province;
  if (auctionTypeKeys && auctionTypeKeys.length > 0) where.auctionType = { in: auctionTypeKeys };
  if (category) where.category = category;
  if (municipality) where.municipality = municipality;
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
async function _minStartingPrice({ province, auctionTypeKeys, category, municipality }: CountInput): Promise<number | null> {
  const where: Prisma.AuctionWhereInput = {
    status: { in: ACTIVE_STATUSES },
    OR: [{ minimumBid: { gt: 0 } }, { currentBid: { gt: 0 } }],
  };
  if (province) where.province = province;
  if (auctionTypeKeys && auctionTypeKeys.length > 0) where.auctionType = { in: auctionTypeKeys };
  if (category) where.category = category;
  if (municipality) where.municipality = municipality;
  const row = await prisma.auction.aggregate({
    where,
    _min: { minimumBid: true, currentBid: true },
  });
  const candidates = [row._min.minimumBid, row._min.currentBid].filter((v): v is number => typeof v === 'number' && v > 0);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

export const minStartingPrice = unstable_cache(_minStartingPrice, ['seo-min-price'], { revalidate: 300 });

/**
 * Active-count per municipality within a province (for the province SEO
 * page's "Por municipio" section). Returns rows sorted by count desc,
 * with null/empty/"desconocida" names filtered out — matches the cleanup
 * the home ProvinceGrid does client-side, kept consistent server-side here.
 *
 * Wave 56: each row carries the canonical `municipioSlug` so the province
 * page can link straight at the new town URL `/subastas/{prov}/{muni}`.
 * Per-slug collisions are folded to the highest-count casing — same rule
 * `municipalitySlugToDbName` uses — keeping the link cluster and the
 * resolver in lockstep.
 */
async function _municipalitiesInProvince(
  province: string,
): Promise<Array<{ name: string; count: number; municipioSlug: string }>> {
  const rows = await prisma.auction.groupBy({
    by: ['municipality'],
    where: { status: { in: ACTIVE_STATUSES }, province },
    _count: { _all: true },
  });
  // Fold per-slug collisions in two passes so we don't double-count:
  //   1. Sum total active count per slug.
  //   2. Pick the highest-individual-count DB casing as the display name
  //      (mirrors `municipalitySlugToDbName`'s resolution so the link
  //      cluster and the town-page resolver agree on the same canonical
  //      DB name).
  type Acc = { name: string; topCount: number; total: number; municipioSlug: string };
  const bySlug = new Map<string, Acc>();
  for (const r of rows) {
    const name = (r.municipality ?? '').trim();
    if (!name) continue;
    const lc = name.toLowerCase();
    if (lc === 'null' || lc === 'undefined' || lc === 'desconocida') continue;
    const municipioSlug = slugify(name);
    if (!municipioSlug) continue;
    const count = r._count?._all ?? 0;
    const prev = bySlug.get(municipioSlug);
    if (!prev) {
      bySlug.set(municipioSlug, { name, topCount: count, total: count, municipioSlug });
    } else {
      prev.total += count;
      if (count > prev.topCount) {
        prev.name = name;
        prev.topCount = count;
      }
    }
  }
  return Array.from(bySlug.values())
    .map((a) => ({ name: a.name, count: a.total, municipioSlug: a.municipioSlug }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

export const municipalitiesInProvince = unstable_cache(
  _municipalitiesInProvince,
  ['seo-municipalities-by-province'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/** Slugs of the indexable provinces that actually have inventory (for sitemap). */
export async function provincesWithInventory(): Promise<Set<string>> {
  const rows = await prisma.auction.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    select: { province: true },
    distinct: ['province'],
  });
  return new Set(rows.map((r) => r.province as string));
}

// ---------------------------------------------------------------------------
// Wave 56 — municipality slug resolver + active-pairs helper.
//
// `municipalitySlugToDbName(provinceDbKey, slug)`: given a province's DB key
// and a URL slug for a municipality, return the canonical DB municipality
// name. Implementation: scan distinct municipality names within that province
// (ACTIVE_STATUSES only — town pages are about live inventory), slugify each,
// match. On per-slug collision pick the highest-count variant ("most-frequent
// casing wins"). Cached per-province (300s) since the universe is small.
// ---------------------------------------------------------------------------

async function _distinctActiveMunicipalitiesInProvince(
  provinceDbKey: string,
): Promise<Array<{ name: string; count: number }>> {
  const rows = await prisma.auction.groupBy({
    by: ['municipality'],
    where: { status: { in: ACTIVE_STATUSES }, province: provinceDbKey },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ name: (r.municipality ?? '').trim(), count: r._count?._all ?? 0 }))
    .filter((r) => {
      if (!r.name) return false;
      const lc = r.name.toLowerCase();
      return lc !== 'null' && lc !== 'undefined' && lc !== 'desconocida';
    });
}

const distinctActiveMunicipalitiesInProvince = unstable_cache(
  _distinctActiveMunicipalitiesInProvince,
  ['seo-distinct-municipalities-in-province'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/**
 * Resolve a municipality slug to its canonical DB name within a given
 * province. Returns null when no active municipality in that province
 * matches. Collision-safe: if two casings fold to the same slug the
 * highest-count variant wins.
 */
export async function municipalitySlugToDbName(
  provinceDbKey: string,
  municipalitySlug: string,
): Promise<string | null> {
  if (!provinceDbKey || !municipalitySlug) return null;
  const rows = await distinctActiveMunicipalitiesInProvince(provinceDbKey);
  let best: { name: string; count: number } | null = null;
  for (const row of rows) {
    if (slugify(row.name) === municipalitySlug) {
      if (!best || row.count > best.count) best = row;
    }
  }
  return best ? best.name : null;
}

/**
 * All (provinceSlug, municipioSlug) pairs that currently have ≥1 active
 * auction. Used by the sitemap. Folds casing collisions to a single canonical
 * slug per pair (highest-count variant wins) and skips any province not in
 * `PROVINCE_DB_KEY_TO_SLUG` (off-taxonomy junk).
 */
async function _activeMunicipalityPairs(): Promise<
  Array<{ provinceSlug: string; municipioSlug: string; count: number; municipalityName: string }>
> {
  const rows = await prisma.auction.groupBy({
    by: ['province', 'municipality'],
    where: { status: { in: ACTIVE_STATUSES } },
    _count: { _all: true },
  });
  // Fold (provinceSlug, municipioSlug) collisions to highest-count variant.
  const best = new Map<
    string,
    { provinceSlug: string; municipioSlug: string; count: number; municipalityName: string }
  >();
  for (const r of rows) {
    const provinceKey = (r.province ?? '').trim();
    const muniName = (r.municipality ?? '').trim();
    if (!provinceKey || !muniName) continue;
    const lcMuni = muniName.toLowerCase();
    if (lcMuni === 'null' || lcMuni === 'undefined' || lcMuni === 'desconocida') continue;
    const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[provinceKey];
    if (!provinceSlug) continue;
    const municipioSlug = slugify(muniName);
    if (!municipioSlug) continue;
    const key = `${provinceSlug}|${municipioSlug}`;
    const count = r._count?._all ?? 0;
    const prev = best.get(key);
    if (!prev || count > prev.count) {
      best.set(key, { provinceSlug, municipioSlug, count, municipalityName: muniName });
    }
  }
  return Array.from(best.values()).sort((a, b) => b.count - a.count);
}

export const activeMunicipalityPairs = unstable_cache(
  _activeMunicipalityPairs,
  ['seo-active-municipality-pairs'],
  { revalidate: 300, tags: ['seo-counts'] },
);

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
