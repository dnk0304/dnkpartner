/**
 * Auction-image resolver.
 *
 * Fallback chain for an ACTIVE auction (CELEBRANDOSE / PROXIMA_APERTURA only):
 *   1. Already-cached file on disk (storage.exists) → publicPathFor.
 *   2. Catastro by refcatastral → cache → publicPathFor.
 *   3. Street View by lat/lng → cache → publicPathFor.
 *   4. null (caller falls through to category placeholder).
 *
 * Population happens out-of-band (backfill script + future enrichment hook).
 * The request path (api/auctions/route.ts) only READS the populated imageUrl —
 * never makes outbound calls during a list request.
 */
import { query } from '@/lib/db';
import { exists, publicPathFor, writeImage, safeKey } from './storage';
import { fetchCatastroFacade } from './catastro';
import { fetchStreetView } from './streetview';
import { extractRCFromRow } from './extract-rc';
import { buildOrGetMap, mapPublicPathFor, getOptimalMapZoom } from './osm-map';

// Wave52 (2026-06-04): include SUSPENDIDA / SUSPENDED so the Street View
// backfill covers suspended auctions (they're still "live" for a buyer
// watching them — they carry a resumeAt and surface in the card grid + email).
export const ACTIVE_STATUSES = ['CELEBRANDOSE', 'PROXIMA_APERTURA', 'ACTIVE', 'PRE_AUCTION', 'SUSPENDIDA', 'SUSPENDED'] as const;

// Wave105 (2026-06-14): status-aware image policy (cost fix). Street View is
// PAID; UPCOMING auctions (PROXIMA_APERTURA / PRE_AUCTION) must NEVER burn a
// paid SV request — they may never go live. Split ACTIVE_STATUSES into:
//   LIVE_STATUSES     → may reach the paid Street View rung (resolveAndPersist).
//   UPCOMING_STATUSES → free OSM map only (resolveUpcomingMapAndPersist).
// SUSPENDIDA/SUSPENDED count as LIVE for imagery (a buyer is still watching).
export const LIVE_STATUSES = ['CELEBRANDOSE', 'ACTIVE', 'SUSPENDIDA', 'SUSPENDED'] as const;
export const UPCOMING_STATUSES = ['PROXIMA_APERTURA', 'PRE_AUCTION'] as const;

export function isLiveStatus(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}
export function isUpcomingStatus(status: string): boolean {
  return (UPCOMING_STATUSES as readonly string[]).includes(status);
}

export interface ResolverRow {
  boeId: string;
  status: string;
  cadastralRef: string | null;
  cadastralData: string | null;
  lotDescription: string | null;
  propertyDescription: string | null;
  boeAnnouncement: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  /** Optional — used only to pick the OSM map zoom for upcoming rows. */
  category?: string | null;
}

export type Source = 'cached' | 'catastro' | 'streetview' | 'osm-map' | null;

export interface ResolveOutcome {
  source: Source;
  publicPath: string | null;
  bytes?: number;
  note?: string;
}

/** Pure resolution — does NOT touch the DB. Caller decides whether to persist. */
export async function resolveImageForRow(row: ResolverRow): Promise<ResolveOutcome> {
  // Active-only guard.
  if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
    return { source: null, publicPath: null, note: 'inactive-status' };
  }

  // 1. Already cached on disk?
  if (await exists(row.boeId)) {
    return { source: 'cached', publicPath: publicPathFor(row.boeId) };
  }

  // 2. Catastro by RC.
  const rc = extractRCFromRow(row);
  if (rc) {
    const r = await fetchCatastroFacade(rc);
    if (r.ok) {
      await writeImage(row.boeId, r.bytes);
      return { source: 'catastro', publicPath: publicPathFor(row.boeId), bytes: r.bytesLen };
    }
  }

  // 3. Street View by lat/lng.
  if (row.latitude != null && row.longitude != null) {
    const r = await fetchStreetView(row.latitude, row.longitude);
    if (r.ok) {
      await writeImage(row.boeId, r.bytes);
      return { source: 'streetview', publicPath: publicPathFor(row.boeId), bytes: r.bytesLen };
    }
    if ('reason' in r && r.reason === 'api-disabled') {
      return { source: null, publicPath: null, note: 'streetview-api-disabled' };
    }
  }

  return { source: null, publicPath: null, note: 'no-source' };
}

/**
 * FREE-ONLY resolution (Bug 1, 2026-06-09).
 *
 * Identical to {@link resolveImageForRow} but STOPS before the Street View
 * rung — it only ever hits:
 *   1. Already-cached file on disk (free).
 *   2. Catastro-by-refcatastral (free, no API key, coord-independent).
 *
 * Used by the alert-email path. Dennis is strict: NO paid Google API
 * (Street View Static / Static Maps) may fire for finalized / alert auctions.
 * `resolveImageForRow` can reach `fetchStreetView` (a BILLED request once the
 * Street View Static API is enabled on the GCP project) — so the email path
 * MUST NOT call it. This function makes the "no paid call" guarantee
 * structural, not dependent on the API happening to be disabled today.
 *
 * Returns the same ResolveOutcome shape; `source` is 'cached' | 'catastro' |
 * null. NEVER 'streetview'.
 */
