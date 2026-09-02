/**
 * Twitter card for the auction detail page — same render as the OG image.
 * Segment config is inlined (Next can't statically read re-exported config).
 */
import { OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from '@/lib/og/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // never prerender at build time (font+photo loads run on-request only)
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export { default } from './opengraph-image';
