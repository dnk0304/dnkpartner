/**
 * Map Image Generator — keyless OSM raster tile (slippy-map) thumbnails.
 *
 * Background: until 2026-06-02 this module pointed at
 * `staticmap.openstreetmap.de` (a discontinued static-map render service
 * whose DNS no longer resolves), which broke the rung-2 map-pin thumbnail
 * on every geocoded listing.
 *
 * Replacement: a single OSM raster tile from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
 * the same keyless host already used by the live Leaflet maps elsewhere in
 * the app. Tile coords are computed from the listing's lat/lng via the
 * standard Web-Mercator slippy-map formula.
 *
 * The returned URL is a single 256×256 PNG. The point's exact intra-tile
 * position is exposed separately via `getMapPinPosition()` so callers can
 * overlay a pin at the property's real location (the lat/lng is rarely at
 * the tile centre — it can land anywhere inside the tile). The card box uses
 * `object-position` with that fractional position so the pin sits centred on
 * the rendered thumbnail, with the surrounding map panned to match.
 *
 * Keyless, no API key, no signup. Width/height arguments are retained for
 * backwards compatibility (the API route at /api/auctions calls this with
 * 800×600) but a tile is always 256×256 — the CSS box drives display size.
 */

// OSM serves zoom levels 0–19 inclusive. Anything outside is a 404.
const MIN_ZOOM = 0;
const MAX_ZOOM = 19;

/**
 * Convert lng/lat to slippy-map tile x/y at the given zoom.
 * Returns the integer tile indices AND the fractional position within that
 * tile (0–1) so an overlay can be positioned at the exact point.
 *
 * Standard Web-Mercator formula:
 *   x_float = (lng + 180) / 360 * 2^z
 *   y_float = (1 - ln(tan(lat·π/180) + sec(lat·π/180)) / π) / 2 * 2^z
 */
function lngLatToTile(latitude: number, longitude: number, zoom: number) {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(zoom)));
  const n = Math.pow(2, z);
  const xFloat = ((longitude + 180) / 360) * n;
  const latRad = (latitude * Math.PI) / 180;
  const yFloat =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xFloat);
  const y = Math.floor(yFloat);
  return {
    z,
    x,
    y,
    // Fractional position inside the tile, 0–1.
    fx: xFloat - x,
    fy: yFloat - y,
  };
}

/**
 * Generate a static map tile URL for the given coordinates.
 *
 * @param latitude - Latitude coordinate
 * @param longitude - Longitude coordinate
 * @param _width - DEPRECATED: ignored (tiles are always 256×256). Kept for backwards compat.
 * @param _height - DEPRECATED: ignored. Kept for backwards compat.
 * @param zoom - Zoom level (clamped to 0–19, OSM's served range)
 * @returns Tile URL, or the local placeholder SVG when coords are missing.
 */
export function generateMapImageUrl(
  latitude: number | null,
  longitude: number | null,
  _width: number = 400,
  _height: number = 200,
  zoom: number = 16,
): string {
  // No-coords guard — preserved from the original implementation. The
  // resolve-card-image rung-3 SVG covers the no-coords case in the UI; this
  // local placeholder is the API-layer fallback.
  if (latitude == null || longitude == null) {
    return '/images/map-placeholder.svg';
  }

  const { z, x, y } = lngLatToTile(latitude, longitude, zoom);
  // Apex host (not the `{s}.` subdomain form): next/image remotePatterns
  // needs a concrete hostname, and the apex returned HTTP 200 in probes.
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/**
 * Generate responsive map image URLs for the various card slots.
 *
 * NOTE: with single-tile rendering, every size key resolves to the same tile
 * URL — a tile is always 256×256 and the CSS box (object-cover + object-position)
 * scales it into whatever box the surface needs. The shape of the return object
 * is preserved unchanged because callers in resolve-card-image.ts destructure
 * by size key — do NOT remove keys.
 */
export function generateResponsiveMapImages(
  latitude: number | null,
  longitude: number | null,
  zoom: number = 17,
) {
  const tile = generateMapImageUrl(latitude, longitude, 0, 0, zoom);
  return {
    thumbnail: tile,
    small: tile,
    card: tile,
    medium: tile,
    large: tile,
  };
}

/**
 * Get the pin overlay position for the given coordinates at the given zoom.
 * Returned as percentages 0–100 so a surface can set `object-position` on the
 * tile image (panning the tile so the point is centred) and place a centred
 * pin element on top of the rendered box.
 *
 * Returns null when coords are missing — the caller should not render a pin.
 */
export function getMapPinPosition(
  latitude: number | null,
  longitude: number | null,
  zoom: number = 17,
): { xPct: number; yPct: number } | null {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const { fx, fy } = lngLatToTile(latitude, longitude, zoom);
  return {
    xPct: fx * 100,
    yPct: fy * 100,
  };
}

/**
 * Get optimal zoom level based on property type.
 *
 * Closer zoom for buildings (where a precise pin matters), wider for
 * land/vehicles (where the neighbourhood is the useful context).
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
