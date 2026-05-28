import type { MetadataRoute } from 'next';

/**
 * Sitemap — generated at /sitemap.xml by Next's app-router metadata file
 * convention. Phase 1 only ships the post-strip surface; portfolio routes
 * will be appended here as Phase 2+ delivers them.
 */

const BASE_URL = 'https://dnkpartner.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${BASE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
