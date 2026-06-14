/**
 * Pure key/URL helpers for the self-hosted OSM map (wave105, 2026-06-14).
 *
 * SPLIT FROM osm-map.ts deliberately: osm-map.ts imports `node:fs/promises` and
 * `sharp` (server-only, for tile stitching + caching). This file is imported by
 * `auction-image-url.ts`, which is in turn pulled into CLIENT bundles via
 * `map-image.ts` → `resolve-card-image.ts`. Keeping the pure string helpers here
 * (zero fs / zero sharp) lets the client compute the deterministic map URL
 * without dragging server-only modules into the browser bundle.
 *
 * Encoding alphabet is UNAMBIGUOUS: sign → 'n', decimal point → 'd', fields
 * joined by '_'. Round-trips via decodeMapKey().
 *   mapKeyFor(40.4168, -3.7038) → "m_40d416800_n3d703800_z16"
 */

export const DEFAULT_MAP_ZOOM = 16;

export function mapKeyFor(latitude: number, longitude: number, zoom: number = DEFAULT_MAP_ZOOM): string {
  const enc = (v: number): string => (v < 0 ? 'n' : '') + Math.abs(v).toFixed(6).replace('.', 'd');
  return `m_${enc(latitude)}_${enc(longitude)}_z${zoom}`;
}

/** Reverse of {@link mapKeyFor}. Returns null for a malformed key. */
export function decodeMapKey(key: string): { lat: number; lng: number; zoom: number } | null {
  const m = /^m_(n?\d+d\d{6})_(n?\d+d\d{6})_z(\d{1,2})$/.exec(key);
  if (!m) return null;
  const dec = (s: string): number => {
    const neg = s.startsWith('n');
    const v = Number((neg ? s.slice(1) : s).replace('d', '.'));
    return neg ? -v : v;
  };
  const lat = dec(m[1]);
  const lng = dec(m[2]);
  const zoom = parseInt(m[3], 10);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return null;
  return { lat, lng, zoom };
}

const SAFE_KEY_RE = /^[A-Za-z0-9_.-]{1,128}$/;
export function isValidMapKey(raw: string): boolean {
  return SAFE_KEY_RE.test(raw);
}

export function mapPublicPathFor(key: string): string {
  return `/api/auction-map/${encodeURIComponent(key)}`;
}

/**
 * Sensible zoom per category for the stitched map. Kept here (pure) so both the
 * client URL builder and the server stitcher agree on the same zoom → same key.
 */
export function getOptimalMapZoom(category: string | null | undefined): number {
  const z: Record<string, number> = {
    Viviendas: 17,
    Locales: 17,
    Garajes: 18,
    Terrenos: 15,
    'Fincas rústicas': 14,
    'Naves industriales': 16,
  };
  return (category && z[category]) || DEFAULT_MAP_ZOOM;
}
