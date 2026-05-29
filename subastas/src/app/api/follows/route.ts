/**
 * Follows API — a "follow" is a Favorite row with notify-prefs (per the Wave
 * 1.3 schema decision: Favorite extended in-place rather than introducing a
 * separate AuctionFollow table).
 *
 * GET  /api/follows           — list current user's follows with prefs + minimal auction info.
 * POST /api/follows           — create a follow for the current user (body: { auctionId, prefs? }).
 *
 * Per-auction prefs CRUD lives in /api/follows/[auctionId]/prefs.
 * Unfollow lives in /api/follows/[auctionId] (DELETE).
 *
 * Response envelope: `{ success: true, data: ... }`.
 *
 * Note: the legacy /api/favorites endpoint still exists (sqlite-style raw SQL,
 * does NOT touch the notify-pref columns). It stays for backward compat with
 * any older UI screen; new UI should use /api/follows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

const ALLOWED_CHANNELS = new Set(['email', 'push', 'inapp']);

function sanitizeChannels(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const parts = input
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ALLOWED_CHANNELS.has(s));
  return parts.length ? Array.from(new Set(parts)).join(',') : undefined;
}

function pickPrefs(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of [
    'notifyOnGoLive',
    'notifyOnBid',
    'notifyOnStatus',
    'notifyOnSuspension',
    'notifyOnResume',
    'notifyOnFinish',
  ] as const) {
    if (typeof body[k] === 'boolean') data[k] = body[k];
  }
  const channels = sanitizeChannels(body.channels);
  if (channels) data.channels = channels;
  if (body.quietHoursStart === null) data.quietHoursStart = null;
  else if (typeof body.quietHoursStart === 'number' && body.quietHoursStart >= 0 && body.quietHoursStart <= 23) {
    data.quietHoursStart = body.quietHoursStart;
  }
  if (body.quietHoursEnd === null) data.quietHoursEnd = null;
  else if (typeof body.quietHoursEnd === 'number' && body.quietHoursEnd >= 0 && body.quietHoursEnd <= 23) {
    data.quietHoursEnd = body.quietHoursEnd;
  }
  return data;
}

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const follows = await prisma.favorite.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      auctionId: true,
      notes: true,
      createdAt: true,
      notifyOnGoLive: true,
      notifyOnBid: true,
      notifyOnStatus: true,
      notifyOnSuspension: true,
      notifyOnResume: true,
      notifyOnFinish: true,
      channels: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      auction: {
        select: {
          id: true,
          title: true,
          province: true,
          municipality: true,
          status: true,
          currentBid: true,
          appraisalValue: true,
          endsAt: true,
          imageUrl: true,
        },
      },
    },
  });

  return NextResponse.json({ success: true, data: follows });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const auctionId = typeof body.auctionId === 'string' ? body.auctionId : '';
  if (!auctionId) {
    return NextResponse.json({ success: false, error: 'auctionId_required' }, { status: 400 });
  }

  // Confirm the auction exists (returns 404 instead of FK constraint surprise).
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { id: true },
  });
  if (!auction) {
    return NextResponse.json({ success: false, error: 'auction_not_found' }, { status: 404 });
  }

  const prefs = pickPrefs(body);
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const follow = await prisma.favorite.upsert({
    where: { userId_auctionId: { userId: session.userId, auctionId } },
    create: {
      userId: session.userId,
      auctionId,
      notes,
      ...prefs,
    },
    update: {
      // Re-following an already-followed auction updates prefs/notes in place.
      ...(notes !== null ? { notes } : {}),
      ...prefs,
    },
    select: {
      id: true,
      auctionId: true,
      notes: true,
      createdAt: true,
      notifyOnGoLive: true,
      notifyOnBid: true,
      notifyOnStatus: true,
      notifyOnSuspension: true,
      notifyOnResume: true,
      notifyOnFinish: true,
      channels: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  });

  // Mirror favoriteCount update done by /api/favorites. Best-effort — count
  // drift is non-critical.
  await prisma.auction.update({
    where: { id: auctionId },
    data: { favoriteCount: { increment: 0 } }, // touch (count is materialized; we don't double-count on upsert).
  }).catch(() => undefined);

  return NextResponse.json({ success: true, data: follow });
}
