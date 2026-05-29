/**
 * PATCH /api/notifications/[id] — mark a single notification (read/unread).
 * DELETE /api/notifications/[id] — soft-delete (read=true) a single notification.
 *
 * Only the owner can touch their own notifications.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const body = await req.json().catch(() => ({})) as { read?: unknown };
  const read = body.read !== false; // default true

  const result = await prisma.notification.updateMany({
    where: { id, userId: session.userId },
    data: { read },
  });

  if (result.count === 0) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const result = await prisma.notification.deleteMany({
    where: { id, userId: session.userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
