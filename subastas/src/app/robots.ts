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
      `${SITE}/sitemap.xml`,
    ],
    host: SITE,
  };
}
