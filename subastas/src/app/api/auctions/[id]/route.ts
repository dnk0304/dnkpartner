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
import { getAccessState } from '@/lib/access';
import { pickTeaserSnippet } from '@/lib/teaser-snippet';
import { mapStatus } from '@/lib/auction-status';
import { effectiveStatus } from '@/components/observatory/status';

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
  let viewerUserId: string | undefined;
  try {
    const session = await auth();
    viewerUserId = session?.user?.id;
    if (viewerUserId) {
      const f = await prisma.favorite.findUnique({
        where: { userId_auctionId: { userId: viewerUserId, auctionId: id } },
        select: { id: true },
      });
      isFollowing = !!f;
    }
  } catch {
    // Session lookup failure shouldn't break the public detail load.
  }

  // Freemium gate (2026-06-04): when the caller is not trial-active or
  // paid-active, the API projects out the fields that constitute "opening
  // the auction's full info" (Dennis boundary). Teaser fields (title, type,
  // province, municipality, status, headline figure, description snippet)
  // stay in the payload so SSR + the public teaser block can render them.
  // The detail page page.tsx ALSO already SSRs those teaser fields against
  // the DB directly — this projection is the API-layer belt-and-braces so
  // a non-qualifying client cannot scrape sensitive intel via the JSON API.
  const access = await getAccessState();
  const fullAccess = access.hasFullAccess;

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

  // Detail payload contract (Pixel doc-UI, 2026-06-03):
  //   `...auctionScalars` projects EVERY Auction scalar column verbatim. That
  //   means the new bien fields introduced by the document-archive wave
  //   (e8c83a1) — postalCode, idufir, registryInscription, legalTitle,
  //   bienLocalidad, bienProvincia, viviendaHabitual — flow through
  //   automatically, as do opensAt (start date), propertyType, and address.
  //   No per-field listing here — the `findUnique` (no `select`) is the
  //   contract: any additive scalar migration surfaces on detail without a
  //   code change. The two BigInt columns (loteNumber, currentBidAmount) are
  //   overridden below because JSON.stringify cannot serialize BigInt; every
  //   other scalar passes through untouched and null-safe.
  const projectedAuction = {
    ...auctionScalars,
    boeLink: boeLinkFor(auction.boeId, auction.boeLink),
    loteNumber: Number.isFinite(loteNumberSafe as number) ? loteNumberSafe : null,
    currentBidAmount: currentBidAmountSafe,
    documents,
  };

  // Freemium projection — strip gated fields when caller lacks full access.
  // Field set is EXACTLY the brief's GATED list:
  //   exact address + precise location, full financials beyond the headline,
  //   documents / edicto / BOE link detail, court/expediente, contact panel.
  // PUBLIC teaser fields stay: title, category, province, municipality,
  // status, auctionType, propertyType, publishedAt, opensAt, endsAt,
  // appraisalValue (the headline tasacion shown on the card),
  // description snippet.
  if (!fullAccess) {
    // PII-safe-by-construction teaser snippet — shared builder with
    // AuctionTeaser.tsx so the API payload and the SSR-rendered teaser can
    // never drift. The raw `propertyDescription` / `lotDescription` /
    // `boeAnnouncement` blobs are NEVER passed in: they are untrusted free
    // text that can embed PII (address, cadastral, IDUFIR, postal, registry,
    // court) inline for ANY source. The snippet is CONSTRUCTED from safe
    // structured fields only (type, municipality, province, status) — see
    // lib/teaser-snippet.ts header for the two leak incidents (BOE Key\tValue
    // dump 2026-06-04, SEGSOCIAL prose paragraph 2026-06-05) that drove
    // this design.
    const frontendStatus = effectiveStatus(
      mapStatus(auction.status),
      auction.endsAt as Date | string | null,
    );
    const teaserDescription = pickTeaserSnippet({
      tipoBien:
        projectedAuction.propertyType ??
        (projectedAuction.auctionType
          ? projectedAuction.auctionType.toLowerCase()
          : null) ??
        projectedAuction.category ??
        null,
      municipio: projectedAuction.municipality,
      provincia: projectedAuction.province,
      frontendStatus,
    });
    Object.assign(projectedAuction, {
      // Location detail — keep province/municipality (teaser), strip the
      // exact address + map coordinates.
      address: null,
      latitude: null,
      longitude: null,
      mapUrl: null,
      streetViewUrl: null,
      placeUrl: null,
      directionsUrl: null,
      // Documents / edicto / BOE detail link — full gating.
      edictUrl: null,
      pdfUrl: null,
      boeLink: null,
      documents: [],
      // Bien detail beyond municipality/province.
      postalCode: null,
      idufir: null,
      registryInscription: null,
      legalTitle: null,
      bienLocalidad: null,
      bienProvincia: null,
      // Court / expediente / contact-panel intel.
      courtName: null,
      courtReference: null,
      procedureNumber: null,
      registryId: null,
      registryInfo: null,
      contactInfo: null,
      auctionId: null,
      lotNumber: null,
      boeAnnouncement: null,
      cadastralRef: null,
      cadastralData: null,
      // Full financials — keep appraisalValue (the headline tasacion shown
      // on the card) and valorSubasta (already on the card too); strip the
      // gated breakdown (currentBid, minimum, deposit, increment, claim,
      // final bid).
      currentBid: null,
      minimumBid: null,
      depositAmount: null,
      bidIncrement: null,
      claimedAmount: null,
      finalBid: null,
      currentBidAmount: null,
      // Property description: replace with a clamped snippet (the teaser).
      propertyDescription: teaserDescription,
      lotDescription: null,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      auction: projectedAuction,
      history: fullAccess
        ? { statuses: statusHistory, bids: bidHistory }
        : { statuses: [], bids: [] },
      followCount: auction.favoriteCount,
      isFollowing,
      // Surface the gate state so the client can render the wall without a
      // second fetch. Never includes user PII.
      access: { hasFullAccess: fullAccess, state: access.state },
    },
  });
}
