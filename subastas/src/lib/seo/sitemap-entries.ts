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
  slugify,
  type CategorySlug,
} from '@/lib/seo/slugs';
import { categoryActiveCounts, activeMunicipalityPairs } from '@/lib/seo/page-data';
import { buildAuctionSlug } from '@/lib/seo/auction-slug';
/**
 * URL-v3 (2026-08-04): detail urls in the sitemap now come from the SAME
 * resolver the page canonical and the JSON-LD use. Ken's rule was that the
 * sitemap is GENERATED here but NOT PUBLISHED by this dispatch — publication is
 * the crawl event and belongs to the switch dispatch. That separation is real
 * and mechanical, not a promise: with `URL_V3_SWITCH` unset `resolveAuctionPath`
 * returns the legacy path and `fetchV3UrlsBatch` issues no query, so this
 * served sitemap is byte-identical to the one before this change. The v3
 * sitemap can be produced and inspected on demand via
 * `scripts/url-v3-sitemap-generate.ts`, which writes to a FILE and never to a
 * served route.
 */
import { fetchV3UrlsBatch, resolveAuctionPath } from '@/lib/seo/auction-url';
import { listNoticias } from '@/lib/noticias';
import { CHILD_SITEMAP_SIZE, classifyChunk } from '@/lib/seo/sitemap-config';
import { ARCHIVE_PAGE_SIZE } from '@/lib/registro/archive-paging';
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
  /**
   * OMITTED when no real modification time is known (D5, Forge 2026-08-12).
   * An ABSENT <lastmod> is a neutral signal; a <lastmod> that always equals
   * "now" is a documented Google trust-negative -- it makes the whole sitemap
   * look like it churns daily and Google starts ignoring lastmod for the
   * domain. Never fill this with `new Date()`.
   */
  lastModified?: Date;
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

  // --- ACTIVE auction-detail children ---
  if (chunk.kind === 'active') {
    const entries: SitemapUrlEntry[] = [];
    try {
      const activeAuctions = await prisma.auction.findMany({
        // wave155: scope soft-hide gate — never list a hidden row in the sitemap.
        where: { status: { in: ACTIVE_STATUSES }, inScope: true },
        select: { id: true, auctionType: true, province: true, municipality: true, updatedAt: true },
        orderBy: { id: 'asc' }, // stable order so skip/take chunks don't overlap
        skip: chunk.skip,
        take: CHILD_SITEMAP_SIZE,
      });
      // URL-v3: ONE batch lookup per chunk, never per row — a per-row probe
      // here would be an N+1 across 20,000 rows against a 192,589-row table.
      // Returns an empty map (and issues no query) while the switch is off, so
      // the emitted urls stay byte-identical to today's sitemap.
      const v3 = await fetchV3UrlsBatch(activeAuctions.map((a) => a.id));
      for (const a of activeAuctions) {
        entries.push({
          url: `${SITE}${resolveAuctionPath(a, v3.get(a.id))}`,
          lastModified: a.updatedAt ?? undefined,
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
        // wave155: scope soft-hide gate ANDed onto the concluded-indexable set.
        where: { ...concludedIndexableWhere(), inScope: true },
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
      // URL-v3: one batch lookup per chunk (see the active band above).
      const v3 = await fetchV3UrlsBatch(rows.map((a) => a.id));
      for (const a of rows) {
        entries.push({
          url: `${SITE}${resolveAuctionPath(a, v3.get(a.id))}`,
          lastModified: a.soldDate ?? a.updatedAt ?? undefined,
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

  // ⭐ REAL hub lastmods (D5, Forge 2026-08-12). Every entry in this child used
  // to carry `lastModified: new Date()`, so all ~11,447 aggregation URLs claimed
  // to have changed on every single fetch. That is the documented way to get
  // Google to stop trusting `lastmod` for the whole domain — the opposite of
  // what we need mid-URL-migration.
  //
  // A province/town hub renders the ACTIVE auctions in its scope (the hub query
  // is active-gated), so the honest "last modified" for a hub is the newest
  // `updatedAt` among the active rows it actually shows. That set is 1,154 rows
  // corpus-wide, so this is ONE tiny indexed read, not a 241k aggregate — it
  // costs less than the town-pair query already running below it.
  //
  // Anything with no real timestamp (core pages, tipos, categories, /resultados)
  // now OMITS <lastmod> entirely rather than faking it: absent is neutral, fake
  // is negative.
  const hubLastmod = new Map<string, Date>();
  try {
    const activeRows = await prisma.auction.findMany({
      where: { status: { in: ACTIVE_STATUSES }, inScope: true },
      select: { province: true, municipality: true, updatedAt: true },
    });
    const bump = (key: string, d: Date | null) => {
      if (!d) return;
      const cur = hubLastmod.get(key);
      if (!cur || d > cur) hubLastmod.set(key, d);
    };
    // Keyed by SLUG, not DB key, so the lookup lines up 1:1 with the URLs
    // emitted below and cannot drift from them. `slugify` is the same function
    // `_municipalityPairs` folds its (provinceSlug, municipioSlug) pairs with,
    // so a slug collision folds to the MAX updatedAt of the folded group --
    // which is the correct lastmod for the single page that group renders as.
    for (const r of activeRows) {
      const provinceSlug = r.province ? PROVINCE_DB_KEY_TO_SLUG[r.province] : undefined;
      if (!provinceSlug) continue;
      bump(`p:${provinceSlug}`, r.updatedAt);
      const municipioSlug = r.municipality ? slugify(r.municipality) : '';
      if (municipioSlug) bump(`m:${provinceSlug}|${municipioSlug}`, r.updatedAt);
    }
  } catch {
    // Non-fatal — hubs simply ship with no <lastmod>, which is the neutral,
    // safe outcome. Never fall back to `now`.
  }

  // --- Core ---
  entries.push(
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE}/subastas`, changeFrequency: 'hourly', priority: 0.9 },
  );

  // --- 52 provinces (always indexable per 07 §6.1) ---
  // Wave 56 — clean URL (no /provincia/ prefix). Old URLs 301 → these via
  // middleware Rule 2b; sitemaps list canonical targets only.
  for (const slug of PROVINCE_SLUGS) {
    entries.push({
      url: `${SITE}/subastas/${slug}`,
      lastModified: hubLastmod.get(`p:${slug}`),
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
        lastModified: hubLastmod.get(`m:${p.provinceSlug}|${p.municipioSlug}`),
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
    entries.push({ url: `${SITE}/resultados`, changeFrequency: 'daily', priority: 0.8 });

    const summary = await readSummary({});
    for (const region of summary.regions) {
      const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[region.province];
      if (!provinceSlug || region.total <= 0) continue;
      // /resultados/{provincia}
      entries.push({
        url: `${SITE}/resultados/${provinceSlug}`,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
      // /resultados/{outcome}/{provincia} — only the SEO-indexable outcomes
      // (adjudicadas / desiertas) where the province actually has that outcome.
      if (region.counts.VENDIDA > 0) {
        entries.push({
          url: `${SITE}/resultados/${OUTCOME_TO_SLUG.VENDIDA}/${provinceSlug}`,
          changeFrequency: 'weekly',
          priority: 0.5,
        });
      }
      if (region.counts.DESIERTA > 0) {
        entries.push({
          url: `${SITE}/resultados/${OUTCOME_TO_SLUG.DESIERTA}/${provinceSlug}`,
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
        changeFrequency: 'weekly',
        priority: 0.5,
      });
    }

    // ── /resultados/{provincia}/{municipio}/pagina/{n} — the archive's deep
    // pages (Forge, 2026-08-12). A crawl path Google is not TOLD about is found
    // slowly, and these pages are the mechanism that de-orphans the concluded
    // corpus, so they are advertised rather than left to link discovery.
    //
    // TOWN LEVEL ONLY — a deliberate scoping, measured on prod 2026-08-12:
    //   town archives (11,677 towns)      → 5,086 pages at n>=2   ← emitted
    //   province archives (52)            → 7,333 pages at n>=2   ← NOT emitted
    //   outcome x province (104)          → 7,171 pages at n>=2   ← NOT emitted
    // Child 0 measured 11,447 URLs. +5,086 = ~16,533, inside CHILD_SITEMAP_SIZE
    // (20,000) with ~3,400 headroom. Emitting all three bands would be ~31,000
    // and the aggregation band has NO chunking, so it would silently truncate or
    // overflow. The two omitted bands are also pure duplicate coverage: they
    // page over the SAME concluded details the town archives already expose, one
    // level shallower. They exist as routes and are crawlable by link; they are
    // simply not submitted.
    //
    // The cap below is a STRUCTURAL guard, not a comment: the archive grows, and
    // the day this band would cross the cap it must stop and be visible in the
    // logs, never quietly emit a 20,001st URL into an unchunked child.
    let emitted = entries.length;
    let paginaSkipped = 0;
    for (const p of muniPairs) {
      const pages = Math.ceil(p.total / ARCHIVE_PAGE_SIZE);
      for (let n = 2; n <= pages; n++) {
        if (emitted >= CHILD_SITEMAP_SIZE) {
          paginaSkipped++;
          continue;
        }
        entries.push({
          url: `${SITE}/resultados/${p.provinceSlug}/${p.municipioSlug}/pagina/${n}`,
          changeFrequency: 'weekly',
          priority: 0.4,
        });
        emitted++;
      }
    }
    if (paginaSkipped > 0) {
      console.warn(
        `[sitemap] aggregation child hit CHILD_SITEMAP_SIZE (${CHILD_SITEMAP_SIZE}); ` +
          `${paginaSkipped} /resultados pagina URLs omitted. The aggregation band needs ` +
          `chunking before the archive grows further.`,
      );
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
        lastModified: g.updatedAt ?? g.publishedAt ?? undefined,
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
      { url: `${SITE}/noticias`, changeFrequency: 'weekly', priority: 0.6 },
      { url: `${SITE}/en/noticias`, changeFrequency: 'weekly', priority: 0.5 },
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
          { url: `${SITE}/noticias/${r.province}`, lastModified: r.generatedAt ?? undefined, changeFrequency: 'monthly', priority: 0.5 },
          { url: `${SITE}/en/noticias/${r.province}`, lastModified: r.generatedAt ?? undefined, changeFrequency: 'monthly', priority: 0.4 },
        );
      }
      // The monthly article (es + en).
      entries.push(
        { url: `${SITE}/noticias/${r.province}/${r.period}`, lastModified: r.generatedAt ?? undefined, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${SITE}/en/noticias/${r.province}/${r.period}`, lastModified: r.generatedAt ?? undefined, changeFrequency: 'monthly', priority: 0.4 },
      );
    }
  } catch {
    // NoticiaMonthly may not be migrated yet on some envs — non-fatal.
  }

  return entries;
}
