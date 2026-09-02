/**
 * Remote auction-photo loader for the auction OG image.
 *
 * The stored `imageUrl` is a SITE-RELATIVE path served by this same app
 * (`/api/auction-image/<boeId>` or a legacy `/streetview/…`). Satori's `<img>`
 * can take a URL, but we fetch the bytes ourselves so we control the two things
 * that would otherwise break page-independent rendering:
 *   1. a hard TIMEOUT — a slow photo must never stall OG generation, and
 *   2. a clean FALLBACK — any non-raster / missing / failed fetch returns null
 *      so the template drops to its branded no-photo panel.
 *
 * Only real raster photos are attempted (`isRealAuctionImage`); SVG
 * placeholders and static-map URLs are rejected up front (Satori can't
 * rasterise SVG via <img>, and a map tile is not the auction).
 */
import { isRealAuctionImage } from '../auction-image-projection';
import { SITE_ORIGIN } from '../seo/alternates';

const TIMEOUT_MS = 2500;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB guard

/** Returns a `data:` URL for the photo, or null to trigger the branded fallback. */
export async function loadAuctionPhoto(imageUrl: string | null | undefined): Promise<string | null> {
  if (!isRealAuctionImage(imageUrl)) return null;
  const abs = imageUrl!.startsWith('http') ? imageUrl! : `${SITE_ORIGIN}${imageUrl}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(abs, { signal: controller.signal });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    // Reject anything that isn't a raster image Satori can decode.
    if (!/^image\/(jpe?g|png|webp|gif)/i.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
    const b64 = Buffer.from(buf).toString('base64');
    const mime = type.split(';')[0].trim();
    return `data:${mime};base64,${b64}`;
  } catch {
    return null; // timeout, network error, abort → branded fallback
  } finally {
    clearTimeout(timer);
  }
}
