/**
 * sitemap — a true sitemap INDEX (/sitemap.xml, produced by Next from
 * generateSitemaps()) over typed children (/sitemap/{id}.xml). Chunk layout,
 * the 20k/file cap, and the phased concluded ramp all live in
 * `src/lib/seo/sitemap-config.ts` (shared with robots.ts so they can't drift).
 *
 * Children:
 *   - id 0            — aggregation (home, /subastas, 52 provinces, active
 *                       towns, tipos, dense categories, guides, noticias).
 *   - id 1..ACTIVE    — ACTIVE auction details, 20k/file (orderBy id asc).
 *   - id ACTIVE+1..   — SCOPED CONCLUDED details (property+vehicle with a real
 *                       sale outcome), 20k/file, orderBy soldDate DESC. The
 *                       membership predicate is `concludedIndexableWhere()` —
 *                       the SAME predicate the detail-page robots gate uses, so
 *                       a sitemap URL is never noindex (see concluded-indexable.ts).
 *
 * Town-page doctrine (08 §4.3) unchanged: aggregation ships only towns with ≥1
 * ACTIVE auction — same predicate as the town page's own index gate.
 *
 * lastmod = real data freshness (07 §4 — fake daily lastmod gets ignored /
 * penalised). Active: updatedAt. Concluded: soldDate ?? updatedAt.
 *
 * Request-time only (`dynamic='force-dynamic'`, `revalidate=0`) — never a
 * build-time DB dependency. Chunk enumeration is a fixed id set (no DB call);
 * each child paginates with a stable orderBy + skip/take so a given URL stays
 * in the same child between requests.
 */

