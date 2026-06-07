/**
 * src/lib/auction-image-projection.ts — SHARED server-side image projection
 * used by every list/feed route that serves cards (/api/auctions,
 * /api/auctions/carousel-mix, /api/auctions/recent if/when wired).
 *
 * This is the projection that flows into `resolveCardImage` on the client.
 * Before this module existed, only `/api/auctions/route.ts` ran rows through
 * the resolver; the carousel-mix route projected the raw DB `imageUrl` and
 * therefore lost EVERY real photo url (`/api/auction-image/<boeId>`) — the
 * carousel cards fell straight to the rung-3 branded placeholder.
 *
 * Two exports, both pure / cache-aware:
 *
 *   - `isRealAuctionImage(url)` — true iff the URL is a resolver-served real
 *     photo (`/api/auction-image/…` or legacy `/streetview/…`). Drives the
 *     `hasImage` boolean on every card payload — `resolveCardImage` uses it
 *     as the authoritative signal to pick rung 1.
 *
 *   - `getAppropriateImageUrl(input)` — the 3-rung ladder applied server-side
 *     so the client only ever receives a usable URL. Rung-1 priority:
 *     resolver-served real photo (Catastro / Street View). Rung 2: Google
 *     Static Maps pin via `siteFallbackImageUrl`. Rung 3: category-aware
 *     placeholder image. Same behaviour the route used to inline.
 *
 * Streetview directory listing is cached for 60s — `fs.existsSync` per row
 * per request would dominate the route's CPU budget on a 50-row page.
 */
import fs from 'fs';
import path from 'path';
import { generateMapImageUrl, getOptimalZoom } from './map-image';
import { getVehicleCategoryImageUrl } from './vehicle-images';
import { getPropertyCategoryImageUrl } from './property-images';

/**
 * Real-photo URL prefix. `/api/auction-image/<boeId>` is the resolver path
 * (Forge P1, 2026-05-30); legacy `/streetview/<boeId>.jpg` rows that haven't
 * been migrated to the resolver also count as real photos.
 */
const REAL_IMAGE_PREFIX = '/api/auction-image/';

export function isRealAuctionImage(u: string | null | undefined): boolean {
  if (!u) return false;
  if (u.startsWith(REAL_IMAGE_PREFIX)) return true;
  if (u.startsWith('/streetview/')) return true;
  return false;
}

/** Property categories that get a Street-View / static-map thumbnail. */
const PROPERTY_CATEGORIES = [
  'Viviendas',
  'Locales',
  'Terrenos',
  'Garajes',
  'Trasteros',
  'Fincas rústicas',
  'Naves industriales',
  'Otros inmuebles',
];

/** Vehicle categories — always fall back to a category-specific placeholder. */
const VEHICLE_CATEGORIES = [
  'Turismos',
  'Motocicletas',
  'Vehículos Industriales',
  'Barcos',
];

// Streetview directory listing cache — `fs.existsSync` per row, per request,
// is wildly expensive on a 50-row page. One scan, cached 60s.
let streetviewFileCache: { files: Set<string>; expiresAt: number } | null = null;
function getStreetviewFileSet(): Set<string> {
  if (streetviewFileCache && streetviewFileCache.expiresAt > Date.now()) {
    return streetviewFileCache.files;
  }
  const dir = path.join(process.cwd(), 'public', 'streetview');
  let files: string[] = [];
  try {
    files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  } catch {
    files = [];
  }
  streetviewFileCache = {
    files: new Set(files),
    expiresAt: Date.now() + 60 * 1000,
  };
  return streetviewFileCache.files;
}

/**
 * Minimal set of fields needed to run the image projection. Keeping this
 * shape narrow lets every route project rows of any shape through the same
 * resolver — `/api/auctions` uses raw DB rows; `/api/auctions/carousel-mix`
 * uses a Prisma-selected subset; both satisfy the contract.
 */
export type AuctionImageInput = {
  imageUrl: string | null;
  streetViewUrl?: string | null;
  latitude: number | null;
  longitude: number | null;
  boeId?: string | null;
  category: string;
  /**
   * Optional — if the caller knows the DB status, the resolver can prefer
   * the live Street View tile for ACTIVE / PRE_AUCTION rows. When omitted
   * we treat the row as not-active (safe default — falls back to the
   * stored image or the map tile).
   */
  status?: string | null;
};

