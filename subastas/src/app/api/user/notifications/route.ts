import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { mapNotificationRow, type NotificationHistoryRow } from '@/lib/notifications/history';
import { fetchV3UrlsBatch } from '@/lib/seo/auction-url';

/**
 * GET /api/user/notifications  (auth-gated, current user only)
 *
 * Real notification stats + paginated history — replaces the hardcoded "24"
 * literal on the alerts page (F2b, 2026-07-28).
 *
 * Data source: the `Notification` table. The alert-email send path
 * (`/api/alerts/check` → recordNotifications, wave113 2026-06-21) writes one
 * row per (alert, auction, channel='email') on every successful send, so this
 * feed reflects REAL sends accruing since wave113 — not a mock.
 *
 * Query params:
 *   limit  — page size, default 20, clamped 1..100
 *   offset — page offset, default 0, clamped >= 0
 *
 * Response:
 *   { success, count7d, countTotal,
 *     pagination: { limit, offset, total, hasMore },
 *     history: NotificationHistoryItem[] }   // newest first
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const limit = clampInt(searchParams.get('limit'), 20, 1, 100);
    const offset = clampInt(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Real counts. `::int` casts Postgres' bigint COUNT to a JS number.
    const count7dRow = await queryOne<{ cnt: number }>(
      'SELECT COUNT(*)::int AS cnt FROM Notification WHERE userId = ? AND sentAt >= ?',
      [userId, sevenDaysAgo],
    );
    const totalRow = await queryOne<{ cnt: number }>(
      'SELECT COUNT(*)::int AS cnt FROM Notification WHERE userId = ?',
      [userId],
    );
    const count7d = count7dRow?.cnt ?? 0;
    const countTotal = totalRow?.cnt ?? 0;

    // History page — join Auction for title/slug fields + thumbnail.
    const rows = await query<NotificationHistoryRow>(
      `SELECT n.id, n.auctionId, n.channel, n.sentAt, n.read,
              a.title, a.auctionType, a.province, a.municipality, a.imageUrl
         FROM Notification n
         LEFT JOIN Auction a ON a.id = n.auctionId
        WHERE n.userId = ?
        ORDER BY n.sentAt DESC
        LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );

    // ONE `= ANY(...)` probe for the whole page (never per-row). Non-fatal: a
    // failed lookup leaves the map empty and every item falls back to its
    // legacy path, which still 200s — the feed must not 500 over a link.
    let v3 = new Map<string, string>();
    try {
      v3 = await fetchV3UrlsBatch(rows.map((r) => r.auctionId));
    } catch (error) {
      console.error('notification url v3 lookup failed; falling back to legacy paths', error);
    }
    const history = rows.map((r) => mapNotificationRow(r, v3.get(r.auctionId) ?? null));

    return NextResponse.json({
      success: true,
      count7d,
      countTotal,
      pagination: {
        limit,
        offset,
        total: countTotal,
        hasMore: offset + history.length < countTotal,
      },
      history,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Error al obtener las notificaciones' },
      { status: 500 },
    );
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
