/**
 * robots.txt (07 §4 — crawl-budget protection).
 *
 * Disallow /*? — blocks every query-string URL so crawlers don't burn budget
 * on infinite facet combinations (sort, page, multi-select, price slider).
 * All indexable state is in the path; nothing indexable needs a query param.
 *
 * The Sitemap line points at the single sitemap INDEX (sitemap-config.ts →
 * sitemapIndexUrl), the same URL submitted to GSC; Google follows it to the
 * children served by app/sitemap/[...seg]/route.ts. Single-sourced so nothing
 * can drift from the actual child routes (07 §4).
 */

import type { MetadataRoute } from 'next';
import { sitemapIndexUrl } from '@/lib/seo/sitemap-config';

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
    // Advertise the single sitemap INDEX (served by src/app/sitemap.xml/route.ts).
    // Google follows it to every child — same URL Dennis submits to GSC. Kept in
    // sitemap-config.ts so robots ⇔ index ⇔ children can't drift.
    sitemap: sitemapIndexUrl(SITE),
    host: SITE,
  };
}
