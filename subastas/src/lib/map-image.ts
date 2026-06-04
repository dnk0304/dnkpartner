/**
 * Map Image Generator — Google Static Maps pin (rung 2 of the imagery ladder).
 *
 * History:
 *   - Until 2026-06-02: pointed at `staticmap.openstreetmap.de` (discontinued,
 *     DNS dead) — rung-2 thumbnails broke on every geocoded listing.
 *   - 2026-06-02 → 2026-06-04: pointed at `https://tile.openstreetmap.org/...`
 *     — better than dead DNS, but OSM blocks server-side / bulk / email
 *     hot-linking (policy: osm.wiki/Blocked), so the tiles still rendered as
 *     a broken-image icon in production for the majority of requests.
 *   - 2026-06-04 (wave52, this file): the rung-2 fallback now uses Google
 *     Static Maps via the SHARED helper in `src/lib/auction-image-url.ts`.
 *     If the Static Maps API isn't enabled on the GCP project (Dennis-action
 *     toggle), we degrade STRAIGHT to the branded rung-3 PNG — NEVER back
 *     to an OSM hot-link.
 *
 * IMPORTANT — pin overlay no longer needed for rung 2:
 *   With Google Static Maps the marker is BAKED INTO the image (centered on
 *   the auction's coords). The intra-tile `object-position` pin overlay that
 *   was needed for the slippy OSM tile is now superfluous when the rung-2 URL
 *   is a Static Maps URL. `getMapPinPosition()` is kept as a stable API (some
 *   callers in `resolve-card-image.ts` still destructure it) but now returns
 *   `null` for any input — callers should treat null as "no overlay needed".
 *
 *   For rung-3 (branded PNG placeholder) there is also no pin overlay.
 *
 * Function signatures + `generateResponsiveMapImages` return-shape are
 * PRESERVED so existing callers in `resolve-card-image.ts` (which destructure
 * by size key) keep working with zero call-site changes.
 */
import { siteFallbackImageUrl } from './auction-image-url';

/**
 * Generate a fallback image URL for the given coordinates.
 *
 * Now returns the SHARED rung-2/3 ladder result:
 *   - Google Static Maps URL (when API usable + coords valid)
 *   - Branded placeholder PNG (otherwise — NEVER an OSM URL)
 *
 * @param latitude  - Latitude coordinate (or null when row has no coords)
 * @param longitude - Longitude coordinate (or null when row has no coords)
 * @param _width    - DEPRECATED: ignored (Static Maps sizing handled internally). Kept for backwards compat.
 * @param _height   - DEPRECATED: ignored. Kept for backwards compat.
 * @param _zoom     - DEPRECATED: handled by the shared helper. Kept for backwards compat.
 */
export function generateMapImageUrl(
  latitude: number | null,
  longitude: number | null,
  _width: number = 400,
  _height: number = 200,
  _zoom: number = 16,
): string {
  return siteFallbackImageUrl(latitude, longitude);
}

/**
 * Generate responsive map image URLs for the various card slots.
 *
 * Shape PRESERVED — `resolve-card-image.ts` destructures by key. Every key
 * resolves to the same URL because the Google Static Maps image (or the
 * branded placeholder) is a single asset that scales via CSS / next/image.
 */
export function generateResponsiveMapImages(
  latitude: number | null,
  longitude: number | null,
  _zoom: number = 17,
) {
  const url = generateMapImageUrl(latitude, longitude);
  return {
    thumbnail: url,
    small: url,
    card: url,
    medium: url,
    large: url,
  };
}

/**
 * Pin overlay position — DEPRECATED.
 *
 * Google Static Maps bakes the marker into the image at the center, so a
 * separate pin overlay is no longer needed for the rung-2 surface. The
 * function is kept so existing callers (resolve-card-image.ts) continue to
 * compile and run, but it now always returns `null`. Callers should treat
 * `null` as "do not render a pin overlay — the pin is in the image (or this
 * is the branded placeholder which has no pin)".
 */
export function getMapPinPosition(
  _latitude: number | null,
  _longitude: number | null,
  _zoom: number = 17,
): { xPct: number; yPct: number } | null {
  return null;
}

/**
 * Get optimal zoom level based on property type. Preserved for callers that
 * want a sensible zoom hint; the Static Maps helper uses its own default
 * (zoom 16) but this map remains useful for any future per-category tuning.
 */
export function getOptimalZoom(category: string): number {
  const zoomLevels: Record<string, number> = {
    'Viviendas': 18,
    'Locales': 18,
    'Garajes': 19,
    'Terrenos': 16,
    'Fincas rústicas': 15,
    'Naves industriales': 17,
    'Turismos': 17,
    'Motocicletas': 17,
    'Barcos': 16,
    'default': 17,
  };

  return zoomLevels[category] || zoomLevels.default;
}
