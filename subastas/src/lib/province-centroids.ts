/**
 * province-centroids.ts — static geographic centroids for the 52 Spanish
 * provinces + client-side nearest-province resolution (haversine).
 *
 * PHASE 1 of "subastas cerca de ti" (home-funnel-redesign brief, 2026-07-10):
 * the browser gives us a lat/lng on user gesture; we snap it to the nearest
 * province centroid and drive the EXISTING `province` param on
 * `/api/auctions/carousel-mix`. Zero backend changes.
 *
 * PHASE 2 (deliberately NOT built this wave): true radius-sorted "nearby"
 * results would need a server endpoint that orders rows by haversine distance
 * on the stored per-auction lat/lng. That is a Forge brief, not a frontend
 * one — do not bolt it on here.
 *
 * Coordinates are approximate province centroids (±20 km is fine — we only
 * ever use them to pick the NEAREST province, never to display a position).
 * `key` values MUST match `SPAIN_PROVINCES[].key` in `spain-provinces.ts`
 * (note the DB-native spellings: Gipuzkoa, Bizkaia).
 */

import { SPAIN_PROVINCES, type CanonicalProvince } from './spain-provinces';

export type ProvinceCentroid = { key: string; lat: number; lng: number };

export const PROVINCE_CENTROIDS: ReadonlyArray<ProvinceCentroid> = [
  { key: 'A Coruña', lat: 43.0, lng: -8.4 },
  { key: 'Álava', lat: 42.85, lng: -2.72 },
  { key: 'Albacete', lat: 38.95, lng: -1.98 },
  { key: 'Alicante', lat: 38.48, lng: -0.77 },
  { key: 'Almería', lat: 37.2, lng: -2.35 },
  { key: 'Asturias', lat: 43.3, lng: -5.99 },
  { key: 'Ávila', lat: 40.57, lng: -5.0 },
  { key: 'Badajoz', lat: 38.9, lng: -6.15 },
  { key: 'Barcelona', lat: 41.73, lng: 1.98 },
  { key: 'Burgos', lat: 42.34, lng: -3.58 },
  { key: 'Cáceres', lat: 39.55, lng: -6.1 },
  { key: 'Cádiz', lat: 36.55, lng: -5.75 },
  { key: 'Cantabria', lat: 43.18, lng: -4.03 },
  { key: 'Castellón', lat: 40.24, lng: -0.15 },
  { key: 'Ceuta', lat: 35.89, lng: -5.32 },
  { key: 'Ciudad Real', lat: 38.93, lng: -3.83 },
  { key: 'Córdoba', lat: 38.0, lng: -4.8 },
  { key: 'Cuenca', lat: 39.9, lng: -2.2 },
  { key: 'Girona', lat: 42.13, lng: 2.67 },
  { key: 'Granada', lat: 37.31, lng: -3.27 },
  { key: 'Guadalajara', lat: 40.82, lng: -2.63 },
  { key: 'Gipuzkoa', lat: 43.14, lng: -2.19 },
  { key: 'Huelva', lat: 37.57, lng: -6.86 },
  { key: 'Huesca', lat: 42.2, lng: -0.17 },
  { key: 'Illes Balears', lat: 39.57, lng: 2.91 },
  { key: 'Jaén', lat: 38.02, lng: -3.44 },
  { key: 'León', lat: 42.62, lng: -5.84 },
  { key: 'Lleida', lat: 42.04, lng: 1.05 },
  { key: 'Lugo', lat: 43.01, lng: -7.44 },
  { key: 'Madrid', lat: 40.5, lng: -3.7 },
  { key: 'Málaga', lat: 36.8, lng: -4.6 },
  { key: 'Melilla', lat: 35.29, lng: -2.95 },
  { key: 'Murcia', lat: 38.0, lng: -1.49 },
  { key: 'Navarra', lat: 42.67, lng: -1.65 },
  { key: 'Ourense', lat: 42.2, lng: -7.62 },
  { key: 'Palencia', lat: 42.37, lng: -4.55 },
  { key: 'Las Palmas', lat: 28.0, lng: -15.0 },
  { key: 'Pontevedra', lat: 42.43, lng: -8.46 },
  { key: 'La Rioja', lat: 42.28, lng: -2.51 },
  { key: 'Salamanca', lat: 40.8, lng: -6.05 },
  { key: 'Segovia', lat: 41.17, lng: -4.05 },
  { key: 'Sevilla', lat: 37.44, lng: -5.87 },
  { key: 'Soria', lat: 41.62, lng: -2.53 },
  { key: 'Tarragona', lat: 41.09, lng: 0.82 },
  { key: 'Santa Cruz de Tenerife', lat: 28.3, lng: -16.6 },
  { key: 'Teruel', lat: 40.66, lng: -1.0 },
  { key: 'Toledo', lat: 39.79, lng: -4.25 },
  { key: 'Valencia', lat: 39.37, lng: -0.8 },
  { key: 'Valladolid', lat: 41.63, lng: -4.75 },
  { key: 'Bizkaia', lat: 43.24, lng: -2.85 },
  { key: 'Zamora', lat: 41.73, lng: -5.96 },
  { key: 'Zaragoza', lat: 41.62, lng: -1.03 },
];

// Key → canonical row for the return value (label + key in one lookup).
const KEY_TO_ROW: Map<string, CanonicalProvince> = (() => {
  const m = new Map<string, CanonicalProvince>();
  for (const p of SPAIN_PROVINCES) m.set(p.key, p);
  return m;
})();

/** Great-circle distance in km (haversine). Good enough at province scale. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Snap a browser geolocation fix to the nearest Spanish province. Returns the
 * canonical `{label, key}` row (key = DB spelling, safe to pass straight to
 * `?province=` on carousel-mix) or null when the fix is implausibly far from
 * Spain (> ~400 km from every centroid — e.g. a VPN exit in Frankfurt). The
 * caller treats null exactly like a geolocation denial: keep the default view.
 */
export function nearestProvince(lat: number, lng: number): CanonicalProvince | null {
  let best: ProvinceCentroid | null = null;
  let bestKm = Infinity;
  for (const c of PROVINCE_CENTROIDS) {
    const km = haversineKm(lat, lng, c.lat, c.lng);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  if (!best || bestKm > 400) return null;
  return KEY_TO_ROW.get(best.key) ?? null;
}
