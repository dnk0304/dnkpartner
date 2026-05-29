/**
 * GET /api/notifications — list current user's in-app notifications.
 *
 * Query params:
 *   - limit   : number 1-100 (default 20)
 *   - cursor  : ISO timestamp; returns rows with sentAt < cursor (for paging)
 *   - unread  : 'true' to only return unread
 *
 * Response:
 *   {
 *     success: true,
 *     data: Notification[],
 *     pagination: { hasMore, nextCursor }
 *   }
 *
 * Notification shape: { id, type, channel, auctionId, read, sentAt,
 *   deliveredAt, payload }. Payload is the JSON Ghost packed at outbox time
 *   (title, province, currentBid, toStatus, etc — varies by event type).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10), 1), 100);
  const cursor = url.searchParams.get('cursor');
  const unreadOnly = url.searchParams.get('unread') === 'true';

  const where: Record<string, unknown> = {
    userId: session.userId,
    // Inbox shows only in-app rows; email/push rows are delivery audit logs.
    channel: 'inapp',
  };
  if (unreadOnly) where.read = false;
  if (cursor) {
    const cur = new Date(cursor);
    if (!Number.isNaN(cur.getTime())) where.sentAt = { lt: cur };
  }

  const rows = await prisma.notification.findMany({
    where,
    orderBy: { sentAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      type: true,
      channel: true,
      auctionId: true,
      read: true,
      sentAt: true,
      deliveredAt: true,
      payload: true,
    },
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].sentAt.toISOString() : null;

  return NextResponse.json({
    success: true,
    data,
    pagination: { hasMore, nextCursor },
  });
}
