/**
 * Unified cross-platform trend signal schema — DNK Trends Phase 1 (2026-06-13).
 *
 * Every trend source persists its pulls as TrendSignal rows via snapshotStore.
 * One row = one observation of one keyword on one platform at one instant.
 *
 * Provenance rules (judge-enforced, zero tolerance):
 * - `isMock` is MANDATORY and must be set EXPLICITLY at the capture site.
 *   There is no default. Mock/fallback data must never be written with
 *   isMock:false, and isMock:true rows must never surface through
 *   /api/trends/signal.
 * - `source` is the concrete provenance of the pull: the endpoint/URL/method
 *   actually used (e.g. "etsy-open-api-v3:/listings/active"), not a vague
 *   platform name.
 */

/** Platforms the loop tracks. Extend as Phase 2/3 sources come online. */
export type TrendPlatform =
  | 'etsy'
  | 'googleTrends'
  | 'tiktokCC'
  | 'amazon'
  | 'pinterest'
  | 'reddit'
  | 'ebay'
  | 'googleShopping'
  | 'tiktokShop'
  | 'twitter';

export const TREND_PLATFORMS: readonly TrendPlatform[] = [
  'etsy',
  'googleTrends',
  'tiktokCC',
  'amazon',
  'pinterest',
  'reddit',
  'ebay',
  'googleShopping',
  'tiktokShop',
  'twitter',
] as const;

export interface TrendSignal {
  /** Normalized keyword/niche this observation is about. */
  keyword: string;
  /** Platform the signal was observed on. */
  platform: TrendPlatform;
  /**
   * Platform-native numeric metrics, e.g.
   *   etsy: { resultCount, listingsSampled, avgFavorers }
   *   googleTrends: { interest0to100 }
   */
  metrics: Record<string, number>;
  /** ISO 8601 UTC timestamp of capture. */
  capturedAt: string;
  /** Concrete provenance: endpoint/URL/method used for this pull. */
  source: string;
  /** MANDATORY explicit mock flag — set at the capture site, never defaulted. */
  isMock: boolean;
  /** Optional raw platform payload (kept when cheap; not part of metrics). */
  raw?: unknown;
}

/** Runtime guard for rows read back from disk (files are append-edited JSON). */
export function isTrendSignal(value: unknown): value is TrendSignal {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.keyword === 'string' &&
    typeof v.platform === 'string' &&
    typeof v.metrics === 'object' && v.metrics !== null &&
    typeof v.capturedAt === 'string' &&
    typeof v.source === 'string' &&
    typeof v.isMock === 'boolean'
  );
}
