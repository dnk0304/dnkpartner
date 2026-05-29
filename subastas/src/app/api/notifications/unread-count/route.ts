/**
 * GET /api/notifications/unread-count — inbox badge count for current user.
 *
 * Response: { success: true, count: number }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const count = await prisma.notification.count({
    where: {
      userId: session.userId,
      channel: 'inapp',
      read: false,
    },
  });

  return NextResponse.json({ success: true, count });
}
