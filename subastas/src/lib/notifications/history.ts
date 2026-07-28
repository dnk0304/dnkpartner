/**
 * Pure mapper for the notifications-history feed served by
 * `GET /api/user/notifications` (F2b, 2026-07-28).
 *
 * A raw joined row (Notification n LEFT JOIN Auction a) is shaped into the
 * exact object the alerts page renders: a clickable auction reference with a
 * canonical detail slug + URL. Kept pure (no DB, no I/O) so it can be unit
 * tested with the repo's tsx-assertion convention.
 *
 * Honest-NULL: the JOIN is a LEFT JOIN — if the auction row was later deleted,
 * title/province/etc. come back null. We still emit a usable slug/url from the
 * always-present `auctionId` (buildAuctionSlug tolerates null fields); the
 * detail page handles a missing row itself. Nothing is fabricated.
 */

import { buildAuctionSlug } from '@/lib/seo/auction-slug';

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

export function mapNotificationRow(row: NotificationHistoryRow): NotificationHistoryItem {
  const slug = buildAuctionSlug({
    id: row.auctionId,
    auctionType: row.auctionType ?? null,
    province: row.province ?? null,
    municipality: row.municipality ?? null,
  });

  return {
    id: row.id,
    auctionId: row.auctionId,
    title: row.title ?? null,
    slug,
    url: `/subastas/subasta/${slug}`,
    province: row.province ?? null,
    municipality: row.municipality ?? null,
    imageUrl: row.imageUrl ?? null,
    channel: row.channel ?? null,
    sentAt: toIso(row.sentAt),
    read: Boolean(row.read),
  };
}
