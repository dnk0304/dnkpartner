/**
 * POST /api/notifications/mark-read — mark notifications as read.
 *
 * Body:
 *   { ids?: string[], all?: boolean }
 *
 * Behavior:
 *   - { all: true }       → mark every unread in-app notification for the user.
 *   - { ids: [...] }      → mark only the listed IDs (ignored if not owned by user).
 *   - {}                  → 400.
 *
 * Response: { success: true, updated: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({})) as { ids?: unknown; all?: unknown };
  const all = body.all === true;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];

  if (!all && ids.length === 0) {
    return NextResponse.json(
      { success: false, error: 'no_targets', detail: 'pass { all: true } or { ids: [...] }' },
      { status: 400 },
    );
  }

  const where: Record<string, unknown> = {
    userId: session.userId,
    channel: 'inapp',
    read: false,
  };
  if (!all) where.id = { in: ids };

  const result = await prisma.notification.updateMany({
    where,
    data: { read: true },
  });

  return NextResponse.json({ success: true, updated: result.count });
}
