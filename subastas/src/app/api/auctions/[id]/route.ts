/**
 * GET /api/auctions/[id] — auction detail loader.
 *
 * Wave-B1 gate (Dennis 2026-06-07, re-flip):
 *   PUBLIC (logged-out)            → TEASER ONLY (`meta.gated:true,requires:'auth'`).
 *   REGISTER (any logged-in user)  → FULL payload (unchanged).
 *
 * The PUBLIC teaser is the SSR-safe set of fields Google + non-registered
 * viewers see: id/boeId, address-led title, type, source, province,
 * municipality, status, headline figure (appraisal OR valor subasta),
 * published/opens/ends timestamps, plus a sanitised description snippet
 * constructed from structured fields via `pickTeaserSnippet` (never raw
 * propertyDescription / lotDescription).
 *
 * The PII rule (locked from wave66 PII-grep audit) — the public payload MUST
 * NOT contain: street address (raw), latitude, longitude, cadastralRef,
 * postalCode, idufir, registryInfo, edictUrl, pdfUrl, documents[], courtName,
 * procedureNumber, raw propertyDescription / lotDescription / boeAnnouncement.
 * The address-led title is the ONE exception — Dennis-locked: the address may
 * appear as the title surface (SEO), and the address-as-title helper
 * (`auctionDisplayTitle`) does the address cleansing.
 *
 * Response shape:
 *   - public teaser:  { success:true, data:{ auction, history:{statuses:[],bids:[]},
 *                                            followCount, isFollowing:false },
 *                       meta:{ gated:true, requires:'auth' } }
 *   - full payload :  { success:true, data:{ auction, history, followCount, isFollowing } }
 *
 * History (status + bid) is gated too — logged-out viewers get empty arrays.
 * Follow state is always false for logged-out viewers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { boeLinkFor } from '@/lib/boe-link';
import { publicPathForDocId } from '@/lib/auction-docs/storage';
import { buildSourceLinks } from '@/lib/source-links';
import { buildFinancials } from '@/lib/financials';
import { pickTeaserSnippet } from '@/lib/teaser-snippet';
import { auctionDisplayTitle } from '@/lib/seo/display-title';
import { sanitizeExtractedText } from '@/lib/sanitize-extracted-text';
import { SNAPSHOT_ID_DOC_SENTINEL } from '@/lib/auction-docs/storage';

const DB_TO_FRONTEND_STATUS: Record<string, string> = {
  PROXIMA_APERTURA: 'proxima-apertura',
  CELEBRANDOSE: 'celebrandose',
  SUSPENDIDA: 'suspendida',
  CANCELADA: 'cancelada',
  CONCLUIDA_PORTAL: 'concluida-portal',
  FINALIZADA_AUTORIDAD: 'finalizada-autoridad',
  PRE_AUCTION: 'proxima-apertura',
  ACTIVE: 'celebrandose',
  FINISHED: 'concluida-portal',
  SUSPENDED: 'suspendida',
  CANCELLED: 'cancelada',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'id_required' }, { status: 400 });
  }

  // Include AuctionDocument so the full payload can project docs[]. The
  // teaser path never reads `documents` — it just discards them.
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
  if (!auction) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }

  // Resolve session up-front — drives the gate. Session lookup failure is
  // treated as logged-out (fail-closed: we never accidentally hand out the
  // full payload on a session-store blip).
  let viewerUserId: string | undefined;
  try {
    const session = await auth();
    viewerUserId = session?.user?.id;
  } catch {
    viewerUserId = undefined;
  }
  const isLoggedIn = !!viewerUserId;

  // BigInt coercion — needed even in the teaser branch because the teaser
  // headline figure pulls valorSubasta / appraisalValue which can be bigint
  // on freshly-migrated columns.
  const loteNumberSafe =
    auction.loteNumber == null ? null : Number(auction.loteNumber);
  const currentBidAmountSafe = (() => {
    const raw = auction.currentBidAmount;
    if (raw == null) return null;
    const cents = typeof raw === 'bigint' ? Number(raw) : Number(raw);
    if (!Number.isFinite(cents) || cents <= 0) return null;
    return cents / 100;
  })();

  // ----------------------------------------------------------------------
  // LOGGED-OUT → TEASER ONLY (no history, no follow, no PII).
  // ----------------------------------------------------------------------
  if (!isLoggedIn) {
    const frontendStatus = DB_TO_FRONTEND_STATUS[auction.status] ?? 'celebrandose';
    const tipoBien =
      auction.propertyType ??
      (auction.auctionType ? auction.auctionType.toLowerCase() : null) ??
      auction.category ??
      null;
    const snippet = pickTeaserSnippet({
      tipoBien,
      municipio: auction.municipality,
      provincia: auction.province,
      frontendStatus,
    });
    // Address-led title — Dennis-locked: the address may surface AS the
    // title for SEO. The helper sanitises the address (no postal/IDUFIR
    // inline tokens) and falls back to muni/province for vehicle/land rows.
    const teaserTitle = auctionDisplayTitle({
      address: auction.address,
      propertyType: auction.propertyType,
      auctionType: auction.auctionType,
      category: auction.category,
      municipality: auction.municipality,
      province: auction.province,
      title: auction.title,
    });
    const appraisal =
      auction.appraisalValue != null && Number.isFinite(Number(auction.appraisalValue))
        ? Number(auction.appraisalValue)
        : null;
    const valorSub =
      auction.valorSubasta != null && Number.isFinite(Number(auction.valorSubasta))
        ? Number(auction.valorSubasta)
        : null;

    const teaserAuction = {
      id: auction.id,
      boeId: auction.boeId,
      // Public title — sanitised display title; raw scraped title NEVER
      // surfaces here when it would leak Key\tValue garbage.
      title: teaserTitle,
      category: auction.category,
      province: auction.province ?? null,
      municipality: auction.municipality ?? null,
      status: auction.status,
      auctionType: auction.auctionType ?? null,
      propertyType: auction.propertyType ?? null,
      source: auction.source ?? null,
      appraisalValue: appraisal,
      valorSubasta: valorSub,
      publishedAt: auction.publishedAt,
      opensAt: auction.opensAt ?? null,
      endsAt: auction.endsAt ?? null,
      // Public, safe-by-construction description snippet (NEVER raw
      // propertyDescription/lotDescription — see lib/teaser-snippet.ts).
      teaserSnippet: snippet,
      // Wave E2 (2026-06-07) — vehicle make/model/year are PUBLIC (Dennis-
      // locked: same posture as address-as-title; a vehicle's make/model
      // is part of the auction's public identity, not PII). Drives the
      // teaser headline + the "Datos del vehículo" block on the detail
      // page. Honest-NULL on non-VEHICLE rows.
      vehicleMake: auction.vehicleMake ?? null,
      vehicleModel: auction.vehicleModel ?? null,
      vehicleYear: auction.vehicleYear ?? null,
      // All PII fields explicitly omitted. The client must NOT branch on
      // their presence — `meta.gated` is the contract.
    };

    return NextResponse.json({
      success: true,
      data: {
        auction: teaserAuction,
        history: { statuses: [], bids: [] },
        followCount: auction.favoriteCount,
        isFollowing: false,
      },
      meta: { gated: true, requires: 'auth' },
    });
  }

  // ----------------------------------------------------------------------
  // LOGGED-IN → FULL payload (history, documents, financials, source links,
  // every column the row carries).
  // ----------------------------------------------------------------------
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

  // viewerUserId is guaranteed defined here — the `!isLoggedIn` branch above
  // already returned. Narrow for the type checker.
  const userId = viewerUserId as string;
  let isFollowing = false;
  try {
    const f = await prisma.favorite.findUnique({
      where: { userId_auctionId: { userId, auctionId: id } },
      select: { id: true },
    });
    isFollowing = !!f;
  } catch {
    // Favourite lookup failure shouldn't break detail load.
  }

  const { documents: rawDocuments, ...auctionScalars } = auction;
  // Drop the per-auction BOE snapshot row from the rendered Documentos
  // oficiales list — Dennis 2026-06-08: the "Captura BOE (ver=3)" label
  // adds no UX value alongside the canonical "Fuente BOE" link. We still
  // keep the snapshot on disk (for support spot-checks) and we still
  // surface every other download (Nota simple, Edicto, Anuncio BOE, etc.).
  // Snapshots are tagged by Ghost with kind="snapshot" + the
  // SNAPSHOT_ID_DOC_SENTINEL idDoc; matching on either fully covers the
  // canonical write.
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

  const sourceLinks = buildSourceLinks({
    boeId: auction.boeId,
    boeLink: auction.boeLink,
    loteNumber: loteNumberSafe,
    edictUrl: auction.edictUrl,
    pdfUrl: auction.pdfUrl,
    source: auction.source,
    originalSource: auction.originalSource,
  });
  const financials = buildFinancials({
    valorSubasta: auction.valorSubasta,
    appraisalValue: auction.appraisalValue,
    depositAmount: auction.depositAmount,
    claimedAmount: auction.claimedAmount,
    minimumBid: auction.minimumBid,
    bidIncrement: auction.bidIncrement,
    finalBid: auction.finalBid,
  });

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
  // "Iniciar sesión" chrome) can never reach the rendered UI even if a
  // future scraper regression slips junk into a row. See:
  // src/lib/sanitize-extracted-text.ts. Honest-NULL on rejection — the
  // renderer treats null as "section omitted".
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
    // Overwrite the raw scalars with the sanitized values so any rendering
    // path that reads `raw.chargesDetail` / `raw.lotDescription` / etc.
    // also benefits from the rejection (not just consumers of `cadastral`).
    chargesDetail: safeChargesDetail,
    lotDescription: safeLotDescription,
    propertyDescription: safePropertyDescription,
    registryInfo: safeRegistryInfo,
    boeLink: boeLinkFor(auction.boeId, auction.boeLink),
    loteNumber: Number.isFinite(loteNumberSafe as number) ? loteNumberSafe : null,
    currentBidAmount: currentBidAmountSafe,
    documents,
    sourceLinks,
    financials,
    endDate: auction.endsAt ? auction.endsAt.toISOString() : null,
    bidStatus,
    lastUpdated: auction.updatedAt ? auction.updatedAt.toISOString() : null,
    seller,
    cadastral,
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
