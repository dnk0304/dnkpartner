/**
 * resolve-card-image — the ONE place that decides what image to show for an
 * auction across every surface (dashboard card, observatory card, row,
 * carousel, detail page).
 *
 * Three-rung fallback ladder. Stops at the first rung that exists:
 *
 *   1. Real scraped photo — when `hasImage` is true OR `imageUrl` starts with
 *      `/api/auction-image/` / `/streetview/`. This is the resolver-served
 *      Catastro / Street View image; the photo always wins.
 *   2. Static map-pin thumbnail — when latitude + longitude are present, we
 *      synthesize a static map URL from OpenStreetMap with a red pushpin at
 *      the auction's coordinates. This is the stated MINIMUM imagery a card
 *      may show (Dennis 2026-06-02).
 *   3. Category placeholder SVG — `/images/property-*.svg` or
 *      `/images/vehicle-*.svg`. Always exists; the ladder cannot return
 *      null. A card is NEVER blank.
 *
 * The helper returns the resolved src + alt + which rung was hit so callers
 * can decorate (e.g. show a "Map pin" overlay only on rung 2, or skip the
 * `next/image` blur for plain SVG placeholders).
 */

import {
  generateMapImageUrl,
  generateResponsiveMapImages,
  getMapPinPosition,
  getOptimalZoom,
} from './map-image';
import { getPropertyCategoryImageUrl } from './property-images';
import { getVehicleCategoryImageUrl } from './vehicle-images';

const REAL_PHOTO_PREFIXES = ['/api/auction-image/', '/streetview/'] as const;

/**
 * URL fragments that identify a map-tile / static-map URL — anything that
 * matches MUST be treated as rung-2, never rung-1. Used by the rung-1 check
 * to avoid mis-promoting a server-side fallback map URL into the "real photo"
 * slot when `hasImage` happens to be unset.
 *
 * Kept lower-cased so the test is a simple `includes` against the lower-cased
 * URL — no regex cost in the hot path.
 */
const MAP_URL_FRAGMENTS = [
  'tile.openstreetmap',
  'staticmap.openstreetmap',
  '/tiles/',
  'maps.googleapis',
] as const;

/**
 * Path fragments that identify a category-placeholder SVG (the rung-3
 * fallback). These must never be mis-promoted to rung 1 either — a card with
 * `imageUrl: "/images/property-viviendas.svg"` is rung 3, not rung 1.
 */
const PLACEHOLDER_PATH_FRAGMENTS = [
  '/images/property-',
  '/images/vehicle-',
  '/images/map-placeholder',
] as const;

const PROPERTY_CATEGORIES = new Set([
  'Viviendas',
  'Locales',
  'Terrenos',
  'Garajes',
  'Trasteros',
  'Fincas rústicas',
  'Naves industriales',
  'Otros inmuebles',
]);

const VEHICLE_CATEGORIES = new Set([
  'Turismos',
  'Motocicletas',
  'Vehículos Industriales',
  'Barcos',
]);

export type ImageRung = 'photo' | 'map' | 'placeholder';

export type ResolvedCardImage = {
  /** URL to render. Never null — the ladder always resolves. */
  src: string;
  /** Localized alt text appropriate for the rung. */
  alt: string;
  /** Which rung produced this image. Lets the caller decorate (overlay, blur). */
  rung: ImageRung;
  /** True only when the photo is the resolver-served real photo (rung 1). */
  isRealPhoto: boolean;
  /** True when the resolved src is the OpenStreetMap static pin (rung 2). */
  isMap: boolean;
  /** True when the resolved src is the per-category SVG fallback (rung 3). */
  isPlaceholder: boolean;
  /**
   * For rung 2 only: the property's fractional intra-tile position, expressed
   * as percentages 0–100. Callers feed `xPct%/yPct%` into the tile image's
   * `object-position` (so the point pans to centre of the rendered box) and
   * render a centred pin overlay on top. Null on rung 1 / 3 / no-coords.
   */
  mapPin: { xPct: number; yPct: number } | null;
};

export type ResolveCardImageInput = {
  /** The `imageUrl` projected by /api/auctions or /api/auctions/recent. */
  imageUrl?: string | null;
  /**
   * The `hasImage` flag projected by /api/auctions. True iff the resolver has
   * a stored real photo for this auction. Optional — when omitted we infer it
   * from `imageUrl` prefix.
   */
  hasImage?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Auction category, used by both the map zoom heuristic and the placeholder SVG. */
  category?: string | null;
  /**
   * Title fed to the alt-text fallback. Optional — when missing we use a
   * Spanish generic. Helps screen readers on rung-1 photos.
   */
  title?: string | null;
  /**
   * Card slot — controls the rung-2 map size so a 160-wide carousel card and a
   * 16:9 hero don't both fetch the same 800x600. Default 'card' (400x300).
   */
  size?: 'thumbnail' | 'small' | 'card' | 'medium' | 'large';
};

function isRealPhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return REAL_PHOTO_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * True when the URL is clearly a static-map / tile URL (i.e. rung-2 content
 * masquerading in the `imageUrl` slot). The server API can choose to bake a
 * map URL into `imageUrl` when there's no real photo — we must NOT treat
 * that as a rung-1 photo.
 */
function isMapTileUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return MAP_URL_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * True when the URL is one of our local category-placeholder SVGs. Same logic
 * as map detection — these are rung-3 content; never mis-promote.
 */
function isPlaceholderSvgUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return PLACEHOLDER_PATH_FRAGMENTS.some((frag) => url.includes(frag));
}

function placeholderFor(category: string | null | undefined): string {
  if (!category) return getPropertyCategoryImageUrl('Otros inmuebles');
  if (VEHICLE_CATEGORIES.has(category)) return getVehicleCategoryImageUrl(category);
  if (PROPERTY_CATEGORIES.has(category)) return getPropertyCategoryImageUrl(category);
  // Unknown / niche category (Maquinaria, Joyas, Arte…): generic SVG.
  return getPropertyCategoryImageUrl('Otros inmuebles');
}

/**
 * Resolve the three-rung image for an auction card.
 *
 * @example
 *   const { src, alt, isMap } = resolveCardImage({
 *     imageUrl: item.imageUrl,
 *     hasImage: item.hasImage,
 *     latitude: item.latitude,
 *     longitude: item.longitude,
 *     category: item.category,
 *     title: item.title,
 *     size: 'card',
 *   });
 */
export function resolveCardImage(input: ResolveCardImageInput): ResolvedCardImage {
  const {
    imageUrl,
    hasImage,
    latitude,
    longitude,
    category,
    title,
    size = 'card',
  } = input;

  // ────────────────────────────────────────────────────────────────────────
  // Rung 1 — REAL PHOTO ALWAYS WINS.
  //
  // A real photo is identified by ANY of the following (in priority order):
  //
  //   (a) The server-side `hasImage` flag is explicitly true. This is the
  //       authoritative signal from /api/auctions.
  //   (b) `imageUrl` starts with `/api/auction-image/` or `/streetview/` —
  //       the two prefixes the resolver pipeline writes for real photos
  //       (Catastro / Street View). Used as a cross-check on endpoints
  //       (detail, recent) that don't project `hasImage`.
  //   (c) `imageUrl` is a string that is NEITHER a map-tile URL NOR a
  //       category-placeholder SVG AND `hasImage` is not explicitly false.
  //       Catches the future case where Ghost stores a real photo URL on
  //       a different prefix — better to show a real photo than a map.
  //
  // Critically: rung 1 NEVER falls through to rung 2 (the map-pin) just
  // because coords also exist. If we have a photo, we show the photo. The
  // map-pin is the second-best signal, not a competitor to the photo.
  // ────────────────────────────────────────────────────────────────────────
  const looksLikeRealPhoto = isRealPhotoUrl(imageUrl ?? null);
  const looksLikeMapUrl = isMapTileUrl(imageUrl ?? null);
  const looksLikePlaceholder = isPlaceholderSvgUrl(imageUrl ?? null);
  const isUntaggedRealPhoto =
    !!imageUrl &&
    !looksLikeMapUrl &&
    !looksLikePlaceholder &&
    hasImage !== false;
  if (
    imageUrl &&
    (hasImage === true || looksLikeRealPhoto || isUntaggedRealPhoto)
  ) {
    return {
      src: imageUrl,
      alt: title ? `Foto de ${title}` : 'Foto del bien',
      rung: 'photo',
      isRealPhoto: true,
      isMap: false,
      isPlaceholder: false,
      mapPin: null,
    };
  }

  // Rung 2 — static map-pin thumbnail.
  const hasCoords =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  if (hasCoords) {
    const zoom = getOptimalZoom(category ?? 'default');
    const sized = generateResponsiveMapImages(latitude!, longitude!, zoom);
    const src = sized[size] ?? generateMapImageUrl(latitude!, longitude!, 400, 300, zoom);
    return {
      src,
      alt: title
        ? `Mapa con ubicación de ${title}`
        : 'Mapa con la ubicación del bien',
      rung: 'map',
      isRealPhoto: false,
      isMap: true,
      isPlaceholder: false,
      mapPin: getMapPinPosition(latitude!, longitude!, zoom),
    };
  }

  // Rung 3 — per-category SVG. Always exists.
  return {
    src: placeholderFor(category),
    alt: title ? `Categoría: ${title}` : 'Imagen de la categoría',
    rung: 'placeholder',
    isRealPhoto: false,
    isMap: false,
    isPlaceholder: true,
    mapPin: null,
  };
}

/**
 * Detect Ghost's split-multilot title token. Such rows carry no usable price
 * and the price slot should render "Precio no disponible" instead of blank.
 */
export function isVariosLotesTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return /varios\s+lotes/i.test(title);
}