export async function resolveFreeImageForRow(row: ResolverRow): Promise<ResolveOutcome> {
  if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
    return { source: null, publicPath: null, note: 'inactive-status' };
  }

  // 1. Already cached on disk?
  if (await exists(row.boeId)) {
    return { source: 'cached', publicPath: publicPathFor(row.boeId) };
  }

  // 2. Catastro by RC (FREE). No Street View rung — paid path deliberately omitted.
  const rc = extractRCFromRow(row);
  if (rc) {
    const r = await fetchCatastroFacade(rc);
    if (r.ok) {
      await writeImage(row.boeId, r.bytes);
      return { source: 'catastro', publicPath: publicPathFor(row.boeId), bytes: r.bytesLen };
    }
  }

  return { source: null, publicPath: null, note: 'no-free-source' };
}

/**
 * FREE-only resolve + persist (Bug 1). Mirrors {@link resolveAndPersist} but
 * uses {@link resolveFreeImageForRow} — Catastro / cached only, never the
 * paid Street View rung. Persists the resolved `/api/auction-image/<boeId>`
 * URL back to the row so subsequent reads (cards, detail) get it for free too.
 */
export async function resolveFreeAndPersist(row: ResolverRow): Promise<ResolveOutcome> {
  const outcome = await resolveFreeImageForRow(row);
  if (outcome.publicPath && outcome.publicPath !== row.imageUrl) {
    await query(
      'UPDATE "Auction" SET "imageUrl" = $1, "updatedAt" = NOW() WHERE "boeId" = $2',
      [outcome.publicPath, row.boeId]
    );
  }
  return outcome;
}

/** Resolve AND persist the imageUrl back to the DB on success. */
export async function resolveAndPersist(row: ResolverRow): Promise<ResolveOutcome> {
  const outcome = await resolveImageForRow(row);
  if (outcome.publicPath && outcome.publicPath !== row.imageUrl) {
    await query(
      'UPDATE "Auction" SET "imageUrl" = $1, "updatedAt" = NOW() WHERE "boeId" = $2',
      [outcome.publicPath, row.boeId]
    );
  }
  return outcome;
}

/**
 * UPCOMING-row resolution (wave105, 2026-06-14). FREE only — NEVER reaches the
 * paid Street View rung. For PROXIMA_APERTURA / PRE_AUCTION auctions:
 *   1. Already-cached real photo on disk (free) → keep it (sunk cost; an
 *      upcoming row imaged earlier today must not be discarded).
 *   2. Coords present → self-hosted FREE OSM map (/api/auction-map/<key>),
 *      stitched + cached on our volume (OSM-policy compliant, $0).
 *   3. No coords → null (caller falls through to branded placeholder — honest).
 *
 * Deliberately does NOT call fetchStreetView OR fetchCatastroFacade: upcoming
 * imagery is map-first and must be zero paid-API and zero per-row outbound
 * Catastro cost. The map is the intended upcoming visual.
 */
export async function resolveUpcomingMapForRow(row: ResolverRow): Promise<ResolveOutcome> {
  // 1. Real photo already cached on disk? Preserve it — never downgrade to a map.
  if (await exists(row.boeId)) {
    return { source: 'cached', publicPath: publicPathFor(row.boeId) };
  }

  // 2. Free self-hosted OSM map when coords exist.
  if (row.latitude != null && row.longitude != null) {
    const zoom = getOptimalMapZoom(row.category ?? null);
    const built = await buildOrGetMap(row.latitude, row.longitude, zoom);
    if (built) {
      return { source: 'osm-map', publicPath: mapPublicPathFor(built.key) };
    }
  }

  // 3. No coords / map build failed → branded placeholder (caller's job).
  return { source: null, publicPath: null, note: 'no-map-source' };
}

/** Resolve UPCOMING free-map AND persist the map URL back to the row. */
export async function resolveUpcomingMapAndPersist(row: ResolverRow): Promise<ResolveOutcome> {
  const outcome = await resolveUpcomingMapForRow(row);
  if (outcome.publicPath && outcome.publicPath !== row.imageUrl) {
    await query(
      'UPDATE "Auction" SET "imageUrl" = $1, "updatedAt" = NOW() WHERE "boeId" = $2',
      [outcome.publicPath, row.boeId]
    );
  }
  return outcome;
}

/**
 * STATUS-AWARE policy dispatcher (wave105). The ONE entry point the backfill
 * drain should call so the status→cost rule cannot drift:
 *   - LIVE status     → resolveAndPersist (can reach the PAID Street View rung).
 *   - UPCOMING status → resolveUpcomingMapAndPersist (FREE OSM map only —
 *                       structurally CANNOT reach fetchStreetView).
 *   - anything else   → no-op (inactive).
 *
 * Go-live upgrade path: when a row transitions UPCOMING→LIVE and still has only
 * a map URL (`/api/auction-map/…`, NOT `/api/auction-image/…`), the LIVE branch
 * here runs the full chain and upgrades it to a Street View photo. The backfill
 * imageUrl skip only excludes `/api/auction-image/%`, so a map URL does NOT
 * match the skip — the row is re-selected and upgraded. See backfill route.
 */
export async function policyResolveAndPersist(row: ResolverRow): Promise<ResolveOutcome> {
  if (isLiveStatus(row.status)) {
    return resolveAndPersist(row);
  }
  if (isUpcomingStatus(row.status)) {
    return resolveUpcomingMapAndPersist(row);
  }
  return { source: null, publicPath: null, note: 'inactive-status' };
}

/** Public-path key check for the serving route. Defends against ../ traversal. */
export { safeKey };
