/**
 * Twitter card image for `/` — identical render to the OG image, re-exported
 * so Next emits both `og:image` and `twitter:image` (the page keeps its
 * `summary_large_image` card). One template, two meta tags.
 *
 * Segment config must be statically analyzable literals in this file — Next
 * cannot follow a re-exported `runtime`/`revalidate` — so it mirrors the
 * sibling `opengraph-image.tsx` explicitly.
 */
import { OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from '@/lib/og/brand';

export const runtime = 'nodejs';
export const revalidate = 3600;
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export { default } from './opengraph-image';
