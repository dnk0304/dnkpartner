/**
 * src/lib/seo/sitemap-entries.ts — the per-child sitemap BODY builder.
 *
 * WHY THIS EXISTS (wave150): Next App Router reserves the `sitemap` metadata
 * file convention. Having BOTH `app/sitemap.ts` (generateSitemaps → the
 * `/sitemap/[__metadata_id__]` dynamic page) AND a manual `app/sitemap.xml/route.ts`
 * collides — Next can no longer resolve the metadata page during page-data
 * collection and the production build fails with PageNotFoundError. So we dropped
 * the metadata convention entirely and serve every sitemap as a plain Route
 * Handler:
 *   - /sitemap.xml          → app/sitemap.xml/route.ts  (the <sitemapindex>)
 *   - /sitemap/{id}.xml      → app/sitemap/[...seg]/route.ts  (each <urlset>)
 *
 * This module holds the child-body logic that USED to live in
 * `app/sitemap.ts`'s default export. It returns typed entries; the route handler
 * renders them to <urlset> XML. Chunk layout, the 20k/file cap, and the concluded
 * ramp still live in `sitemap-config.ts` (shared with robots.ts so they can't drift).
 *
 * Children:
 *   - id 0            — aggregation (home, /subastas, 52 provinces, active
 *                       towns, tipos, dense categories, /resultados, guides, noticias).
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
 */

import { AuctionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  PROVINCE_SLUGS,
  TIPO_SLUGS,
  CATEGORY_SLUG_TO_DB_LABEL,
  CATEGORY_INDEX_THRESHOLD,
  isOfficialCategory,
  PROVINCE_DB_KEY_TO_SLUG,
  type CategorySlug,
} from '@/lib/seo/slugs';
import { categoryActiveCounts, activeMunicipalityPairs } from '@/lib/seo/page-data';
import { buildAuctionSlug } from '@/lib/seo/auction-slug';
import { listNoticias } from '@/lib/noticias';
import { CHILD_SITEMAP_SIZE, classifyChunk } from '@/lib/seo/sitemap-config';
import { concludedIndexableWhere } from '@/lib/seo/concluded-indexable';
import { readSummary, concludedMunicipioPairsAll } from '@/lib/registro/registro-read';
import { OUTCOME_TO_SLUG } from '@/lib/registro/registro-ui';

const SITE = 'https://subastasactivas.com';

const ACTIVE_STATUSES: AuctionStatus[] = [
  AuctionStatus.ACTIVE,
  AuctionStatus.CELEBRANDOSE,
  AuctionStatus.PRE_AUCTION,
  AuctionStatus.PROXIMA_APERTURA,
];

export type ChangeFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

export interface SitemapUrlEntry {
  url: string;
  lastModified: Date;
  changeFrequency?: ChangeFrequency;
  priority?: number;
}

/**
 * Build the <urlset> entries for one child sitemap id. Pure per-request read (no
 * build-time DB): chunk enumeration is a fixed id set; each child paginates with
 * a stable orderBy + skip/take so a given URL stays in the same child between
 * requests. Callers render the returned entries to XML.
 */
export async function buildSitemapEntries(id: number): Promise<SitemapUrlEntry[]> {
  const chunkId = Number.isFinite(id) ? id : 0;
  const chunk = classifyChunk(chunkId);
  const now = new Date();

  // --- ACTIVE auction-detail children ---
  if (chunk.kind === 'active') {
    const entries: SitemapUrlEntry[] = [];
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
    const entries: SitemapUrlEntry[] = [];
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
  const entries: SitemapUrlEntry[] = [];

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
  // Guarded (like every other DB call in this builder): a DB hiccup drops the
  // category URLs but must not 500 the whole aggregation sitemap — the index at
  // /sitemap.xml stays authoritative and the rest of chunk 0 is still valid.
  try {
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
  } catch {
    // Non-fatal — the rest of the sitemap is still useful.
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

  // --- DB-backed monthly per-province recap articles (NoticiaMonthly) ---
  // Province-index (one per province with editions) + each PUBLISHED month, both
  // locales. Single-sourced through the same aggregation child; grows ~52/month
  // but stays well under CHILD_SITEMAP_SIZE. Non-fatal if the table isn't
  // migrated yet (mirrors the guides block above).
  try {
    const monthly = await prisma.noticiaMonthly.findMany({
      where: { published: true },
      select: { province: true, period: true, generatedAt: true },
      orderBy: [{ province: 'asc' }, { period: 'desc' }],
    });
    const seenProvince = new Set<string>();
    for (const r of monthly) {
      // Province index (emit once per province, on its newest edition).
      if (!seenProvince.has(r.province)) {
        seenProvince.add(r.province);
        entries.push(
          { url: `${SITE}/noticias/${r.province}`, lastModified: r.generatedAt ?? now, changeFrequency: 'monthly', priority: 0.5 },
          { url: `${SITE}/en/noticias/${r.province}`, lastModified: r.generatedAt ?? now, changeFrequency: 'monthly', priority: 0.4 },
        );
      }
      // The monthly article (es + en).
      entries.push(
        { url: `${SITE}/noticias/${r.province}/${r.period}`, lastModified: r.generatedAt ?? now, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${SITE}/en/noticias/${r.province}/${r.period}`, lastModified: r.generatedAt ?? now, changeFrequency: 'monthly', priority: 0.4 },
      );
    }
  } catch {
    // NoticiaMonthly may not be migrated yet on some envs — non-fatal.
  }

  return entries;
}
