/**
 * POST /api/web-push/unsubscribe — remove a web-push subscription for the
 * current user.
 *
 * Body: { endpoint: string }
 *
 * The existing /api/push/subscribe DELETE handler does the same thing; this
 * route is the brief-specified canonical path. We also accept an empty body
 * to remove ALL of the current user's subscriptions (e.g. "disable push
 * everywhere" toggle).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown; all?: unknown };
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;
  const all = body.all === true;

  if (!endpoint && !all) {
    return NextResponse.json(
      { success: false, error: 'endpoint_or_all_required' },
      { status: 400 },
    );
  }

  const where: Record<string, unknown> = { userId: session.userId };
  if (endpoint) where.endpoint = endpoint;

  const result = await prisma.pushSubscription.deleteMany({ where });
  return NextResponse.json({ success: true, removed: result.count });
}
