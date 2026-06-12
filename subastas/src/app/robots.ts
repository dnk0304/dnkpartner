/**
 * robots.txt (07 §4 — crawl-budget protection).
 *
 * Disallow /*? — blocks every query-string URL so crawlers don't burn budget
 * on infinite facet combinations (sort, page, multi-select, price slider).
 * All indexable state is in the path; nothing indexable needs a query param.
 *
 * Sitemap lines reference every child sitemap so Google discovers them all.
 */

import type { MetadataRoute } from 'next';

const SITE = 'https://subastasactivas.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/*?',                 // kill all query-param URLs
          '/admin',
          '/admin/',
          '/api/',
          '/auth/',
          '/login',
          '/register',
        ],
      },
    ],
    sitemap: [
      // Chunked via generateSitemaps() (town-pages Phase 2) — fixed ID set,
      // must match 1 + DETAIL_CHUNKS in src/app/sitemap.ts.
      `${SITE}/sitemap/0.xml`,
      `${SITE}/sitemap/1.xml`,
      `${SITE}/sitemap/2.xml`,
      `${SITE}/sitemap/3.xml`,
    ],
    host: SITE,
  };
}
