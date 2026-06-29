/**
 * sitemap — chunked via `generateSitemaps()` (07 §4).
 *
 * Doctrine (08 §4.3 — town tightening): the sitemap ships only URLs that are
 * indexable RIGHT NOW. For towns that means ≥1 auction in the SEO
 * ACTIVE_STATUSES set (active + upcoming/PROXIMA) — the SAME predicate the
 * town page's index gate uses (countActiveAuctions > 0), so the sitemap town
 * set == the indexable town set by construction. A 0-active town drops out of
 * the sitemap but its page stays 200 + noindex,follow + reachable; it re-enters
 * automatically when inventory returns (live request-time recompute, 300s
 * unstable_cache TTL — no nightly job). Everything else (categories below
 * threshold, finished auction details) stays excluded.
 *
 * Chunk layout (fixed IDs so NO DB query is needed to enumerate chunks —
 * keeps the route fully request-time, never build-time):
 *   - /sitemap/0.xml — core (home, /subastas) + 52 provinces + ALL clean
 *     town pages + 5 tipos + DENSE categories + published /guia/ articles.
 *     (~5k towns + static set today — far under the 50k cap.)
 *   - /sitemap/1.xml … /sitemap/3.xml — ACTIVE auction-detail pages, 45k per
 *     chunk (skip/take ordered by id asc for stable pagination). Today only
 *     chunk 1 is non-empty (~5k details); 2–3 are empty headroom up to 135k
 *     actives. Bump DETAIL_CHUNKS (and robots.ts) if inventory ever nears it.
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
import { categoryActiveCounts, activeMunicipalityPairs } from '@/lib/seo/page-data';
import { buildAuctionSlug } from '@/lib/seo/auction-slug';

const SITE = 'https://subastasactivas.com';
const ACTIVE_STATUSES: AuctionStatus[] = [
  AuctionStatus.ACTIVE,
  AuctionStatus.CELEBRANDOSE,
  AuctionStatus.PRE_AUCTION,
  AuctionStatus.PROXIMA_APERTURA,
];

/** Auction-detail chunks (ids 1..DETAIL_CHUNKS), 45k URLs each. */
const DETAIL_CHUNKS = 3;
const DETAIL_CHUNK_SIZE = 45_000; // safety cap below the 50k sitemap limit

export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  // Fixed ID set — intentionally no DB call here (chunk enumeration must not
  // create a build-time or robots.ts-visible dependency on live counts).
  return Array.from({ length: 1 + DETAIL_CHUNKS }, (_, i) => ({ id: i }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  // Runtime root cause (Next 15 async-params, proven in the live wave102
  // bundle): the generated route wrapper passes `id` as an UN-AWAITED
  // Promise<string> (already `.xml`-stripped — the suffix theory from
  // corrective #1 is disproven; the wrapper strips it before calling us).
  // `String(Promise)` → "[object Promise]" → parseInt → NaN → every chunk
  // fell back to chunk 0. Await/unwrap first; handles promise AND plain
  // string/number so this stays correct if Next reverts to sync params.
  const raw = await Promise.resolve(id as unknown as string | number | Promise<string | number>);
  const parsed = Number.parseInt(String(raw), 10);
  const chunkId = Number.isNaN(parsed) ? 0 : parsed;

  const now = new Date();

  // --- Chunks 1..N: ACTIVE auction-detail pages ---
  // CONCLUIDA / FINALIZADA stay noindex per 07 §1.7, so excluded from sitemap.
  if (chunkId >= 1) {
    const entries: MetadataRoute.Sitemap = [];
    try {
      const activeAuctions = await prisma.auction.findMany({
        where: { status: { in: ACTIVE_STATUSES } },
        select: { id: true, auctionType: true, province: true, municipality: true, updatedAt: true },
        orderBy: { id: 'asc' }, // stable order so skip/take chunks don't overlap
        skip: (chunkId - 1) * DETAIL_CHUNK_SIZE,
        take: DETAIL_CHUNK_SIZE,
      });
      for (const a of activeAuctions) {
        entries.push({
          url: `${SITE}/subastas/subasta/${buildAuctionSlug(a)}`,
          lastModified: a.updatedAt ?? now,
          changeFrequency: 'daily',
          priority: 0.6,
        });
      }
    } catch {
      // Non-fatal — an empty detail chunk is still a valid sitemap.
    }
    return entries;
  }

  // --- Chunk 0: core + provinces + towns + tipos + categories + guides ---
  const entries: MetadataRoute.Sitemap = [];

  // --- Core ---
  entries.push(
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE}/subastas`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
  );

  // --- 52 provinces (always indexable per 07 §6.1) ---
  // Wave 56 — clean URL (no /provincia/ prefix). Old URLs 301 → these via
  // middleware Rule 2b; sitemaps list canonical targets only.
  for (const slug of PROVINCE_SLUGS) {
    entries.push({
      url: `${SITE}/subastas/${slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    });
  }

  // --- Town pages (08 §4.3 — active-gated) ---
  // Only clean towns with ≥1 auction in SEO ACTIVE_STATUSES (active + upcoming;
  // off-taxonomy junk filtered inside activeMunicipalityPairs()). This is the
  // SAME predicate the town page's index gate uses, so the sitemap town set ==
  // the indexable town set. 0-active towns drop out here but their page stays
  // 200 + noindex,follow + reachable — see the doctrine note in the header.
  try {
    const pairs = await activeMunicipalityPairs();
    for (const p of pairs) {
      entries.push({
        url: `${SITE}/subastas/${p.provinceSlug}/${p.municipioSlug}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
  } catch {
    // Non-fatal — if the pair query trips, the rest of the sitemap is still useful.
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
