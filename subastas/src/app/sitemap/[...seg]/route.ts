/**
 * src/app/sitemap/[...seg]/route.ts — the CHILD sitemaps, served as plain Route
 * Handlers at /sitemap/{id}.xml (ids 0 .. TOTAL_CHILDREN-1).
 *
 * WHY A ROUTE HANDLER (not Next's metadata `generateSitemaps()`): the metadata
 * convention (an `app/sitemap.ts` with generateSitemaps) compiles to the dynamic
 * page `/sitemap/[__metadata_id__]`, which COLLIDES with the sibling
 * `app/sitemap.xml/route.ts` we need for the top-level <sitemapindex> — Next
 * can't resolve the metadata page during page-data collection and the production
 * build fails (PageNotFoundError, wave150). Dropping the metadata convention and
 * serving every sitemap as a Route Handler removes the collision while keeping
 * the exact same public URL scheme: /sitemap.xml (index) + /sitemap/{id}.xml (children).
 *
 * A catch-all `[...seg]` is required because `{id}.xml` is not a valid single
 * dynamic segment name. seg[0] is parsed as "{id}.xml".
 *
 * Body logic is single-sourced in `src/lib/seo/sitemap-entries.ts` (ported from
 * the old metadata sitemap.ts default export). Request-time only
 * (`dynamic='force-dynamic'`, `revalidate=0`) — never a build-time DB dependency.
 */

import { buildSitemapEntries, type SitemapUrlEntry } from '@/lib/seo/sitemap-entries';
import { TOTAL_CHILDREN } from '@/lib/seo/sitemap-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Escape the five XML predefined entities so a slug with & / < can't break the doc. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderUrlset(entries: SitemapUrlEntry[]): string {
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(e.url)}</loc>`];
      if (e.lastModified) parts.push(`    <lastmod>${e.lastModified.toISOString()}</lastmod>`);
      if (e.changeFrequency) parts.push(`    <changefreq>${e.changeFrequency}</changefreq>`);
      if (typeof e.priority === 'number') parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    (urls ? `${urls}\n` : '') +
    `</urlset>\n`
  );
}

function notFound(): Response {
  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ seg: string[] }> },
): Promise<Response> {
  const { seg } = await ctx.params;

  // Exactly one segment, shaped "{id}.xml". Anything else (nested paths, no .xml)
  // is not an advertised child → 404 (mirrors the old metadata behaviour: an
  // un-enumerated id returned 404, not empty XML).
  if (!Array.isArray(seg) || seg.length !== 1) return notFound();
  const name = seg[0];
  if (!name.endsWith('.xml')) return notFound();

  const idStr = name.slice(0, -'.xml'.length);
  if (!/^\d+$/.test(idStr)) return notFound();
  const id = Number.parseInt(idStr, 10);

  // Only serve the advertised range 0 .. TOTAL_CHILDREN-1. Ids past the published
  // set 404 so the public count can't be probed past what robots/the index list.
  if (id < 0 || id >= TOTAL_CHILDREN) return notFound();

  const entries = await buildSitemapEntries(id);
  const body = renderUrlset(entries);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
