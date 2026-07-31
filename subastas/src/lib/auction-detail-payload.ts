/**
 * src/lib/auction-detail-payload.ts — the SINGLE source of truth for the full
 * auction-detail payload.
 *
 * Wave-B2 ungate (Dennis 2026-07-31): the auction detail page is now FULLY
 * PUBLIC — address, pricing/valuation, description, legal/cadastral data,
 * documents, timeline and every column the row carries render for EVERYONE
 * (anonymous, trial, paid) in the SSR HTML. The paid product is the
 * alerts/notifications, NOT content gating. This builder is called from BOTH:
 *
 *   1. GET /api/auctions/[id]           — the client revalidation fetch.
 *   2. /subastas/subasta/[slug]/page.tsx — the SSR seed (passed as `initialData`
 *      to <AuctionDetailClient/> so the full content lands in the initial HTML
 *      stream and Googlebot sees it without executing JS).
 *
 * Keeping ONE builder for both paths is the anti-drift guarantee: there is no
 * "half-gated" state where the SSR HTML and the API payload disagree. The
 * previous logged-out TEASER projection is gone — the API returns the full
 * payload to every caller.
 *
 * `viewerUserId` only affects `isFollowing` (a per-user favourite flag). All
 * auction INFORMATION is identical for every viewer. History (status + bid
 * timeline) is public too.
 *
 * SERIALISATION NOTE: the returned object must round-trip through JSON on BOTH
 * paths — `NextResponse.json(...)` in the API and `JSON.parse(JSON.stringify(...))`
 * in the RSC → client-component `initialData` prop. Prisma `BigInt` columns
 * (loteNumber, currentBidAmount, soldPrice) are therefore coerced to `number`
 * here; a stray BigInt would throw "Do not know how to serialize a BigInt" and,
 * on the SSR path, crash the page render. (The old full-payload branch coerced
 * loteNumber + currentBidAmount but NOT soldPrice — a latent 500 on concluded
 * ADJUDICADA rows with a published winning bid. Fixed here.)
 */
import { prisma } from '@/lib/prisma';
import { publicPathForDocId } from '@/lib/auction-docs/storage';
import { buildFinancials } from '@/lib/financials';
import {
  buildRegionBenchmarkSignal,
  benchmarkKey,
  isBenchmarkCategory,
  PROVINCE_LEVEL_SENTINEL,
  type BenchmarkRow,
} from '@/lib/benchmark';
import { sanitizeExtractedText } from '@/lib/sanitize-extracted-text';
import { SNAPSHOT_ID_DOC_SENTINEL } from '@/lib/auction-docs/storage';

export interface AuctionDetailPayload {
  // Raw Prisma row (BigInt-coerced) + wave-B/C projection. Typed loosely — the
  // client (AuctionDetailClient) narrows the fields it reads. Kept `unknown`
  // rather than `any` so callers can't silently rely on an un-projected column.
  auction: Record<string, unknown>;
  history: {
    statuses: Array<{
      id: string;
      fromStatus: string | null;
      toStatus: string;
      changedAt: Date;
      reason: string | null;
      resumeAt: Date | null;
      source: string;
    }>;
    bids: Array<{
      id: string;
      bid: number;
      bidType: string;
      seenAt: Date;
      source: string;
    }>;
  };
  followCount: number;
  isFollowing: boolean;
}

/**
 * Build the full, public auction-detail payload. Returns `null` when the row
 * does not exist (the caller renders 404 / notFound()).
 */
