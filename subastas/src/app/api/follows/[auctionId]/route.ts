/**
 * DELETE /api/follows/[auctionId] — unfollow an auction. Idempotent; returns
 * { success: true, removed: 0 | 1 } so the UI can show "wasn't following".
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { auctionId } = await params;

  const result = await prisma.favorite.deleteMany({
    where: { userId: session.userId, auctionId },
  });

  // Best-effort decrement favoriteCount (won't go below 0).
  if (result.count > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Auction" SET "favoriteCount" = GREATEST("favoriteCount" - 1, 0) WHERE id = $1`,
      auctionId,
    ).catch(() => undefined);
  }

  return NextResponse.json({ success: true, removed: result.count });
}
