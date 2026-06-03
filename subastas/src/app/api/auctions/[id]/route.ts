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
import { boeLinkFor } from '@/lib/boe-link';
import { publicPathForDocId } from '@/lib/auction-docs/storage';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'id_required' }, { status: 400 });
  }

  // Include the AuctionDocument relation (document-archive wave, 2026-06-03).
  // `include` instead of `select` so we keep the existing "every scalar" shape
  // the detail page consumes (avoids enumerating ~60 columns + re-breaking on
  // every additive migration). The BigInt-coercion below already guards
  // `loteNumber` + `currentBidAmount`; AuctionDocument has no BigInt cols.
  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      documents: {
        select: {
          id: true,
          docType: true,
          title: true,
          officialUrl: true,
          kind: true,
          storedPath: true,
        },
        // Snapshots last so the visible BOE downloads (nota simple, edicto…)
        // surface first on the detail page. createdAt asc within each kind
        // preserves scrape order.
        orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
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

  // Derive the per-auction BOE URL at projection time so the detail page
  // never falls back to the BOE homepage when `boeLink` is NULL (only 630
  // of 1,699 active rows carry a stored value — see lib/boe-link.ts).
  //
  // BigInt coercion (P0 fix — 2026-06-02): the two BigInt columns on
  // `Auction` (`loteNumber`, `currentBidAmount`) cannot be serialized by
  // `JSON.stringify` and the bare `findUnique` above pulls every column,
  // so `NextResponse.json` would throw `TypeError: Do not know how to
  // serialize a BigInt` → 500. Mirror the cents→euros / Number coercion
  // the list APIs (`/api/auctions`, `/api/auctions/recent`) already do
  // for the same two columns so the detail payload matches the card
  // payload. Null-safe: null/undefined stay null. Non-finite or
  // non-positive bid amounts collapse to null to match the card layer.
  const loteNumberSafe =
    auction.loteNumber == null ? null : Number(auction.loteNumber);
  const currentBidAmountSafe = (() => {
    const raw = auction.currentBidAmount;
    if (raw == null) return null;
    const cents = typeof raw === 'bigint' ? Number(raw) : Number(raw);
    if (!Number.isFinite(cents) || cents <= 0) return null;
    return cents / 100; // cents → euros (matches /api/auctions card projection)
  })();
  // Project documents: expose a download URL (`/api/auction-doc/<id>`) for
  // rows that have a cached file on disk; otherwise the caller falls back to
  // `officialUrl` (the BOE link). The raw `storedPath` is NOT sent to the
  // client — it's an internal storage detail.
  const { documents: rawDocuments, ...auctionScalars } = auction;
  const documents = rawDocuments.map((d) => ({
    id: d.id,
    docType: d.docType,
    title: d.title,
    kind: d.kind,
    officialUrl: d.officialUrl,
    // null when nothing has been cached locally yet — Pixel falls back to
    // officialUrl in that case (same as the image route's fallback contract).
    downloadUrl: d.storedPath ? publicPathForDocId(d.id) : null,
  }));

  const projectedAuction = {
    ...auctionScalars,
    boeLink: boeLinkFor(auction.boeId, auction.boeLink),
    loteNumber: Number.isFinite(loteNumberSafe as number) ? loteNumberSafe : null,
    currentBidAmount: currentBidAmountSafe,
    documents,
  };

  return NextResponse.json({
    success: true,
    data: {
      auction: projectedAuction,
      history: { statuses: statusHistory, bids: bidHistory },
      followCount: auction.favoriteCount,
      isFollowing,
    },
  });
}
