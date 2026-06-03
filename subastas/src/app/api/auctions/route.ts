import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { query, queryOne } from '@/lib/db';
import { UserTier } from '@/types';
import { generateMapImageUrl, getOptimalZoom } from '@/lib/map-image';
import { getVehicleCategoryImageUrl } from '@/lib/vehicle-images';
import { getPropertyCategoryImageUrl } from '@/lib/property-images';
import { auctionCache } from '@/lib/cache';
import { boeLinkFor } from '@/lib/boe-link';
import { buildCategoryRankCaseSql } from '@/lib/category-rank';
import {
  ACTIVE_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  FINISHED_DB_STATUSES,
  ACTIVE_CLOCK_GUARD_SQL,
  DB_TO_FRONTEND_STATUS,
  isActiveStatus as sharedIsActiveStatus,
  isPreAuctionStatus as sharedIsPreAuctionStatus,
  isFinishedStatus as sharedIsFinishedStatus,
} from '@/lib/auction-status';

const normalizeText = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

// Cached "SELECT DISTINCT province" \u2014 full scan against 229k rows on every
// filtered request is wildly expensive. Provinces change rarely (Spain has 52);
// 5-minute TTL is more than enough.
let provinceCache: { values: string[]; expiresAt: number } | null = null;
async function getCachedDistinctProvinces(): Promise<string[]> {
  if (provinceCache && provinceCache.expiresAt > Date.now()) {
    return provinceCache.values;
  }
  const rows = await query<{ province: string }>(
    'SELECT DISTINCT province FROM Auction WHERE province IS NOT NULL',
    []
  );
  provinceCache = {
    values: rows.map((r) => r.province),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  return provinceCache.values;
}

// Streetview directory listing cache \u2014 `fs.existsSync` ran per row, per request.
// Replace with one directory scan, cached 1 minute.
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

// New BOE-accurate status values
type DBStatus = 
  | 'PROXIMA_APERTURA' | 'CELEBRANDOSE' | 'SUSPENDIDA' | 'CANCELADA' | 'CONCLUIDA_PORTAL' | 'FINALIZADA_AUTORIDAD'
  // Legacy values
  | 'ACTIVE' | 'FINISHED' | 'PRE_AUCTION' | 'SUSPENDED' | 'CANCELLED';

// Auction type values — DB stores either the new canonical plural form
// (OTRAS_TRIBUTARIAS / ADMINISTRATIVAS) from the per-category scrapers, or
// the legacy singular form (TRIBUTARIA / ADMINISTRATIVA) on older rows.
// Both are accepted here; the mapAuctionType collapser folds them to a
// single canonical frontend value so the UI never has to know.
type DBAuctionType =
  | 'JUDICIAL'
  | 'NOTARIAL'
  | 'AEAT'
  | 'OTRAS_TRIBUTARIAS'
  | 'TRIBUTARIA'         // legacy
  | 'ADMINISTRATIVAS'
  | 'ADMINISTRATIVA'     // legacy
  | 'BANCARIA';

interface AuctionFromDB {
  id: string;
  boeId: string;
  title: string;
  category: string;
  province: string;
  municipality: string | null;
  status: DBStatus;
  auctionType: DBAuctionType | null;
  appraisalValue: number | null;
  currentBid: number | null;
  minimumBid: number | null;
  courtName: string | null;
  procedureNumber: string | null;
  boeLink: string | null;
  auctionId: string | null;
  lotNumber: string | null;
  boeAnnouncement: string | null;
  lotDescription: string | null;
  propertyDescription: string | null;
  chargesDetail: string | null;
  charges: string | null;
  possessionStatus: string | null;
  visitable: number | null;
  cadastralRef: string | null;
  cadastralData: string | null;
  registryInfo: string | null;
  contactInfo: string | null;
  propertyType: string | null;
  edictUrl: string | null;
  pdfUrl: string | null;
  publishedAt: string;
  // opensAt — the auction's official start date ("Fecha de inicio").
  // Already in `SELECT Auction.*`; surfacing it on the card payload so the
  // PROXIMA_APERTURA cards can render "start date" alongside endsAt. Nullable;
  // null = not scheduled yet / not scraped (BOE-side cleanup task).
  opensAt: string | null;
  endsAt: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  imageUrl: string | null;
  source: string | null;
  courtReference: string | null;
  originalSource: string | null;
  transitionedAt: string | null;
  // Google Maps URLs
  mapUrl: string | null;
  streetViewUrl: string | null;
  placeUrl: string | null;
  directionsUrl: string | null;
  // #16 / #17 — pujas + occupancy. BigInt comes back from pg as a string;
  // we coerce to number (EUROS) in transformAuction. Nulls are preserved.
  pujaStatus: string | null;
  currentBidAmount: string | number | bigint | null;
  occupancy: string | null;
  // Document-archive wave (2026-06-03). Computed via a correlated EXISTS
  // subquery in the SELECT so the list query stays single-shot. pg returns
  // PG booleans as JS booleans through node-postgres.
  hasDocuments: boolean | null;
}

// Map DB status to frontend status. Delegates to the shared
// DB_TO_FRONTEND_STATUS table (single source of truth — see
// `@/lib/auction-status`).
function mapStatus(dbStatus: DBStatus): string {
  return DB_TO_FRONTEND_STATUS[dbStatus] || 'celebrandose';
}

// Map DB auction type to frontend auction type — legacy singular labels
// (TRIBUTARIA / ADMINISTRATIVA) fold into the new canonical plurals so the UI
// only ever sees one identifier per BOE family.
function mapAuctionType(dbType: DBAuctionType | null): string | undefined {
  if (!dbType) return undefined;
  const typeMap: Record<DBAuctionType, string> = {
    'JUDICIAL': 'judicial',
    'NOTARIAL': 'notarial',
    'AEAT': 'aeat',
    'OTRAS_TRIBUTARIAS': 'otras_tributarias',
    'TRIBUTARIA': 'otras_tributarias',       // legacy → fold
    'ADMINISTRATIVAS': 'administrativas',
    'ADMINISTRATIVA': 'administrativas',     // legacy → fold
    'BANCARIA': 'bancaria',
  };
  return typeMap[dbType];
}

// Status-class predicates — thin wrappers over the shared lib so the
// existing call sites (applyTierMasking branches) keep their DBStatus typing
// while the underlying set is the single canonical one.
function isFinishedStatus(dbStatus: DBStatus): boolean {
  return sharedIsFinishedStatus(dbStatus);
}
function isActiveStatus(dbStatus: DBStatus): boolean {
  return sharedIsActiveStatus(dbStatus);
}
function isPreAuctionStatus(dbStatus: DBStatus): boolean {
  return sharedIsPreAuctionStatus(dbStatus);
}

// Property categories that should use Street View or map images
const PROPERTY_CATEGORIES = ['Viviendas', 'Locales', 'Terrenos', 'Garajes', 'Trasteros', 'Fincas rústicas', 'Naves industriales', 'Otros inmuebles'];

// Vehicle categories that should use generated vehicle images
const VEHICLE_CATEGORIES = ['Turismos', 'Motocicletas', 'Vehículos Industriales', 'Barcos'];

// FORGE 2026-06-03 (Item C — promote properties primarily) +
// RECONCILE 2026-06-03 (Ken, listing wave): the category → priority rank
// table and its SQL-CASE builder were pulled out into the shared single
// source of truth `@/lib/category-rank` (introduced on sa/recent-filter-params
// so /api/auctions/recent can reuse it). The previously-inline `CATEGORY_RANK`
// + `buildCategoryRankCaseSql()` are now imported above; the precomputed
// CASE string is still built once at module load to keep the ORDER BY plan
// identical to the original implementation.
const CATEGORY_RANK_CASE_SQL = buildCategoryRankCaseSql();

function buildGeneralInfo(item: AuctionFromDB): string | null {
  const parts: string[] = [];

  if (item.boeAnnouncement) {
    parts.push(item.boeAnnouncement.trim());
  }

  if (item.propertyDescription) {
    parts.push(item.propertyDescription.trim());
  }

  if (item.lotDescription) {
    parts.push(item.lotDescription.trim());
  }

  if (parts.length === 0) {
    if (item.auctionId) parts.push(`ID Subasta: ${item.auctionId}`);
    if (item.lotNumber) parts.push(`Lote: ${item.lotNumber}`);
    if (item.courtName) parts.push(`Autoridad gestora: ${item.courtName}`);
    if (item.procedureNumber) parts.push(`Procedimiento: ${item.procedureNumber}`);
    if (item.propertyType) parts.push(`Tipo de bien: ${item.propertyType}`);
    if (item.possessionStatus) parts.push(`Posesión: ${item.possessionStatus}`);
    if (item.visitable !== null) parts.push(`Visitable: ${item.visitable ? 'Sí' : 'No'}`);
    if (item.cadastralRef) parts.push(`Referencia catastral: ${item.cadastralRef}`);
    if (item.registryInfo) parts.push(`Registro: ${item.registryInfo}`);
    if (item.contactInfo) parts.push(`Contacto: ${item.contactInfo}`);
  }

  const text = parts.join('\n').trim();
  return text.length > 0 ? text : null;
}

function extractWarning(item: AuctionFromDB): string | null {
  if (item.chargesDetail && item.chargesDetail.trim()) {
    return item.chargesDetail.trim();
  }

  if (item.boeAnnouncement) {
    const match = item.boeAnnouncement.match(/Advertencia[s]?:\s*(.*)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Generate an appropriate image URL based on auction category
 * - Properties: Use Street View URL if available, otherwise map image
 * - Vehicles: Use a placeholder vehicle image (to be replaced with AI-generated)
 * - Boats: Use a placeholder boat image
 */
/**
 * Forge P1 (2026-05-30): Catastro+StreetView auction-image pipeline.
 *
 * imageUrl is now populated out-of-band by the resolver (see
 * src/lib/auction-images/resolver.ts) — written by the backfill endpoint and
 * future enrichment hooks. The request path only READS that field.
 *
 * `/api/auction-image/<boeId>` paths are the truth source for "Solo con foto"
 * (Pixel's hasImage filter). Category placeholder URLs are NOT real photos
 * and MUST NOT satisfy the filter.
 */
const REAL_IMAGE_PREFIX = '/api/auction-image/';
function isRealAuctionImage(u: string | null | undefined): boolean {
  if (!u) return false;
  if (u.startsWith(REAL_IMAGE_PREFIX)) return true;
  // Legacy /streetview/<boeId>.jpg paths are also real photos (until migrated).
  if (u.startsWith('/streetview/')) return true;
  return false;
}

function getAppropriateImageUrl(item: AuctionFromDB): string {
  const zoom = getOptimalZoom(item.category);
  const safeStreetviewPath = item.boeId
    ? `/streetview/${item.boeId.replace(/[^a-zA-Z0-9_-]+/g, '_')}.jpg`
    : null;
  const isActiveOrPreAuction = ['ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA'].includes(item.status);

  // Forge P1: prefer the resolver-populated real image (Catastro / StreetView)
  // ahead of every other source. This is what makes the "real photo on card"
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

  const storedStreetviewImage = item.imageUrl && item.imageUrl.startsWith('/streetview/') && streetviewFileExists(item.imageUrl)
    ? item.imageUrl
    : null;
  const storedStreetviewUrl = item.streetViewUrl && item.streetViewUrl.startsWith('/streetview/') && streetviewFileExists(item.streetViewUrl)
    ? item.streetViewUrl
    : null;
  const storedImageUrl = item.imageUrl && !item.imageUrl.includes('unsplash.com') && !item.imageUrl.includes('images.unsplash') && hasValidLocalImage(item.imageUrl)
    ? item.imageUrl
    : null;

  // Property auctions - prioritize Street View screenshot for active/pre-auction cards
  if (PROPERTY_CATEGORIES.includes(item.category)) {
    if (isActiveOrPreAuction) {
      if (storedStreetviewImage) return storedStreetviewImage;
      if (storedStreetviewUrl) return storedStreetviewUrl;
      if (safeStreetviewPath && streetviewFileExists(safeStreetviewPath)) {
        return safeStreetviewPath;
      }
      // If coordinates available, show map with pinpoint; otherwise show property-type image
      if (item.latitude && item.longitude) {
        return generateMapImageUrl(item.latitude, item.longitude, 800, 600, zoom);
      }
      return getPropertyCategoryImageUrl(item.category);
    }

    // Non-active/pre: fall back to stored image or map (if coords) or property-type image
    if (storedImageUrl) {
      return storedImageUrl;
    }
    if (item.latitude && item.longitude) {
      return generateMapImageUrl(item.latitude, item.longitude, 800, 600, zoom);
    }
    return getPropertyCategoryImageUrl(item.category);
  }
  
  // Vehicle auctions - use category-based placeholders
  if (VEHICLE_CATEGORIES.includes(item.category)) {
    return getVehicleCategoryImageUrl(item.category);
  }
  
  // Fallback for other categories
  const fallbackImageUrl = hasValidLocalImage(item.imageUrl) ? item.imageUrl : null;
  if (fallbackImageUrl) return fallbackImageUrl;
  if (item.latitude && item.longitude) {
    return generateMapImageUrl(item.latitude, item.longitude, 800, 600, zoom);
  }
  return getPropertyCategoryImageUrl('Otros inmuebles');
}

/**
 * #16 — convert the BIGINT-cents `currentBidAmount` column (which pg returns
 * as a string) into a finite EURO number for the card layer. Returns null
 * when the value is null / blank / NaN / non-positive so the badge can stay
 * null-safe and never render a misleading "€0".
 */
function bidCentsToEuros(raw: string | number | bigint | null | undefined): number | null {
  if (raw == null) return null;
  let cents: number;
  if (typeof raw === 'bigint') {
    cents = Number(raw);
  } else if (typeof raw === 'number') {
    cents = raw;
  } else {
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    cents = Number(trimmed);
  }
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents / 100;
}

/**
 * #16 / #17 — normalize raw column strings to the canonical card-layer values.
 * Anything outside the known set falls back to null so an unexpected upstream
 * value never paints a misleading badge.
 */
function normalizePujaStatus(raw: string | null | undefined): 'CON_PUJA' | 'SIN_PUJA' | null {
  if (raw === 'CON_PUJA' || raw === 'SIN_PUJA') return raw;
  return null;
}
function normalizeOccupancy(
  raw: string | null | undefined,
): 'OCUPADO' | 'NO_OCUPADO' | 'NO_CONSTA' | null {
  if (raw === 'OCUPADO' || raw === 'NO_OCUPADO' || raw === 'NO_CONSTA') return raw;
  return null;
}

function transformAuction(item: AuctionFromDB, userTier: UserTier | 'GUEST', isLocked: boolean = false) {
  const publishedAt = new Date(item.publishedAt);
  const endsAt = item.endsAt ? new Date(item.endsAt) : null;
  const transitionedAt = item.transitionedAt ? new Date(item.transitionedAt) : null;
  const frontendStatus = mapStatus(item.status);
  const frontendAuctionType = mapAuctionType(item.auctionType);
  const imageUrl = getAppropriateImageUrl(item);
  const generalInfo = buildGeneralInfo(item);
  const warning = extractWarning(item);
  const isPreAuction = frontendStatus === 'pre-auction' || frontendStatus === 'proxima-apertura';
  const hasPdf = Boolean(item.pdfUrl);
  const baseAppraisalValue = item.appraisalValue && item.appraisalValue > 0 ? item.appraisalValue : null;
  const appraisalValue = isPreAuction && !hasPdf ? null : baseAppraisalValue;
  // #16 / #17 — projected straight through; the card layer renders nothing
  // when the value is null.
  const pujaStatus = normalizePujaStatus(item.pujaStatus);
  const currentBidAmount = bidCentsToEuros(item.currentBidAmount);
  const occupancy = normalizeOccupancy(item.occupancy);
  // Document-archive wave (2026-06-03). pg returns boolean from EXISTS as
  // a JS boolean; null/undefined collapse to false so cards never render
  // the "documentos" indicator on a row we never queried for.
  const hasDocuments = Boolean(item.hasDocuments);

  if (isLocked) {
    // Locked teaser
    return {
      id: item.id,
      title: `🔒 ${item.title}`,
      category: item.category,
      province: item.province,
      municipality: item.municipality,
      community: 'Canarias',
      currentBid: null,
      appraisalValue,
      minimumBid: null,
      courtName: null,
      procedureNumber: null,
      boeLink: null,
      edictUrl: null,
      pdfUrl: null,
      status: frontendStatus,
      auctionType: frontendAuctionType,
      // 2026-06-03 (Pixel cards): opensAt = "Fecha de inicio" (start date).
      // propertyType = accurate bien-type label for the headline. Both
      // nullable, null-safe. ISO string passthrough for opensAt — the card
      // layer parses it the same way it parses publishedAt/endsAt.
      opensAt: item.opensAt,
      propertyType: item.propertyType,
      endDate: endsAt || new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      source: (item.source || 'BOE') as 'BOE' | 'TEJU',
      imageUrl,
      hasImage: isRealAuctionImage(item.imageUrl),
      isLocked: true,
      address: null,
      latitude: item.latitude,
      longitude: item.longitude,
      // Map URLs - null for locked
      mapUrl: null,
      streetViewUrl: null,
      placeUrl: null,
      directionsUrl: null,
      generalInfo,
      warning,
      propertyDescription: item.propertyDescription,
      lotDescription: item.lotDescription,
      chargesDetail: item.chargesDetail,
      // Catastro RC — projected for the detail "Ver en Catastro" link.
      // Locked-tier teasers still carry the RC because the link is
      // public-government data, not a premium signal.
      cadastralRef: item.cadastralRef,
      // #16 / #17 — null-safe; null = no badge on the card.
      pujaStatus,
      currentBidAmount,
      occupancy,
      // Document-archive wave (2026-06-03). Even locked teasers expose the
      // boolean — the BOE document set is public information; locking it
      // would be misleading without unlocking anything genuinely premium.
      hasDocuments,
    };
  }

  // Full access
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    province: item.province,
    municipality: item.municipality,
    community: 'Canarias',
    currentBid: item.currentBid,
    appraisalValue,
    minimumBid: item.minimumBid,
    courtName: item.courtName,
    procedureNumber: item.procedureNumber,
    boeLink: boeLinkFor(item.boeId, item.boeLink),
    edictUrl: item.edictUrl,
    pdfUrl: item.pdfUrl,
    status: frontendStatus,
    auctionType: frontendAuctionType,
    // 2026-06-03 (Pixel cards): opensAt + propertyType, same rationale as
    // the locked teaser block above.
    opensAt: item.opensAt,
    propertyType: item.propertyType,
    endDate: endsAt || publishedAt,
    source: (item.source || 'BOE') as 'BOE' | 'TEJU',
    imageUrl,
    hasImage: isRealAuctionImage(item.imageUrl),
    isLocked: false,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    courtReference: item.courtReference,
    originalSource: item.originalSource,
    transitionedAt: transitionedAt,
    // Google Maps URLs
    mapUrl: item.mapUrl,
    streetViewUrl: item.streetViewUrl,
    placeUrl: item.placeUrl,
    directionsUrl: item.directionsUrl,
    generalInfo,
    warning,
    propertyDescription: item.propertyDescription,
    lotDescription: item.lotDescription,
    chargesDetail: item.chargesDetail,
    // Catastro RC — projected so the detail modal/page can render the
    // "Ver en Catastro" external link when populated (~2.5% of active rows).
    cadastralRef: item.cadastralRef,
    // #16 / #17 — null-safe; null = no badge on the card.
    pujaStatus,
    currentBidAmount,
    occupancy,
    // Document-archive wave (2026-06-03).
    hasDocuments,
  };
}

function applyTierMasking(auctions: AuctionFromDB[], userTier: UserTier | 'GUEST', hasActiveTrial: boolean = false) {
  const maskedList: any[] = [];
  const activePerMunicipality: Map<string, number> = new Map();

  for (const item of auctions) {
    // A. Finished/cancelled - always show to everyone
    if (isFinishedStatus(item.status)) {
      maskedList.push(transformAuction(item, userTier, false));
      continue;
    }

    // B. Suspended - show but mark appropriately
    if (item.status === 'SUSPENDED' || item.status === 'SUSPENDIDA') {
      maskedList.push(transformAuction(item, userTier, false));
      continue;
    }

    // C. GUEST users - LOGIN DISABLED: show everything unlocked
    // TODO: Re-enable guest masking after auction system is fully working
    if (userTier === 'GUEST') {
      maskedList.push(transformAuction(item, userTier, false));
      continue;
    }

    // D. Handle active auctions for logged-in users
    if (isActiveStatus(item.status)) {
      const municipalityKey = item.municipality || item.province;
      const currentCount = activePerMunicipality.get(municipalityKey) || 0;

      if (userTier === 'free' && !hasActiveTrial && currentCount > 0) {
        // Lock additional auctions in same municipality for free users
        maskedList.push(transformAuction(item, userTier, true));
      } else {
        // Show full auction
        maskedList.push(transformAuction(item, userTier, false));
        if (userTier === 'free' && !hasActiveTrial) {
          activePerMunicipality.set(municipalityKey, currentCount + 1);
        }
      }
    }

    // E. Handle pre-auction - DIAMOND ONLY
    else if (isPreAuctionStatus(item.status)) {
      const isLocked = userTier !== 'diamond';
      maskedList.push(transformAuction(item, userTier, isLocked));
    }
  }

  return maskedList;
}

/**
 * FORGE 2026-06-02 — cursor encoding for endsAt_asc that handles the
 * NULLS-LAST tail. Format = `<isoOrNULL>|<uuid>` (pipe-delimited so it
 * survives URL encoding without further escaping).
 *
 *  - `2026-08-01T10:00:00.000Z|0193a...` → non-null endsAt, keyset across
 *    `(endsAt > ? OR (endsAt = ? AND id > ?) OR endsAt IS NULL)`.
 *  - `NULL|0193a...` → already in the null tail, keyset on `id > ?`.
 *  - Legacy plain ISO (no pipe) → backward-compatible; we widen the
 *    predicate to `endsAt > ? OR endsAt IS NULL` so the null tail is reached
 *    once future-endsAt rows are exhausted.
 *
 * Invariant: cursors are opaque to all callers (the frontend round-trips
 * `pagination.nextCursor`); we may rev the format freely.
 */
type EndsAtCursor =
  | { kind: 'legacy'; endsAt: string }
  | { kind: 'nonNull'; endsAt: string; id: string }
  | { kind: 'null'; id: string };

function parseEndsAtCursor(raw: string): EndsAtCursor {
  const pipe = raw.indexOf('|');
  if (pipe === -1) {
    // Legacy plain-ISO cursor from a pre-fix client.
    return { kind: 'legacy', endsAt: raw };
  }
  const left = raw.slice(0, pipe);
  const id = raw.slice(pipe + 1);
  if (left === 'NULL') {
    return { kind: 'null', id };
  }
  return { kind: 'nonNull', endsAt: left, id };
}

function encodeEndsAtCursor(endsAt: string | Date | null, id: string): string {
  if (endsAt == null) return `NULL|${id}`;
  // pg returns timestamp columns as Date objects. Normalize to ISO so the
  // cursor is a stable URL-safe string that can be parsed back unambiguously.
  const iso = endsAt instanceof Date ? endsAt.toISOString() : endsAt;
  return `${iso}|${id}`;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const province = searchParams.get('province');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const statuses = searchParams.get('statuses'); // Support multiple statuses
    const auctionType = searchParams.get('auctionType');
    const auctionTypes = searchParams.get('auctionTypes'); // Support multiple types
    const tierParam = searchParams.get('tier');
    const userIdParam = searchParams.get('userId');

    // --- P1 advanced filter params (Dennis decision F, all FREE) ----------
    // Whitelisted, parameterized, backward-compatible (absent => no constraint).
    // Powers Pixel's 4 advanced presets + hasImage filter.
    const priceMaxRaw = searchParams.get('priceMax');
    const pctTasacionMaxRaw = searchParams.get('pctTasacionMax');
    const endsBeforeRaw = searchParams.get('endsBefore');
    const hasImageRaw = searchParams.get('hasImage');
    const categoriesRaw = searchParams.get('categories'); // multi-value rollup (e.g. "Coches")

    // priceMax: positive finite number, else ignored.
    const priceMax = (() => {
      if (priceMaxRaw == null) return null;
      const n = Number(priceMaxRaw);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();
    // pctTasacionMax: 0 < n <= 1000 (allow generous ceiling; UI passes 70 etc.)
    const pctTasacionMax = (() => {
      if (pctTasacionMaxRaw == null) return null;
      const n = Number(pctTasacionMaxRaw);
      return Number.isFinite(n) && n > 0 && n <= 1000 ? n : null;
    })();
    // endsBefore: accept ISO date or ISO datetime. Validate via Date parse.
    const endsBefore = (() => {
      if (!endsBeforeRaw) return null;
      const t = Date.parse(endsBeforeRaw);
      if (Number.isNaN(t)) return null;
      return new Date(t).toISOString();
    })();
    // hasImage: only the literal "true" engages the filter (any other value => no constraint).
    const hasImage = hasImageRaw === 'true';
    // categories: comma-separated list; trim, dedupe, drop empties.
    const categoriesList = (() => {
      if (!categoriesRaw) return null;
      const list = categoriesRaw.split(',').map(s => s.trim()).filter(Boolean);
      const unique = [...new Set(list)];
      return unique.length > 0 ? unique : null;
    })();
    
    // Pagination params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const cursor = searchParams.get('cursor'); // For cursor-based pagination

    // Validate pagination
    const safeLimit = Math.min(Math.max(limit, 1), 100); // Max 100 per page
    const offset = (page - 1) * safeLimit;

    // --- Sort whitelist (P0 dropdown) -----------------------------------
    // Whitelist input -> safe ORDER BY clause. Never interpolate raw input.
    //
    // FORGE 2026-06-03 (Item C — promote properties primarily):
    //   New default = `category_rank` — properties (viviendas first) float to
    //   the top, with `publishedAt DESC` preserving recency WITHIN each tier
    //   and `id DESC` as a stable deterministic tiebreak for pagination.
    //   Implemented as a SQL CASE on `category` (NO migration, no new column).
    //
    //   Explicit `sort=` params still resolve to their existing plans below —
    //   this only changes the DEFAULT when no sort is supplied. User choice
    //   always wins.
    //
    //   Pagination: `category_rank` uses cursorMode='offset' because a CASE
    //   expression cannot be cleanly keyset-paginated. The existing page-
    //   fallback path (when `?page=N` is supplied without `?cursor=`) already
    //   handles this — `usingOffset` is set further down. Counts and
    //   teaserCounts are computed from snapshots taken BEFORE the ORDER BY
    //   is appended, so this change cannot affect them.
    type SortKey = 'category_rank' | 'endsAt_asc' | 'published_desc' | 'price_asc' | 'price_desc';
    const EFFECTIVE_PRICE = 'COALESCE("currentBid", "minimumBid", "appraisalValue")';
    const SORT_MAP: Record<SortKey, { orderBy: string; cursorMode: 'endsAt' | 'publishedAt' | 'offset' }> = {
      category_rank:   { orderBy: `${CATEGORY_RANK_CASE_SQL} ASC, "publishedAt" DESC, id DESC`, cursorMode: 'offset' },
      endsAt_asc:      { orderBy: '"endsAt" ASC NULLS LAST, id ASC',     cursorMode: 'endsAt' },
      published_desc:  { orderBy: '"publishedAt" DESC, id DESC',          cursorMode: 'publishedAt' },
      price_asc:       { orderBy: `${EFFECTIVE_PRICE} ASC NULLS LAST, id ASC`,  cursorMode: 'offset' },
      price_desc:      { orderBy: `${EFFECTIVE_PRICE} DESC NULLS LAST, id ASC`, cursorMode: 'offset' },
    };
    const rawSort = searchParams.get('sort');
    // Accept `publishedAt_desc` as alias for `published_desc` (Ken's brief uses
    // both spellings — keep both pointing at the same ORDER BY).
    const normalizedSort: SortKey = (() => {
      switch (rawSort) {
        case 'category_rank':
        case 'endsAt_asc':
        case 'published_desc':
        case 'price_asc':
        case 'price_desc':
          return rawSort;
        case 'publishedAt_desc':
          return 'published_desc';
        default:
          // FORGE 2026-06-03 (Item C): default is now properties-first.
          // Was 'endsAt_asc' (urgency-first). Explicit sort still wins above.
          return 'category_rank';
      }
    })();
    const sortPlan = SORT_MAP[normalizedSort];

    const tier = (tierParam || 'GUEST') as UserTier | 'GUEST';

    // Create cache key (include sort so different orderings don't collide)
    const cacheKey = {
      province: province || 'all',
      category: category || 'all',
      status: status || 'all',
      statuses: statuses || 'all',
      auctionType: auctionType || 'all',
      auctionTypes: auctionTypes || 'all',
      tier,
      page,
      limit: safeLimit,
      cursor: cursor || 'none',
      sort: normalizedSort,
      // P1 advanced filters — must be in cache key to avoid cross-filter collisions.
      priceMax: priceMax ?? 'none',
      pctTasacionMax: pctTasacionMax ?? 'none',
      endsBefore: endsBefore ?? 'none',
      hasImage: hasImage ? 'true' : 'none',
      categories: categoriesList ? categoriesList.join('|') : 'none'
    };
    
    // Try cache first (30 second TTL)
    const cached = auctionCache.get(cacheKey);
    if (cached) {
      console.log(`⚡ Cache HIT - returned in ${Date.now() - startTime}ms`);
      return NextResponse.json(cached);
    }
    
    // Check if user has active trial
    let hasActiveTrial = false;
    if (tier === 'free' && userIdParam) {
      try {
        const user = await queryOne<{ trialEndDate: string | Date | null }>(`
          SELECT trialEndDate FROM User WHERE id = ?
        `, [userIdParam]);

        if (user?.trialEndDate) {
          const trialEnd = new Date(user.trialEndDate);
          hasActiveTrial = trialEnd.getTime() > Date.now();
        }
      } catch (error) {
        console.error('Error checking trial status:', error);
      }
    }

    // Build optimized SQL query with filters at database level.
    //
    // FORGE 2026-06-02 (P1 count-vs-list reconciliation):
    // The list WHERE and the badge-count WHERE MUST share a single predicate.
    // Previously teaserCounts.active was derived from a bare
    // `status IN (…)` SELECT with no province/junk-row filter, so it returned
    // 466 while the list returned 447 (~19 province-null/junk rows hidden by
    // the list but counted by the badge). We now build the WHERE clause in
    // layered snapshots so the list SELECT, the list COUNT, and the teaser
    // counts ALL reuse the same upstream filters (province + category +
    // advanced filters + auction type). Single source of truth.
    // Document-archive wave (2026-06-03): correlated EXISTS subquery yields a
    // per-row `hasDocuments` boolean so cards can show a compact "documentos"
    // indicator without us inlining the full doc array on the list. Uses the
    // ("AuctionDocument"."auctionId") index so cost is ~one index probe per row.
    // The base SELECT shape is preserved (SELECT *) so downstream code that
    // assumes every Auction column is present keeps working; we only ADD a
    // computed column. Note: the snapshot-prefix slicing below uses
    // `preStatusSqlLen`/`preCursorSqlLen` indexes into this string AFTER the
    // SELECT line — those still work because the slices are computed AFTER
    // this base assignment.
    // db.ts auto-quotes mixed-case identifiers (Auction, AuctionDocument,
    // hasDocuments, auctionId) so we write the SQL the same way the rest of
    // this file does — unquoted PascalCase / camelCase. The alias `ad` is
    // all-lowercase, which PG accepts unquoted, so no special handling
    // needed there. The "AS hasDocuments" alias is auto-handled by the
    // quote-aliases pass in db.ts.
    let sql = `SELECT Auction.*, EXISTS (
        SELECT 1 FROM AuctionDocument ad
         WHERE ad.auctionId = Auction.id
       ) AS hasDocuments
      FROM Auction WHERE 1=1
      AND province IS NOT NULL
      AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
      AND LENGTH(TRIM(province)) > 1`;
    const params: any[] = [];
    
    // Apply filters
    if (province) {
      const normalizedProvince = normalizeText(province);
      const dbProvinces = await getCachedDistinctProvinces();
      const provinceMatches = dbProvinces
        .filter((value) => normalizeText(value) === normalizedProvince);

      if (provinceMatches.length > 0) {
        sql += ` AND province IN (${provinceMatches.map(() => '?').join(',')})`;
        params.push(...provinceMatches);
      } else {
        sql += ' AND LOWER(province) = LOWER(?)';
        params.push(province);
      }
    }
    if (categoriesList && categoriesList.length > 0) {
      // P1: multi-value category rollup (e.g. "Coches" = Turismos,Motocicletas,...)
      // Takes precedence over single `category` if both are provided.
      sql += ` AND category IN (${categoriesList.map(() => '?').join(', ')})`;
      params.push(...categoriesList);
    } else if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    // --- P1 advanced filters (parameterized, never interpolated) ---------
    // priceMax: same COALESCE expression used by price sort (currentBid -> minimumBid -> appraisalValue).
    if (priceMax != null) {
      sql += ` AND ${EFFECTIVE_PRICE} <= ?`;
      params.push(priceMax);
    }
    // pctTasacionMax: rows where effective price is <= (pct/100) * appraisalValue.
    // Exclude rows with null/zero appraisalValue (cannot compute a meaningful ratio).
    if (pctTasacionMax != null) {
      sql += ` AND "appraisalValue" IS NOT NULL AND "appraisalValue" > 0 AND ${EFFECTIVE_PRICE} IS NOT NULL AND ${EFFECTIVE_PRICE} <= (? / 100.0) * "appraisalValue"`;
      params.push(pctTasacionMax);
    }
    // endsBefore: future-but-soon window — endsAt between now and the supplied bound.
    if (endsBefore) {
      sql += ' AND "endsAt" IS NOT NULL AND "endsAt" >= NOW() AND "endsAt" <= ?';
      params.push(endsBefore);
    }
    // hasImage=true: real photo only (resolver-populated /api/auction-image/ OR legacy /streetview/).
    // Category placeholders must NOT satisfy this filter — mirrors isRealAuctionImage().
    if (hasImage) {
      sql += ` AND "imageUrl" IS NOT NULL AND ("imageUrl" LIKE '/api/auction-image/%' OR "imageUrl" LIKE '/streetview/%')`;
    }
    
    // FORGE 2026-06-02: snapshot AFTER all non-status, non-pagination filters.
    // This is the "filters minus status" prefix the teaser-count queries reuse,
    // so e.g. teaserCounts.active honors a `?province=Madrid` filter exactly
    // the same way the list does.
    const preStatusSqlLen = sql.length;
    const preStatusParamsLen = params.length;

    // Filter by status at SQL level for better performance
    if (statuses) {
      // Multiple statuses support (comma-separated)
      const statusList = statuses.split(',').map(s => s.trim().toUpperCase());
      const dbStatuses: string[] = [];
      
      for (const s of statusList) {
        // Map frontend status to DB status(es)
        switch (s) {
          case 'PROXIMA-APERTURA':
          case 'PROXIMA_APERTURA':
            dbStatuses.push('PROXIMA_APERTURA', 'PRE_AUCTION');
            break;
          case 'CELEBRANDOSE':
            dbStatuses.push('CELEBRANDOSE', 'ACTIVE');
            break;
          case 'SUSPENDIDA':
            dbStatuses.push('SUSPENDIDA', 'SUSPENDED');
            break;
          case 'CANCELADA':
            dbStatuses.push('CANCELADA', 'CANCELLED');
            break;
          case 'CONCLUIDA-PORTAL':
          case 'CONCLUIDA_PORTAL':
            dbStatuses.push('CONCLUIDA_PORTAL', 'FINISHED');
            break;
          case 'FINALIZADA-AUTORIDAD':
          case 'FINALIZADA_AUTORIDAD':
            dbStatuses.push('FINALIZADA_AUTORIDAD');
            break;
          default:
            dbStatuses.push(s);
        }
      }
      
      const uniqueStatuses = [...new Set(dbStatuses)];
      if (uniqueStatuses.length > 0) {
        sql += ` AND status IN (${uniqueStatuses.map(() => '?').join(', ')})`;
        params.push(...uniqueStatuses);
      }
    } else if (status) {
      // Legacy single status support. Status sets come from
      // `@/lib/auction-status` (single source of truth — list, counts, map,
      // carousel all consume the same arrays). The canonical clock guard is
      // appended to `status=active` so a stale CELEBRANDOSE row whose
      // endsAt has passed is NOT counted as active (matches the carousel
      // and reality — the scheduler sweep just hasn't caught it yet).
      if (status === 'active') {
        const set = ACTIVE_DB_STATUSES;
        sql += ` AND status IN (${set.map(() => '?').join(', ')}) AND ${ACTIVE_CLOCK_GUARD_SQL}`;
        params.push(...set);
      } else if (status === 'finished') {
        const set = FINISHED_DB_STATUSES;
        sql += ` AND status IN (${set.map(() => '?').join(', ')})`;
        params.push(...set);
      } else if (status === 'pre-auction') {
        const set = PRE_AUCTION_DB_STATUSES;
        sql += ` AND status IN (${set.map(() => '?').join(', ')})`;
        params.push(...set);
      }
    }
    
    // Filter by auction type. The frontend speaks the canonical plural form
    // (otras_tributarias / administrativas); the DB has BOTH the plural form
    // (new per-category scrapers) and the legacy singular form (older rows).
    // Expand each requested type to all DB labels that family ever used.
    const TYPE_QUERY_TO_DB: Record<string, string[]> = {
      JUDICIAL: ['JUDICIAL'],
      NOTARIAL: ['NOTARIAL'],
      AEAT: ['AEAT'],
      OTRAS_TRIBUTARIAS: ['OTRAS_TRIBUTARIAS', 'TRIBUTARIA'],
      TRIBUTARIA: ['OTRAS_TRIBUTARIAS', 'TRIBUTARIA'],
      ADMINISTRATIVAS: ['ADMINISTRATIVAS', 'ADMINISTRATIVA'],
      ADMINISTRATIVA: ['ADMINISTRATIVAS', 'ADMINISTRATIVA'],
      BANCARIA: ['BANCARIA'],
    };
    if (auctionTypes) {
      const typeList = auctionTypes.split(',').map(t => t.trim().toUpperCase());
      const dbTypeSet = new Set<string>();
      for (const t of typeList) {
        const expanded = TYPE_QUERY_TO_DB[t];
        if (expanded) expanded.forEach((v) => dbTypeSet.add(v));
        else dbTypeSet.add(t); // unknown — pass through, never crash the query
      }
      const dbTypes = Array.from(dbTypeSet);
      if (dbTypes.length > 0) {
        sql += ` AND auctionType IN (${dbTypes.map(() => '?').join(', ')})`;
        params.push(...dbTypes);
      }
    } else if (auctionType) {
      const upper = auctionType.toUpperCase();
      const expanded = TYPE_QUERY_TO_DB[upper] ?? [upper];
      sql += ` AND auctionType IN (${expanded.map(() => '?').join(', ')})`;
      params.push(...expanded);
    }
    
    // FORGE 2026-06-02: snapshot AFTER status/type filters, BEFORE cursor and
    // pagination. This is the canonical "list predicate" used by the totalCount
    // query so the badge and totalCount reconcile against the SAME row set.
    const preCursorSqlLen = sql.length;
    const preCursorParamsLen = params.length;

    // Cursor-based pagination — cursor semantics depend on active sort.
    //
    // FORGE 2026-06-02 (P1 null-tail reachability fix):
    //   endsAt_asc cursor was previously `endsAt > ?` with `endsAt IS NOT NULL`,
    //   which permanently stranded the NULLS-LAST tail (46 SUSPENDIDA rows with
    //   null endsAt today): they were counted but unreachable by scrolling.
    //   Cursor now encodes BOTH endsAt and id as `<isoOrNULL>|<uuid>` (URL-safe,
    //   pipe-delimited) so we can correctly keyset across the null boundary.
    //
    //   The cursor format is backward-compatible: a legacy plain-ISO cursor
    //   (no pipe) is parsed as `<iso>|""` and we fall back to the old
    //   `endsAt > ?` predicate; the new format adds the null-tail predicate.
    //
    //   published_desc unchanged (no null tail — publishedAt is NOT NULL).
    //   price_asc/desc cursor pagination unsupported (use page=/OFFSET).
    //
    // FORGE 2026-06-02 (P1 page-fallback):
    //   The UI sends `page=` (not `cursor=`) on infinite scroll, so even with
    //   the cursor fix above, exhaustion was impossible on endsAt_asc /
    //   published_desc — no OFFSET was being appended on those sorts. We now
    //   fall back to OFFSET whenever a cursor-capable sort is paginated by
    //   page= alone. Both strategies share the same deterministic ORDER BY
    //   (`endsAt ASC NULLS LAST, id ASC` etc.) so they remain consistent and
    //   both reach the null tail.
    let usingOffset = false;
    if (cursor && sortPlan.cursorMode === 'endsAt') {
      const parsed = parseEndsAtCursor(cursor);
      if (parsed.kind === 'legacy') {
        // Old plain-ISO cursor — keep prior semantics for in-flight clients,
        // BUT relax `IS NOT NULL` so the null tail becomes reachable once the
        // future-endsAt rows are exhausted.
        sql += ' AND ("endsAt" > ? OR "endsAt" IS NULL)';
        params.push(parsed.endsAt);
      } else if (parsed.kind === 'nonNull') {
        // Standard 2-column keyset under ORDER BY endsAt ASC NULLS LAST, id ASC.
        sql += ' AND ("endsAt" > ? OR ("endsAt" = ? AND id > ?) OR "endsAt" IS NULL)';
        params.push(parsed.endsAt, parsed.endsAt, parsed.id);
      } else {
        // parsed.kind === 'null' — we're already inside the NULL tail.
        sql += ' AND "endsAt" IS NULL AND id > ?';
        params.push(parsed.id);
      }
    } else if (cursor && sortPlan.cursorMode === 'publishedAt') {
      sql += ' AND "publishedAt" < ?';
      params.push(cursor);
    } else if (sortPlan.cursorMode === 'offset') {
      // Price sorts: fall back to LIMIT/OFFSET pagination using the existing
      // `page` param. Do NOT honor cursor here — it would silently misalign.
      usingOffset = true;
    } else if (!cursor && page > 1 && (sortPlan.cursorMode === 'endsAt' || sortPlan.cursorMode === 'publishedAt')) {
      // FORGE 2026-06-02: UI sends ?page=N without a cursor on infinite scroll.
      // Without OFFSET that would return page 1 forever on endsAt_asc /
      // published_desc. Fall through to OFFSET pagination for backward compat;
      // the deterministic ORDER BY (with id tiebreak) keeps pages stable.
      usingOffset = true;
    }

    // Whitelisted ORDER BY (safe; never interpolates user input)
    sql += ` ORDER BY ${sortPlan.orderBy}`;

    // Add limit (+1 to detect hasMore) and optional offset for price sorts
    sql += ' LIMIT ?';
    params.push(safeLimit + 1);
    if (usingOffset && offset > 0) {
      sql += ' OFFSET ?';
      params.push(offset);
    }
    
    // Execute query
    const queryStart = Date.now();
    const auctions = await query<AuctionFromDB>(sql, params);
    const queryTime = Date.now() - queryStart;
    
    // Check if there are more results
    const hasMore = auctions.length > safeLimit;
    const results = hasMore ? auctions.slice(0, safeLimit) : auctions;

    // Next cursor — depends on sort. Null for price sorts (offset-only).
    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const last = results[results.length - 1];
      if (sortPlan.cursorMode === 'endsAt') {
        // FORGE 2026-06-02: encode endsAt + id so we can keyset across the
        // NULLS-LAST boundary. `last.endsAt === null` is no longer a dead-end;
        // it advances inside the null tail by id.
        nextCursor = encodeEndsAtCursor(last.endsAt, last.id);
      } else if (sortPlan.cursorMode === 'publishedAt') {
        nextCursor = last.publishedAt;
      }
    }

    // Get total count (only if needed for pagination UI).
    //
    // FORGE 2026-06-02: the COUNT runs against the snapshot AT preCursorSqlLen
    // — i.e. base + non-status filters + status filter, NOT cursor or
    // pagination. This is the canonical "list predicate" and the same one we
    // reuse below for teaserCounts so the badge and totalCount can never drift
    // again. (The prior implementation tail-stripped LIMIT/OFFSET from the
    // already-mutated `sql` string, which silently included whatever cursor
    // was applied — wrong on the first paginated request.)
    // Helper to strip the SELECT-list prefix off a snapshot of `sql` so we
    // can reuse the predicate inside a COUNT query. The previous regex
    // (`/^SELECT \* FROM Auction WHERE /`) broke when the document-archive
    // wave widened the SELECT list with the `hasDocuments` EXISTS subquery
    // (2026-06-03) — we now anchor on the stable `WHERE 1=1` boundary that
    // every predicate snapshot includes.
    const PREDICATE_BOUNDARY = 'WHERE 1=1';
    const stripPredicate = (snapshot: string): string => {
      const idx = snapshot.indexOf(PREDICATE_BOUNDARY);
      // Defensive: if the boundary disappears in a future refactor, fall
      // back to passing the whole snapshot through so the COUNT can still
      // be debugged from logs rather than silently returning garbage.
      return idx === -1 ? snapshot : snapshot.slice(idx);
    };

    let totalCount: number | null = null;
    if (page === 1) {
      const listPredicateSql = sql.slice(0, preCursorSqlLen);
      const listPredicateParams = params.slice(0, preCursorParamsLen);
      const countSql = `SELECT COUNT(*) as count FROM Auction ${stripPredicate(listPredicateSql)}`;
      const countRow = await queryOne<{ count: string | number }>(countSql, listPredicateParams);
      // PG returns COUNT(*) as bigint -> string; coerce.
      totalCount = countRow ? Number(countRow.count) : 0;
    }
    
    // Apply tier-based masking
    const maskStart = Date.now();
    const maskedAuctions = applyTierMasking(results, tier, hasActiveTrial);
    const maskTime = Date.now() - maskStart;
    
    // Get teaser counts for guests.
    //
    // FORGE 2026-06-02 (P1 count-vs-list reconciliation):
    // The badge counts now reuse the SAME base predicate as the list
    // (province junk filter + province=, category, categories, advanced
    // filters, auction type — everything EXCEPT status), so the badge
    // numbers always match what the user can actually browse to. The status
    // set is the only thing that varies per badge.
    //
    // Canonical predicate = list base (preStatusSqlLen snapshot) AND
    //                       status IN (<badge's status set>)
    //
    // For ?status=active specifically: badge "active" → SAME 4-status set the
    // list uses → identical row set → teaserCounts.active === totalCount.
    let teaserCounts = null;
    if (tier === 'GUEST' && page === 1) {
      const basePredicateSql = sql.slice(0, preStatusSqlLen);
      const basePredicateParams = params.slice(0, preStatusParamsLen);
      const baseWhere = stripPredicate(basePredicateSql);

      // Per-badge count helper. `withClockGuard=true` appends the canonical
      // ACTIVE_CLOCK_GUARD_SQL so the active badge sees the SAME rows as the
      // `?status=active` list (both drop CELEBRANDOSE rows whose endsAt has
      // passed). Pre-auction badge does NOT need the clock guard (those
      // auctions haven't started — they have no "has it ended" question).
      const countWithStatus = async (
        statusSet: readonly string[],
        withClockGuard: boolean,
      ): Promise<number> => {
        const placeholders = statusSet.map(() => '?').join(', ');
        const clock = withClockGuard ? ` AND ${ACTIVE_CLOCK_GUARD_SQL}` : '';
        const countSql = `SELECT COUNT(*) as count FROM Auction ${baseWhere} AND status IN (${placeholders})${clock}`;
        const row = await queryOne<{ count: string | number }>(
          countSql,
          [...basePredicateParams, ...statusSet],
        );
        return row ? Number(row.count) : 0;
      };

      const [active, preAuction] = await Promise.all([
        countWithStatus(ACTIVE_DB_STATUSES, true),
        countWithStatus(PRE_AUCTION_DB_STATUSES, false),
      ]);

      teaserCounts = { active, preAuction };
    }

    const response = {
      success: true,
      data: maskedAuctions,
      count: maskedAuctions.length,
      pagination: {
        page,
        limit: safeLimit,
        hasMore,
        nextCursor,
        totalCount
      },
      teaserCounts,
      userTier: tier,
      performance: {
        total: Date.now() - startTime,
        query: queryTime,
        masking: maskTime
      }
    };
    
    // Cache the response
    auctionCache.set(cacheKey, response, 30000); // 30 second cache
    
    console.log(`✅ Auctions loaded in ${Date.now() - startTime}ms (query: ${queryTime}ms, masking: ${maskTime}ms)`);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching auctions:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch auctions', 
        details: error instanceof Error ? error.message : String(error),
        performance: { total: Date.now() - startTime }
      },
      { status: 500 }
    );
  }
}