export async function buildAuctionDetailPayload(
  id: string,
  opts: { viewerUserId?: string | null } = {},
): Promise<AuctionDetailPayload | null> {
  const viewerUserId = opts.viewerUserId ?? undefined;

  // Include AuctionDocument so the payload can project docs[].
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
        orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
  if (!auction) return null;

  // BigInt coercion — every BigInt column must become a plain number before
  // the payload is serialised (see file header). loteNumber / currentBidAmount
  // / soldPrice are the three BigInt columns on Auction.
  const loteNumberSafe =
    auction.loteNumber == null ? null : Number(auction.loteNumber);
  const currentBidAmountSafe = (() => {
    const raw = auction.currentBidAmount;
    if (raw == null) return null;
    const cents = typeof raw === 'bigint' ? Number(raw) : Number(raw);
    if (!Number.isFinite(cents) || cents <= 0) return null;
    return cents / 100;
  })();
  // soldPrice is stored in CENTS (BigInt). Coerce to a plain number so the
  // payload serialises. Left in cents (the client teaser divides by 100 where
  // it renders it; the detail client does not read it).
  const soldPriceSafe =
    auction.soldPrice == null ? null : Number(auction.soldPrice);

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
  if (viewerUserId) {
    try {
      const f = await prisma.favorite.findUnique({
        where: { userId_auctionId: { userId: viewerUserId, auctionId: id } },
        select: { id: true },
      });
      isFollowing = !!f;
    } catch {
      // Favourite lookup failure shouldn't break detail load.
    }
  }

  const { documents: rawDocuments, ...auctionScalars } = auction;
  // Drop the per-auction BOE snapshot row from the rendered Documentos
  // oficiales list — the "Captura BOE (ver=3)" label adds no UX value alongside
  // the canonical "Fuente BOE" link. Snapshots are tagged by Ghost with
  // kind="snapshot" + the SNAPSHOT_ID_DOC_SENTINEL idDoc.
  const documents = rawDocuments
    .filter((d) => {
      const k = (d.kind ?? '').toLowerCase();
      if (k === 'snapshot') return false;
      if ((d.docType ?? '').toUpperCase() === SNAPSHOT_ID_DOC_SENTINEL) return false;
      return true;
    })
    .map((d) => ({
      id: d.id,
      docType: d.docType,
      title: d.title,
      kind: d.kind,
      officialUrl: d.officialUrl,
      downloadUrl: d.storedPath ? publicPathForDocId(d.id) : null,
    }));

  // wave169 — the official-auction URL is NO LONGER projected to the client.
  // The former `sourceLinks[]` (detalleSubasta.php / portal deep-links) plus
  // `boeLink` / `originalSource` all carried the outbound "place a bid" URL
  // into the RSC/hydration payload, which defeated the participate-gate (any
  // logged-out viewer could read it from view-source). Those fields are dropped
  // / nulled below; the URL now lives ONLY server-side in GET /api/participar/[id].
  // The edicto / anuncio document PDFs stay public via `documents[]` +
  // edictUrl/pdfUrl in the Documentos section.
  const financials = buildFinancials({
    valorSubasta: auction.valorSubasta,
    appraisalValue: auction.appraisalValue,
    depositAmount: auction.depositAmount,
    claimedAmount: auction.claimedAmount,
    minimumBid: auction.minimumBid,
    bidIncrement: auction.bidIncrement,
    finalBid: auction.finalBid,
  });

  // Region €/m² benchmark (Phase 3) — the "is this cheap for the area?" signal.
  let regionBenchmark = null;
  if (auction.province && isBenchmarkCategory(auction.category)) {
    try {
      const muni = (auction.municipality ?? '').trim();
      const benchmarkRows = await prisma.regionBenchmark.findMany({
        where: {
          province: auction.province,
          category: auction.category,
          municipality: { in: muni ? [PROVINCE_LEVEL_SENTINEL, muni] : [PROVINCE_LEVEL_SENTINEL] },
        },
        select: {
          province: true,
          category: true,
          municipality: true,
          sampleSize: true,
          medianEurM2: true,
          p25EurM2: true,
          p75EurM2: true,
        },
      });
      const lookup = new Map<string, BenchmarkRow>();
      for (const r of benchmarkRows) {
        lookup.set(benchmarkKey(r.province, r.category, r.municipality), r);
      }
      regionBenchmark = buildRegionBenchmarkSignal(
        {
          province: auction.province,
          category: auction.category,
          municipality: auction.municipality,
          valorSubasta: auction.valorSubasta,
          appraisalValue: auction.appraisalValue,
          surfaceM2: auction.surfaceM2,
        },
        lookup,
      );
    } catch {
      regionBenchmark = null;
    }
  }

  const bidCount = bidHistory.length;
  const bidStatus: string | null = (() => {
    const ps = (auction.pujaStatus ?? '').toUpperCase();
    if (ps === 'SIN_PUJA') return 'Sin pujas';
    if (ps === 'CON_PUJA') return bidCount > 0 ? `${bidCount} ${bidCount === 1 ? 'puja' : 'pujas'}` : 'Con pujas';
    return null;
  })();

  const sellerName = (auction.courtName ?? '').trim() || null;
  const sellerContact = (auction.contactInfo ?? '').trim() || null;
  const seller = sellerName || sellerContact
    ? { name: sellerName, contact: sellerContact }
    : null;

  // Defence-in-depth: run every scraper-extracted free-text field through
  // sanitizeExtractedText() so a page-dump leak (BOE nav HTML / JS clock /
  // "Iniciar sesión" chrome) can never reach the rendered UI even if a future
  // scraper regression slips junk into a row. Honest-NULL on rejection.
  const safeChargesDetail = sanitizeExtractedText(auction.chargesDetail);
  const safeLotDescription = sanitizeExtractedText(auction.lotDescription);
  const safePropertyDescription = sanitizeExtractedText(auction.propertyDescription);
  const safeRegistryInfo = sanitizeExtractedText(auction.registryInfo);

  const cadastral = {
    ref: auction.cadastralRef ?? null,
    charges: auction.charges ?? null,
    chargesDetail: safeChargesDetail,
    possession: auction.possessionStatus ?? null,
    classification: null,
    use: null,
    area: null,
    ownershipPct: null,
  };

  const projectedAuction = {
    ...auctionScalars,
    // Overwrite the raw scalars with the sanitized values so any rendering path
    // that reads `raw.chargesDetail` / `raw.lotDescription` / etc. also benefits
    // from the rejection (not just consumers of `cadastral`).
    chargesDetail: safeChargesDetail,
    lotDescription: safeLotDescription,
    propertyDescription: safePropertyDescription,
    registryInfo: safeRegistryInfo,
    // wave169 — official-auction URL fields are hard-nulled so they never reach
    // the client. `...auctionScalars` spreads the raw `boeLink` / `originalSource`
    // columns, so we MUST override both here (a bare spread would re-leak them).
    // Reach the official portal via the gated GET /api/participar/[id] instead.
    boeLink: null,
    originalSource: null,
    loteNumber: Number.isFinite(loteNumberSafe as number) ? loteNumberSafe : null,
    currentBidAmount: currentBidAmountSafe,
    // BigInt → number (see header). Prevents a serialisation crash on concluded
    // rows with a published winning bid.
    soldPrice: soldPriceSafe,
    documents,
    financials,
    regionBenchmark,
    endDate: auction.endsAt ? auction.endsAt.toISOString() : null,
    bidStatus,
    lastUpdated: auction.updatedAt ? auction.updatedAt.toISOString() : null,
    seller,
    cadastral,
  };

  return {
    auction: projectedAuction as Record<string, unknown>,
    history: { statuses: statusHistory, bids: bidHistory },
    followCount: auction.favoriteCount,
    isFollowing,
  };
}
