/**
 * robots.txt (07 §4 — crawl-budget protection).
 *
 * Disallow /*? — blocks every query-string URL so crawlers don't burn budget
 * on infinite facet combinations (sort, page, multi-select, price slider).
 * All indexable state is in the path; nothing indexable needs a query param.
 *
 * Sitemap lines are generated from the SHARED layout (sitemap-config.ts) via
 * sitemapChildUrls(), so robots.txt always references EXACTLY the children that
 * generateSitemaps() produces — no hardcoded /sitemap/0..3.xml drift (07 §4).
 */

import type { MetadataRoute } from 'next';
import { sitemapChildUrls } from '@/lib/seo/sitemap-config';

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
    // Every published child sitemap (aggregation + active + phased concluded).
    // Matches generateSitemaps() by construction — both call the same layout.
    sitemap: sitemapChildUrls(SITE),
    host: SITE,
  };
}
