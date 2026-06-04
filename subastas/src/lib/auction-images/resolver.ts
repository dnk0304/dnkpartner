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

// Wave52 (2026-06-04): include SUSPENDIDA / SUSPENDED so the Street View
// backfill covers suspended auctions (they're still "live" for a buyer
// watching them — they carry a resumeAt and surface in the card grid + email).
export const ACTIVE_STATUSES = ['CELEBRANDOSE', 'PROXIMA_APERTURA', 'ACTIVE', 'PRE_AUCTION', 'SUSPENDIDA', 'SUSPENDED'] as const;

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
}

export type Source = 'cached' | 'catastro' | 'streetview' | null;

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

/** Public-path key check for the serving route. Defends against ../ traversal. */
export { safeKey };