import type { MetadataRoute } from 'next';
import { AuctionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

// Generated at request time — never at build (sitemap depends on live counts +
// active/concluded sets). Avoids prerender-time DATABASE_URL requirement.
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
import { listNoticias } from '@/lib/noticias';
import {
  CHILD_SITEMAP_SIZE,
  classifyChunk,
  sitemapChildIds,
} from '@/lib/seo/sitemap-config';
import { concludedIndexableWhere } from '@/lib/seo/concluded-indexable';
import { readSummary, concludedMunicipioPairsAll } from '@/lib/registro/registro-read';
import { PROVINCE_DB_KEY_TO_SLUG } from '@/lib/seo/slugs';
import { OUTCOME_TO_SLUG } from '@/lib/registro/registro-ui';

const SITE = 'https://subastasactivas.com';
const ACTIVE_STATUSES: AuctionStatus[] = [
  AuctionStatus.ACTIVE,
  AuctionStatus.CELEBRANDOSE,
  AuctionStatus.PRE_AUCTION,
  AuctionStatus.PROXIMA_APERTURA,
];

export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  // Fixed ID set from the shared layout — intentionally no DB call here (chunk
  // enumeration must not create a build-time or robots.ts-visible dependency on
  // live counts). robots.ts advertises the identical set via sitemapChildUrls().
  return sitemapChildIds().map((id) => ({ id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  // Runtime root cause (Next 15 async-params, proven in the live wave102
  // bundle): the generated route wrapper passes `id` as an UN-AWAITED
  // Promise<string> (already `.xml`-stripped). `String(Promise)` →
  // "[object Promise]" → parseInt → NaN → every chunk fell back to chunk 0.
  // Await/unwrap first; handles promise AND plain string/number.
  const raw = await Promise.resolve(id as unknown as string | number | Promise<string | number>);
  const parsed = Number.parseInt(String(raw), 10);
  const chunkId = Number.isNaN(parsed) ? 0 : parsed;
  const chunk = classifyChunk(chunkId);

  const now = new Date();

  // --- ACTIVE auction-detail children ---
  if (chunk.kind === 'active') {
    const entries: MetadataRoute.Sitemap = [];
    try {
      const activeAuctions = await prisma.auction.findMany({
        where: { status: { in: ACTIVE_STATUSES } },
        select: { id: true, auctionType: true, province: true, municipality: true, updatedAt: true },
        orderBy: { id: 'asc' }, // stable order so skip/take chunks don't overlap
        skip: chunk.skip,
        take: CHILD_SITEMAP_SIZE,
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

  // --- SCOPED CONCLUDED auction-detail children ---
  // Membership == the detail-page index gate (shared concludedIndexableWhere).
  // orderBy soldDate DESC (freshest sold pages first) + id asc tiebreak so a
  // URL keeps its position across requests. soldDate is historical (= endsAt of
  // past auctions), so ordering is effectively stable; new daily concludes
  // insert at the front (child #1) and only nudge boundaries — no de-index (we
  // never remove children, only add).
  if (chunk.kind === 'concluded') {
    const entries: MetadataRoute.Sitemap = [];
    try {
      const rows = await prisma.auction.findMany({
        where: concludedIndexableWhere(),
        select: {
          id: true,
          auctionType: true,
          province: true,
          municipality: true,
          soldDate: true,
          updatedAt: true,
        },
        orderBy: [{ soldDate: 'desc' }, { id: 'asc' }],
        skip: chunk.skip,
        take: CHILD_SITEMAP_SIZE,
      });
      for (const a of rows) {
        entries.push({
          url: `${SITE}/subastas/subasta/${buildAuctionSlug(a)}`,
          lastModified: a.soldDate ?? a.updatedAt ?? now,
          changeFrequency: 'monthly', // concluded outcomes don't change
          priority: 0.5,
        });
      }
    } catch {
      // Non-fatal — an empty concluded chunk is still a valid sitemap.
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

  // --- /resultados registry (concluded auction-outcomes archive) ---
  // Landing + count-gated region pages. Every URL here is index,follow by the
  // SAME count-gate the pages use (region present in the rollup with total>0),
  // so a sitemap URL is never noindex. These interlink the concluded detail
  // pages (the orphan fix), which live in the concluded detail children above.
  try {
    entries.push({ url: `${SITE}/resultados`, lastModified: now, changeFrequency: 'daily', priority: 0.8 });

    const summary = await readSummary({});
    for (const region of summary.regions) {
      const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[region.province];
      if (!provinceSlug || region.total <= 0) continue;
      // /resultados/{provincia}
      entries.push({
        url: `${SITE}/resultados/${provinceSlug}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
      // /resultados/{outcome}/{provincia} — only the SEO-indexable outcomes
      // (adjudicadas / desiertas) where the province actually has that outcome.
      if (region.counts.VENDIDA > 0) {
        entries.push({
          url: `${SITE}/resultados/${OUTCOME_TO_SLUG.VENDIDA}/${provinceSlug}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.5,
        });
      }
      if (region.counts.DESIERTA > 0) {
        entries.push({
          url: `${SITE}/resultados/${OUTCOME_TO_SLUG.DESIERTA}/${provinceSlug}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.5,
        });
      }
    }

    // /resultados/{provincia}/{municipio} — deepest crawl nodes (town archives).
    const muniPairs = await concludedMunicipioPairsAll();
    for (const p of muniPairs) {
      entries.push({
        url: `${SITE}/resultados/${p.provinceSlug}/${p.municipioSlug}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.5,
      });
    }
  } catch {
    // Non-fatal — the rest of the sitemap is still valid if the rollup read trips.
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

  // --- Published /noticias/ articles (markdown-file-driven, no DB) ---
  // es URL always; /en URL only when the .en.md file exists (locked decision:
  // missing en = 404 + omit). lastmod = updated ?? date (real content dates).
  const noticias = listNoticias('es');
  if (noticias.length > 0) {
    entries.push(
      { url: `${SITE}/noticias`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
      { url: `${SITE}/en/noticias`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    );
  }
  for (const n of noticias) {
    const lastModified = new Date(`${n.updated ?? n.date}T00:00:00Z`);
    entries.push({
      url: `${SITE}/noticias/${n.slug}`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
    if (n.hasBothLocales) {
      entries.push({
        url: `${SITE}/en/noticias/${n.slug}`,
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.4,
      });
    }
  }

  return entries;
}