/**
 * Server-side 3-rung image resolver — returns ONE URL the client renders.
 *
 * Rung 1: resolver-served real photo (`/api/auction-image/<boeId>` or a
 *   verified `/streetview/<safe>.jpg` file). Always wins when present.
 * Rung 2: Google Static Maps pin at the row's lat/lng (via
 *   `generateMapImageUrl` → `siteFallbackImageUrl`). When the Static Maps
 *   API isn't usable, this rung degrades to the branded placeholder PNG
 *   (see `siteFallbackImageUrl` for the env flag logic).
 * Rung 3: category placeholder — property or vehicle SVG / image — for
 *   rows with no real photo and no coords.
 */
export function getAppropriateImageUrl(item: AuctionImageInput): string {
  const zoom = getOptimalZoom(item.category);
  const safeStreetviewPath = item.boeId
    ? `/streetview/${item.boeId.replace(/[^a-zA-Z0-9_-]+/g, '_')}.jpg`
    : null;
  const isActiveOrPreAuction = item.status
    ? ['ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA'].includes(item.status)
    : false;

  // Forge P1 (2026-05-30): the resolver-populated real-photo URL wins
  // over EVERY other rung. This is what makes the "real photo on card"
  // story work without any per-request outbound calls.
  if (item.imageUrl && item.imageUrl.startsWith(REAL_IMAGE_PREFIX)) {
    return item.imageUrl;
  }

  const streetviewFiles = getStreetviewFileSet();
  const streetviewFileExists = (publicPath: string | null): boolean => {
    if (!publicPath || !publicPath.startsWith('/streetview/')) return false;
    const fname = publicPath.replace(/^\/streetview\//, '');
    return streetviewFiles.has(fname);
  };

  const hasValidLocalImage = (publicPath: string | null): boolean => {
    if (!publicPath) return false;
    if (!publicPath.startsWith('/streetview/')) return true;
    return streetviewFileExists(publicPath);
  };

  const storedStreetviewImage =
    item.imageUrl && item.imageUrl.startsWith('/streetview/') && streetviewFileExists(item.imageUrl)
      ? item.imageUrl
      : null;
  const storedStreetviewUrl =
    item.streetViewUrl && item.streetViewUrl.startsWith('/streetview/') && streetviewFileExists(item.streetViewUrl)
      ? item.streetViewUrl
      : null;
  const storedImageUrl =
    item.imageUrl &&
    !item.imageUrl.includes('unsplash.com') &&
    !item.imageUrl.includes('images.unsplash') &&
    hasValidLocalImage(item.imageUrl)
      ? item.imageUrl
      : null;

  // PROPERTY — prefer the stored Street-View screenshot for active /
  // pre-auction rows; fall back to map tile (rung 2) or category image.
  if (PROPERTY_CATEGORIES.includes(item.category)) {
    if (isActiveOrPreAuction) {
      if (storedStreetviewImage) return storedStreetviewImage;
      if (storedStreetviewUrl) return storedStreetviewUrl;
      if (safeStreetviewPath && streetviewFileExists(safeStreetviewPath)) {
        return safeStreetviewPath;
      }
      if (item.latitude && item.longitude) {
        return generateMapImageUrl(item.latitude, item.longitude, 800, 600, zoom);
      }
      return getPropertyCategoryImageUrl(item.category);
    }
    if (storedImageUrl) return storedImageUrl;
    if (item.latitude && item.longitude) {
      return generateMapImageUrl(item.latitude, item.longitude, 800, 600, zoom);
    }
    return getPropertyCategoryImageUrl(item.category);
  }

  // VEHICLE — category placeholder. Vehicles don't have a real location
  // so the map rung doesn't apply.
  if (VEHICLE_CATEGORIES.includes(item.category)) {
    return getVehicleCategoryImageUrl(item.category);
  }

  // Other categories — stored image, then map, then property-other placeholder.
  const fallbackImageUrl = hasValidLocalImage(item.imageUrl) ? item.imageUrl : null;
  if (fallbackImageUrl) return fallbackImageUrl;
  if (item.latitude && item.longitude) {
    return generateMapImageUrl(item.latitude, item.longitude, 800, 600, zoom);
  }
  return getPropertyCategoryImageUrl('Otros inmuebles');
}
