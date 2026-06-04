/**
 * src/lib/auction-image-url.ts — SHARED image-URL ladder for the auction
 * thumbnail across the WHOLE system (site cards + detail modal + alert email).
 *
 * Wave52 imagery-ladder unification (Ken-locked 2026-06-04).
 * Replaces the broken hot-link to `tile.openstreetmap.org` in:
 *   - lib/map-image.ts                (site cards / detail modal)
 *   - lib/email-templates.ts          (alert email)
 *
 * OSM blocks server-side / bulk / email hot-linking (policy: osm.wiki/Blocked).
 * That made every rung-2 thumbnail render as a broken-image icon. The fix is
 * a single source of truth that picks the right fallback URL:
 *
 *   Rung 1  Street View / resolver photo  → /api/auction-image/<boeId> (or absolute)
 *   Rung 2  Google Static Maps pin        → maps.googleapis.com/maps/api/staticmap
 *   Rung 3  Branded raster PNG placeholder→ /images/email-placeholder.png
 *
 * IMPORTANT — degrade-to-placeholder behaviour:
 *   The Google Maps Static API may not yet be enabled on the GCP project
 *   (Dennis-action: enable "Maps Static API" toggle on the same key that
 *   already powers Street View + Geocoding). Until then, calls to the
 *   staticmap URL would 403. The ladder is built so that when we know the
 *   API can't fire (no key configured, or `STATIC_MAPS_API_DISABLED=1`),
 *   we fall STRAIGHT to the rung-3 branded placeholder — NEVER to an OSM
 *   hot-link. The moment Dennis enables the toggle (or unsets the disable
 *   flag) the pins light up with zero redeploy.
 *
 * Env flags:
 *   - GOOGLE_MAPS_API_KEY            → key used for both Static Maps + Street View
 *   - STATIC_MAPS_API_DISABLED=1     → manual kill switch (force rung 3 even if key set)
 *
 * All callers feed in coords from the same projection (`latitude`, `longitude`).
 * The email branch additionally needs the appUrl to produce absolute https URLs
 * (email clients can't resolve relative paths); the site branch returns relative
 * URLs so `next/image` handles them.
 */

/** Branded placeholder asset path — PNG, renders in Gmail/Outlook (SVG does not). */
export const BRANDED_PLACEHOLDER_PATH = '/images/email-placeholder.png';

/** The remote host the email/static-map branch points at. */
export const GOOGLE_STATIC_MAPS_HOST = 'maps.googleapis.com';

/**
 * Internal: is the Static Maps API usable right now?
 *
 * "Usable" = (a) we have a key AND (b) the manual kill switch is not set.
 * If the key is missing OR STATIC_MAPS_API_DISABLED=1, we must NOT emit a
 * static-map URL — we degrade to the branded placeholder. NEVER an OSM tile.
 */
export function isStaticMapsApiUsable(): boolean {
  if (process.env.STATIC_MAPS_API_DISABLED === '1') return false;
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  return Boolean(key && key.trim().length > 0);
}

/**
 * Build a Google Static Maps URL for a coord pair, with a red pin at the same
 * lat/lng. Centered, baked-in pin (no overlay needed at render time).
 *
 *   https://maps.googleapis.com/maps/api/staticmap?center=LAT,LNG&zoom=16&size=640x400&scale=2&markers=color:red%7CLAT,LNG&key=KEY
 *
 * Returns null when (a) coords are missing/invalid, or (b) the API isn't usable
 * — the caller is responsible for falling back to the branded placeholder
 * (see `staticMapImageUrl()` below for the wrapped helper that does that).
 */
export function googleStaticMapUrl(
  latitude: number,
  longitude: number,
  opts: { zoom?: number; widthPx?: number; heightPx?: number; scale?: 1 | 2 } = {},
): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!isStaticMapsApiUsable()) return null;
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY!;
  const zoom = opts.zoom ?? 16;
  const w = opts.widthPx ?? 640;
  const h = opts.heightPx ?? 400;
  const scale = opts.scale ?? 2;
  const lat = latitude.toFixed(6);
  const lng = longitude.toFixed(6);
  // %7C is `|` — the Static Maps `markers` style/coord separator.
  const markers = `color:red%7C${lat},${lng}`;
  return (
    `https://${GOOGLE_STATIC_MAPS_HOST}/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${w}x${h}` +
    `&scale=${scale}` +
    `&markers=${markers}` +
    `&key=${encodeURIComponent(key)}`
  );
}

/**
 * Resolve a rung-2 image URL for the SITE card surface (relative URL, served
 * via next/image / direct fetch).
 *
 * Returns either:
 *   - The Google Static Maps URL (rung 2, when API usable + coords valid), OR
 *   - The branded placeholder path (rung 3 fallback — NEVER an OSM tile)
 *
 * NB: this is the rung-2/3 helper only. Rung 1 (real photo) is handled by the
 * caller (resolveCardImage) — it's an `/api/auction-image/<boeId>` URL.
 */
export function siteFallbackImageUrl(
  latitude: number | null,
  longitude: number | null,
  _category?: string | null,
): string {
  if (latitude != null && longitude != null) {
    const sm = googleStaticMapUrl(latitude, longitude);
    if (sm) return sm;
  }
  return BRANDED_PLACEHOLDER_PATH;
}

/**
 * Resolve a rung-2 image URL for the EMAIL surface (ABSOLUTE https URL — email
 * clients can't resolve relative paths).
 *
 * Same ladder as the site, but the rung-3 placeholder is absolute-prefixed
 * with `appUrl`. Google Static Maps URLs are already absolute.
 */
export function emailFallbackImageUrl(
  latitude: number | null,
  longitude: number | null,
  appUrl: string,
  _category?: string | null,
): string {
  if (latitude != null && longitude != null) {
    const sm = googleStaticMapUrl(latitude, longitude);
    if (sm) return sm;
  }
  return `${appUrl}${BRANDED_PLACEHOLDER_PATH}`;
}
