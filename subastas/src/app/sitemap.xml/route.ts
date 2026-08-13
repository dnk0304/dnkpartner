/**
 * src/app/sitemap.xml/route.ts — the sitemap INDEX.
 *
 * WHY THIS EXISTS: Next's metadata `generateSitemaps()` (src/app/sitemap.ts)
 * emits the CHILD sitemaps at /sitemap/{id}.xml but does NOT emit a top-level
 * /sitemap.xml sitemap-index — so /sitemap.xml 404s on this Next version
 * (16.1.3, confirmed live wave149). Dennis submits exactly ONE URL to GSC —
 * `${SITE}/sitemap.xml` — and Google follows it to the children. A 404 there
 * means Google fetches nothing. This route handler fills that gap with a valid
 * <sitemapindex> listing every published child.
 *
 * Single-sourced: the child list comes from `sitemapChildUrls()` in
 * sitemap-config.ts — the SAME layout generateSitemaps() and robots.ts use — so
 * the index can never drift from the actual child routes.
 *
 * Request-time only (`dynamic='force-dynamic'`) — no build-time DB dependency,
 * matching the children's doctrine. The index itself does no DB work; it just
 * enumerates the fixed child id set.
 */

import { AuctionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CHILD_SITEMAP_SIZE, buildSitemapLayout, type SitemapLayout } from '@/lib/seo/sitemap-config';
import { buildAggregationEntries, type SitemapUrlEntry } from '@/lib/seo/sitemap-entries';
import { concludedIndexableWhere } from '@/lib/seo/concluded-indexable';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SITE = 'https://subastasactivas.com';

const ACTIVE_STATUSES: AuctionStatus[] = [
  AuctionStatus.ACTIVE,
  AuctionStatus.CELEBRANDOSE,
  AuctionStatus.PRE_AUCTION,
  AuctionStatus.PROXIMA_APERTURA,
];

/**
 * ⭐ REAL per-child <lastmod> (D5, Forge 2026-08-12).
 *
 * This used to be `new Date().toISOString()` for EVERY child, recomputed per
 * request — verified live 2026-08-12, all five children reported the identical
 * timestamp and it changed on every fetch. The former comment argued this was
 * "honest, not fake" because the children do change often. It is not: a lastmod
 * that is never once observed to hold still tells Google the entire index churns
 * continuously, and the documented response is that Google stops trusting
 * `lastmod` for the domain. During a URL migration, when we are specifically
 * asking for a re-crawl, that is the most expensive signal we could send.
 *
 * Each child's real lastmod is the MAX lastmod of the entries it contains:
 *
 *  - aggregation band — the MAX of the entries in that specific child's slice.
 *    The band is chunked as of P3, so a single figure shared across its children
 *    would be wrong for all but one of them.
 *
 *  - active band — keyed on `updatedAt` over the ACTIVE row set (1,154 rows
 *    corpus-wide), so one indexed `_max` aggregate answers it. Cheap.
 *
 *  - concluded band — each child is `orderBy soldDate DESC` over a fixed skip
 *    window, so the FIRST row of the window IS the window's max. One `findFirst`
 *    with the band's own skip: exact, and no aggregate over 20k rows.
 *
 * Anything we cannot resolve OMITS <lastmod> rather than substituting `now`.
 * `<lastmod>` is optional in a sitemapindex; absent is a neutral signal, and a
 * neutral signal beats a false one. The whole block is wrapped so a DB hiccup
 * degrades to a valid, lastmod-free index instead of 500ing the one URL Dennis
 * submits to GSC.
 */
async function childLastmods(
  layout: SitemapLayout,
  aggregation: readonly SitemapUrlEntry[],
): Promise<Map<number, Date>> {
  const out = new Map<number, Date>();
  try {
    const activeMax = await prisma.auction.aggregate({
      where: { status: { in: ACTIVE_STATUSES }, inScope: true },
      _max: { updatedAt: true },
    });
    const activeUpdatedAt = activeMax._max.updatedAt ?? null;

    for (const id of layout.ids()) {
      const chunk = layout.classify(id);
      if (chunk.kind === 'aggregation') {
        // ⭐ THE ACTUAL MAX OF THIS CHILD'S OWN ENTRIES (D5, and P3 brief §3).
        // Not `new Date()`, and — now that the band is chunked — not the band's
        // global max either: with two aggregation children, one figure for both
        // would be wrong for at least one of them. Most aggregation entries
        // legitimately have NO lastmod (a tipo or category hub has no single
        // modification time), and if a slice has none at all the child OMITS
        // <lastmod> rather than inventing one. Absent is neutral; fake is a
        // trust negative, and earning crawl trust is the whole point of the wave.
        let max: Date | null = null;
        for (const e of aggregation.slice(chunk.skip, chunk.skip + CHILD_SITEMAP_SIZE)) {
          if (e.lastModified && (!max || e.lastModified > max)) max = e.lastModified;
        }
        if (max) out.set(id, max);
        continue;
      }
      if (chunk.kind === 'active') {
        if (activeUpdatedAt) out.set(id, activeUpdatedAt);
        continue;
      }
      // Concluded: first row of this child's window == the window's max.
      const head = await prisma.auction.findFirst({
        where: { ...concludedIndexableWhere(), inScope: true },
        orderBy: [{ soldDate: 'desc' }, { id: 'asc' }],
        skip: chunk.skip,
        take: 1,
        select: { soldDate: true, updatedAt: true },
      });
      const d = head?.soldDate ?? head?.updatedAt ?? null;
      if (d) out.set(id, d);
    }
  } catch {
    // Degrade to a lastmod-free index. Never fall back to `now`.
  }
  return out;
}

export async function GET(): Promise<Response> {
  // The aggregation band's width is derived from its own URL count, so the
  // index has to know that count before it can list the children. One cached
  // read (`readArchiveCensus` is `unstable_cache`d hourly) on a route that
  // already queries the DB — and it is what makes an empty child impossible.
  const aggregation = await buildAggregationEntries();
  const layout = buildSitemapLayout(aggregation.length);
  const children = layout.urls(SITE);
  const ids = layout.ids();
  const lastmods = await childLastmods(layout, aggregation);

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    children
      .map((loc, i) => {
        const d = lastmods.get(ids[i]);
        const lm = d ? `\n    <lastmod>${d.toISOString()}</lastmod>` : '';
        return `  <sitemap>\n    <loc>${loc}</loc>${lm}\n  </sitemap>`;
      })
      .join('\n') +
    `\n</sitemapindex>\n`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
