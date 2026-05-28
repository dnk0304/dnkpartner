import type { MetadataRoute } from 'next';

/**
 * /robots.txt — Next app-router convention. Phase 1 has no gated product
 * surface yet; /api/* is server-only and stays disallowed. Future portfolio
 * routes (/studio, /subastas, /defensapenal) will be added here when they
 * land in Phase 2+.
 */

const BASE_URL = 'https://dnkpartner.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
