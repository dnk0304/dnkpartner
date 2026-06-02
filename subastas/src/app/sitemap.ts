/**
 * sitemap.xml — combined sitemap (07 §4).
 *
 * Includes ONLY indexable URLs. Anything below the inventory threshold or
 * flagged noindex is excluded — sitemap = the indexable set, exactly.
 *
 * Layout (one sitemap; under 50k URLs total in current state):
 *   - Core (home, /subastas, indices)
 *   - All 52 province pages (always indexable)
 *   - All 5 tipo pages (always indexable)
 *   - The 9 DENSE category pages (OFFICIAL_CATEGORIES ∩ count ≥ threshold)
 *   - All ACTIVE auction-detail pages (active states only)
 *   - All published /guia/ articles
 *
 * If/when this crosses 50k URLs, swap to `generateSitemaps()` and chunk.
 *
 * lastmod = real data freshness where available (07 §4 — fake daily lastmod
 * gets ignored or penalised).
 */

import type { MetadataRoute } from 'next';
import { AuctionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

// Generated at request time — never at build (sitemap depends on live counts +
// active-auction set). Avoids prerender-time DATABASE_URL requirement.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import {
  PROVINCE_SLUGS,
  TIPO_SLUGS,
  CATEGORY_SLUG_TO_DB_LABEL,
  CATEGORY_INDEX_THRESHOLD,
  isOfficialCategory,
  type CategorySlug,
} from '@/lib/seo/slugs';
import { categoryActiveCounts } from '@/lib/seo/page-data';
import { buildAuctionSlug } from '@/lib/seo/auction-slug';

const SITE = 'https://subastasactivas.com';
const ACTIVE_STATUSES: AuctionStatus[] = [
  AuctionStatus.ACTIVE,
  AuctionStatus.CELEBRANDOSE,
  AuctionStatus.PRE_AUCTION,
  AuctionStatus.PROXIMA_APERTURA,
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // --- Core ---
  entries.push(
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE}/subastas`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
  );

  // --- 52 provinces (always indexable per 07 §6.1) ---
  for (const slug of PROVINCE_SLUGS) {
    entries.push({
      url: `${SITE}/subastas/provincia/${slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    });
  }

  // --- 5 tipos (always indexable) ---
  for (const slug of TIPO_SLUGS) {
    entries.push({
      url: `${SITE}/subastas/tipo/${slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    });
  }

  // --- 9 DENSE categories: only those in OFFICIAL_CATEGORIES with count ≥ threshold ---
  const counts = await categoryActiveCounts();
  for (const [slug, dbLabel] of Object.entries(CATEGORY_SLUG_TO_DB_LABEL) as Array<[CategorySlug, string]>) {
    const c = counts.get(dbLabel) ?? 0;
    if (isOfficialCategory(dbLabel) && c >= CATEGORY_INDEX_THRESHOLD) {
      entries.push({
        url: `${SITE}/subastas/${slug}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
  }

  // --- ACTIVE auction-detail pages ---
  // CONCLUIDA / FINALIZADA stay noindex per 07 §1.7, so excluded from sitemap.
  const activeAuctions = await prisma.auction.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    select: { id: true, auctionType: true, province: true, municipality: true, updatedAt: true },
    take: 45_000, // safety cap below 50k sitemap limit
  });
  for (const a of activeAuctions) {
    entries.push({
      url: `${SITE}/subastas/subasta/${buildAuctionSlug(a)}`,
      lastModified: a.updatedAt ?? now,
      changeFrequency: 'daily',
      priority: 0.6,
    });
  }

  // --- Published /guia/ articles (link from #9 blog) ---
  try {
    const guides = await prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true, publishedAt: true },
    });
    for (const g of guides) {
      entries.push({
        url: `${SITE}/guia/${g.slug}`,
        lastModified: g.updatedAt ?? g.publishedAt ?? now,
        changeFrequency: 'weekly',
        priority: 0.5,
      });
    }
  } catch {
    // Article model may not be migrated yet on some envs — non-fatal.
  }

  return entries;
}
