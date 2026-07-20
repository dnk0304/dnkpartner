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

import { sitemapChildUrls } from '@/lib/seo/sitemap-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SITE = 'https://subastasactivas.com';

export async function GET(): Promise<Response> {
  // The child sitemaps change frequently (the scraper refreshes active daily and
  // appends concluded rows), so a fresh index lastmod is honest, not fake — it
  // signals "re-check the children". Child ids are a fixed set: no DB call here.
  const lastmod = new Date().toISOString();
  const children = sitemapChildUrls(SITE);

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    children
      .map(
        (loc) =>
          `  <sitemap>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`,
      )
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
