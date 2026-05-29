/**
 * GET /api/auctions/[id] — auction detail loader for Pixel Wave 2c/Wave 3
 * detail page.
 *
 * Public (no auth required) — the auction list at /api/auctions is already
 * public and this route returns the same shape per-row. Locked tiers / masking
 * remain a list-page concern; the detail page either shows the auction or 404.
 *
 * Response shape mirrors what /api/auctions returns per item, plus:
 *   - history: latest 50 AuctionStatusHistory + AuctionBidHistory rows.
 *   - isFollowing: true if the requesting session has a Favorite for this auction (else false).
 *   - followCount: number of followers (favoriteCount column).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'id_required' }, { status: 400 });
  }

  const auction = await prisma.auction.findUnique({ where: { id } });
  if (!auction) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }

  const [statusHistory, bidHistory] = await Promise.all([
    prisma.auctionStatusHistory.findMany({
      where: { auctionId: id },
      orderBy: { changedAt: 'desc' },
      take: 50,
      select: { id: true, fromStatus: true, toStatus: true, changedAt: true, reason: true, resumeAt: true, source: true },
    }),
    prisma.auctionBidHistory.findMany({
      where: { auctionId: id },
      orderBy: { seenAt: 'desc' },
      take: 50,
      select: { id: true, bid: true, bidType: true, seenAt: true, source: true },
    }),
  ]);

  let isFollowing = false;
  try {
    const session = await auth();
    if (session?.user?.id) {
      const f = await prisma.favorite.findUnique({
        where: { userId_auctionId: { userId: session.user.id, auctionId: id } },
        select: { id: true },
      });
      isFollowing = !!f;
    }
  } catch {
    // Session lookup failure shouldn't break the public detail load.
  }

  return NextResponse.json({
    success: true,
    data: {
      auction,
      history: { statuses: statusHistory, bids: bidHistory },
      followCount: auction.favoriteCount,
      isFollowing,
    },
  });
}
