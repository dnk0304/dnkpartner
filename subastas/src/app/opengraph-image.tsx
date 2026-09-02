/**
 * Homepage OG image (`/opengraph-image`). Next auto-wires og:image + (via the
 * sibling twitter-image re-export) twitter:image, merging with the openGraph
 * block in the page's generateMetadata. Node runtime — reads the live active
 * count; revalidated hourly so the number stays fresh without per-request cost.
 */
import { ImageResponse } from 'next/og';
import { ogFonts } from '@/lib/og/fonts';
import { OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from '@/lib/og/brand';
import { HomeOgTemplate } from '@/lib/og/templates';
import { countActiveAuctions } from '@/lib/seo/page-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // never prerender at build time (font+photo loads run on-request only)
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  let activeCount: number | null = null;
  try {
    activeCount = await countActiveAuctions({});
  } catch {
    activeCount = null;
  }
  return new ImageResponse(<HomeOgTemplate activeCount={activeCount} />, {
    ...size,
    fonts: await ogFonts(),
  });
}
