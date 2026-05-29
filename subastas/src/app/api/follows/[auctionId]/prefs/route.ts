/**
 * GET   /api/follows/[auctionId]/prefs — current user's per-auction notify-prefs.
 * PATCH /api/follows/[auctionId]/prefs — update prefs.
 *
 * Body for PATCH (all fields optional):
 *   {
 *     notifyOnGoLive?, notifyOnBid?, notifyOnStatus?,
 *     notifyOnSuspension?, notifyOnResume?, notifyOnFinish?: boolean,
 *     channels?: 'email,push,inapp' (CSV; values must be in {email,push,inapp}),
 *     quietHoursStart?: 0-23 | null,
 *     quietHoursEnd?:   0-23 | null
 *   }
 *
 * 404 if the user does not follow this auction (use POST /api/follows first).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

const ALLOWED_CHANNELS = new Set(['email', 'push', 'inapp']);

const PREF_FIELDS = [
  'notifyOnGoLive',
  'notifyOnBid',
  'notifyOnStatus',
  'notifyOnSuspension',
  'notifyOnResume',
  'notifyOnFinish',
] as const;

function pickPrefs(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of PREF_FIELDS) {
    if (typeof body[k] === 'boolean') data[k] = body[k];
  }
  if (typeof body.channels === 'string') {
    const parts = body.channels
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => ALLOWED_CHANNELS.has(s));
    if (parts.length) data.channels = Array.from(new Set(parts)).join(',');
  }
  if (body.quietHoursStart === null) {
    data.quietHoursStart = null;
  } else if (
    typeof body.quietHoursStart === 'number' &&
    body.quietHoursStart >= 0 &&
    body.quietHoursStart <= 23
  ) {
    data.quietHoursStart = body.quietHoursStart;
  }
  if (body.quietHoursEnd === null) {
    data.quietHoursEnd = null;
  } else if (
    typeof body.quietHoursEnd === 'number' &&
    body.quietHoursEnd >= 0 &&
    body.quietHoursEnd <= 23
  ) {
    data.quietHoursEnd = body.quietHoursEnd;
  }
  return data;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { auctionId } = await params;

  const follow = await prisma.favorite.findUnique({
    where: { userId_auctionId: { userId: session.userId, auctionId } },
    select: {
      auctionId: true,
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
  if (!follow) {
    return NextResponse.json({ success: false, error: 'not_following' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: follow });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { auctionId } = await params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data = pickPrefs(body);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, error: 'no_fields' }, { status: 400 });
  }

  // updateMany returns count so we can 404 cleanly if the user isn't following.
  const result = await prisma.favorite.updateMany({
    where: { userId: session.userId, auctionId },
    data,
  });
  if (result.count === 0) {
    return NextResponse.json({ success: false, error: 'not_following' }, { status: 404 });
  }

  const updated = await prisma.favorite.findUnique({
    where: { userId_auctionId: { userId: session.userId, auctionId } },
    select: {
      auctionId: true,
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
  return NextResponse.json({ success: true, data: updated });
}
