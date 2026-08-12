/**
 * Pure mapper for the notifications-history feed served by
 * `GET /api/user/notifications` (F2b, 2026-07-28).
 *
 * A raw joined row (Notification n LEFT JOIN Auction a) is shaped into the
 * exact object the alerts page renders: a clickable auction reference with a
 * canonical detail slug + URL. Kept pure (no DB, no I/O) so it can be unit
 * tested with the repo's tsx-assertion convention — the auction's minted v3
 * url is an ARGUMENT, not something this module fetches, so the route can pay
 * one batched `fetchV3UrlsBatch` probe per page instead of an N+1 per row.
 * (`resolveAuctionPath` is the shared pure decision function; its DB helpers
 * live in the same module but are not called here.)
 *
 * Honest-NULL: the JOIN is a LEFT JOIN — if the auction row was later deleted,
 * title/province/etc. come back null. We still emit a usable slug/url from the
 * always-present `auctionId` (buildAuctionSlug tolerates null fields); the
 * detail page handles a missing row itself. Nothing is fabricated.
 */

import { buildAuctionSlug } from '@/lib/seo/auction-slug';
import { resolveAuctionPath } from '@/lib/seo/auction-url';

export interface NotificationHistoryRow {
  id: string;
  auctionId: string;
  channel: string | null;
  sentAt: Date | string | null;
  read?: boolean | null;
  // Auction fields (nullable via LEFT JOIN)
  title?: string | null;
  auctionType?: string | null;
  province?: string | null;
  municipality?: string | null;
  imageUrl?: string | null;
}

export interface NotificationHistoryItem {
  id: string;
  auctionId: string;
  title: string | null;
  slug: string;
  /** App-relative link to the auction detail page. */
  url: string;
  province: string | null;
  municipality: string | null;
  imageUrl: string | null;
  channel: string | null;
  /** ISO-8601 UTC timestamp. */
  sentAt: string | null;
  read: boolean;
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * @param v3Url the minted `auction_url_v3.url` for `row.auctionId`, or null.
 *   Passed in rather than fetched so this mapper stays pure (no DB, unit
 *   testable) and so the caller pays ONE batched `fetchV3UrlsBatch` probe for
 *   the whole page instead of an N+1 per notification. Absent/null → the
 *   legacy path, which is the correct answer for a held / degraded /
 *   quarantined / hex-legacy row (see `lib/seo/auction-url.ts`).
 */
export function mapNotificationRow(
  row: NotificationHistoryRow,
  v3Url?: string | null,
): NotificationHistoryItem {
  const forSlug = {
    id: row.auctionId,
    auctionType: row.auctionType ?? null,
    province: row.province ?? null,
    municipality: row.municipality ?? null,
  };
  const slug = buildAuctionSlug(forSlug);

  return {
    id: row.id,
    auctionId: row.auctionId,
    title: row.title ?? null,
    slug,
    url: resolveAuctionPath(forSlug, v3Url ?? null),
    province: row.province ?? null,
    municipality: row.municipality ?? null,
    imageUrl: row.imageUrl ?? null,
    channel: row.channel ?? null,
    sentAt: toIso(row.sentAt),
    read: Boolean(row.read),
  };
}
