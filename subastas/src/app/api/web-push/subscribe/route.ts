/**
 * POST /api/web-push/subscribe — store a web-push subscription for the current
 * user. Mirrors the existing /api/push/subscribe route under the canonical
 * /web-push/ path the brief specifies.
 *
 * Body: { endpoint: string, keys: { p256dh: string, auth: string } }
 *
 * Idempotent on endpoint — if the endpoint already exists for the same user
 * the keys are refreshed; if it exists for a different user, ownership is
 * reassigned (browser endpoints are user-specific even when shared device).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = (await req.json().catch(() => ({}))) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const authKey = typeof body.keys?.auth === 'string' ? body.keys.auth : '';

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json(
      { success: false, error: 'invalid_subscription' },
      { status: 400 },
    );
  }

  const row = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.userId,
      endpoint,
      p256dh,
      auth: authKey,
    },
    update: {
      userId: session.userId,
      p256dh,
      auth: authKey,
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true, id: row.id });
}
