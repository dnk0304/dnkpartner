/**
 * GET /api/auctions/recent — the home page "Últimas actualizaciones" feed.
 *
 * Combines the most recent rows from AuctionStatusHistory and
 * AuctionBidHistory (Wave 1 tables), joins to a thin Auction projection, and
 * returns a single chronologically-sorted feed. This is the heartbeat of the
 * observatory — it proves we're live-tracking, every time the home loads.
 *
 * STARVATION FALLBACK (Forge 2026-05-31): if the history tables don't supply
 * enough events to fill the requested limit, blend in the most-recently-
 * updated REAL active/upcoming auctions so the feed always shows clickable,
 * fully-titled cards instead of an empty state or generic placeholders.
 * Fallback rows have kind="auction" and no payload — UI treats them as
 * "no recent change, but here's a fresh listing".
 *
 * Public (no auth). Read-only. Lightweight projection.
 *
 * Query params:
 *   limit       — max rows to return (default 25, hard-capped at 100).
 *   types       — comma-separated event types to include:
 *                   "status" (status changes), "bid" (new bids),
 *                   "auction" (starvation-fallback recent listings). Default: all three.
 *
 * Performance: each side fetches `limit` rows (so the merged set is at most 3*limit),
 *              relies on the (auctionId, changedAt|seenAt DESC) indexes from
 *              prisma/schema.prisma. No N+1 — single batch fetch for auctions.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type FeedAuctionProjection = {
  id: string;
  boeId: string;
  title: string;
  category: string;
  province: string | null;
  municipality: string | null;
  address: string | null;
  status: string;
  auctionType: string | null;
  propertyType: string | null;
  currentBid: number | null;
  appraisalValue: number | null;
  minimumBid: number | null;
  depositAmount: number | null;
  endsAt: string | null;
  endDateTime: string | null;
  lotNumber: string | null;
  imageUrl: string | null;
  boeLink: string | null;
  latitude: number | null;
  longitude: number | null;
};

type FeedItem = {
  id: string;
  kind: "status" | "bid" | "auction";
  at: string;            // ISO
  auctionId: string;
  auction: FeedAuctionProjection;
  /** Type-specific payload. `auction` kind has no payload (fallback row). */
  payload?:
    | { type: "status"; fromStatus: string | null; toStatus: string; reason: string | null }
    | { type: "bid"; bid: number; bidType: string }
    | { type: "auction"; reason: "recent_listing" };
};

// Same status mapping the list route uses — keep frontend in sync.
const DB_TO_FRONTEND_STATUS: Record<string, string> = {
  PROXIMA_APERTURA: "proxima-apertura",
  CELEBRANDOSE: "celebrandose",
  SUSPENDIDA: "suspendida",
  CANCELADA: "cancelada",
  CONCLUIDA_PORTAL: "concluida-portal",
  FINALIZADA_AUTORIDAD: "finalizada-autoridad",
  PRE_AUCTION: "proxima-apertura",
  ACTIVE: "celebrandose",
  FINISHED: "concluida-portal",
  SUSPENDED: "suspendida",
  CANCELLED: "cancelada",
};

const DB_TO_FRONTEND_TYPE: Record<string, string> = {
  JUDICIAL: "judicial",
  NOTARIAL: "notarial",
  AEAT: "aeat",
  TRIBUTARIA: "tributaria",
  ADMINISTRATIVA: "administrativa",
  BANCARIA: "bancaria",
};

/** Active or upcoming states — anything still "live" from a user POV. */
const ACTIVE_OR_UPCOMING_DB_STATUSES = [
  "CELEBRANDOSE",
  "ACTIVE",
  "PROXIMA_APERTURA",
  "PRE_AUCTION",
  "SUSPENDIDA",
  "SUSPENDED",
] as const;

function mapStatus(s: string | null | undefined): string {
  if (!s) return "celebrandose";
  return DB_TO_FRONTEND_STATUS[s] ?? "celebrandose";
}

function mapType(t: string | null | undefined): string | null {
  if (!t) return null;
  return DB_TO_FRONTEND_TYPE[t] ?? null;
}

/** Convert a Prisma auction row → the flat projection the feed serves. */
function projectAuction(a: {
  id: string;
  boeId: string;
  title: string;
  category: string;
  province: string | null;
  municipality: string | null;
  address: string | null;
  status: unknown;
  auctionType: string | null;
  propertyType: string | null;
  currentBid: number | null;
  appraisalValue: number | null;
  minimumBid: number | null;
  depositAmount: number | null;
  endsAt: Date | null;
  endDateTime: Date | null;
  lotNumber: string | null;
  imageUrl: string | null;
  boeLink: string | null;
  latitude: number | null;
  longitude: number | null;
}): FeedAuctionProjection {
  return {
    id: a.id,
    boeId: a.boeId,
    title: a.title,
    category: a.category,
    province: a.province ?? null,
    municipality: a.municipality ?? null,
    address: a.address ?? null,
    status: mapStatus(a.status as string | null | undefined),
    auctionType: mapType(a.auctionType ?? null),
    propertyType: a.propertyType ?? null,
    currentBid: a.currentBid ?? null,
    appraisalValue: a.appraisalValue ?? null,
    minimumBid: a.minimumBid ?? null,
    depositAmount: a.depositAmount ?? null,
    endsAt: a.endsAt?.toISOString() ?? null,
    endDateTime: a.endDateTime?.toISOString() ?? null,
    lotNumber: a.lotNumber ?? null,
    imageUrl: a.imageUrl ?? null,
    boeLink: a.boeLink ?? null,
    latitude: a.latitude ?? null,
    longitude: a.longitude ?? null,
  };
}

/** Card-projection field set kept in one place — used by every select below. */
const AUCTION_CARD_SELECT = {
  id: true,
  boeId: true,
  title: true,
  category: true,
  province: true,
  municipality: true,
  address: true,
  status: true,
  auctionType: true,
  propertyType: true,
  currentBid: true,
  appraisalValue: true,
  minimumBid: true,
  depositAmount: true,
  endsAt: true,
  endDateTime: true,
  lotNumber: true,
  imageUrl: true,
  boeLink: true,
  latitude: true,
  longitude: true,
  updatedAt: true,
  transitionedAt: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 25);
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 25));
    const typesParam = url.searchParams.get("types");
    const types = new Set(
      (typesParam ? typesParam.split(",") : ["status", "bid", "auction"])
        .map((t) => t.trim())
        .filter(Boolean),
    );

    const wantStatus = types.has("status");
    const wantBid = types.has("bid");
    const wantAuctionFallback = types.has("auction");

    const [statusRows, bidRows] = await Promise.all([
      wantStatus
        ? prisma.auctionStatusHistory.findMany({
            orderBy: { changedAt: "desc" },
            take: limit,
            select: {
              id: true,
              auctionId: true,
              fromStatus: true,
              toStatus: true,
              changedAt: true,
              reason: true,
            },
          })
        : Promise.resolve([]),
      wantBid
        ? prisma.auctionBidHistory.findMany({
            orderBy: { seenAt: "desc" },
            take: limit,
            select: {
              id: true,
              auctionId: true,
              bid: true,
              bidType: true,
              seenAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // Batch-load distinct auction rows for event-driven items.
    const eventAuctionIds = Array.from(
      new Set([...statusRows.map((r) => r.auctionId), ...bidRows.map((r) => r.auctionId)]),
    );

    const eventAuctions = eventAuctionIds.length
      ? await prisma.auction.findMany({
          where: { id: { in: eventAuctionIds } },
          select: AUCTION_CARD_SELECT,
        })
      : [];
    const auctionMap = new Map(eventAuctions.map((a) => [a.id, a]));

    const items: FeedItem[] = [];

    for (const r of statusRows) {
      const a = auctionMap.get(r.auctionId);
      if (!a) continue;
      items.push({
        id: r.id,
        kind: "status",
        at: r.changedAt.toISOString(),
        auctionId: r.auctionId,
        auction: projectAuction(a),
        payload: {
          type: "status",
          fromStatus: mapStatus(r.fromStatus as unknown as string | null),
          toStatus: mapStatus(r.toStatus as unknown as string),
          reason: r.reason ?? null,
        },
      });
    }

    for (const r of bidRows) {
      const a = auctionMap.get(r.auctionId);
      if (!a) continue;
      items.push({
        id: r.id,
        kind: "bid",
        at: r.seenAt.toISOString(),
        auctionId: r.auctionId,
        auction: projectAuction(a),
        payload: {
          type: "bid",
          bid: r.bid,
          bidType: r.bidType,
        },
      });
    }

    // ─── Starvation fallback ────────────────────────────────────────────────
    // When AuctionStatusHistory / AuctionBidHistory don't supply enough
    // events to fill the user-requested `limit`, blend in the most-recently-
    // -updated real active/upcoming auctions. This is what guarantees the
    // feed always shows real titled clickable rows instead of empty state.
    if (wantAuctionFallback && items.length < limit) {
      const need = limit - items.length;
      // Pull a generous superset so we can skip dupes already in items.
      const excludeIds = new Set(items.map((it) => it.auctionId));
      const fallbackRows = await prisma.auction.findMany({
        where: {
          status: { in: ACTIVE_OR_UPCOMING_DB_STATUSES as unknown as string[] } as never,
          // Province is non-nullable in the schema; guard against blank strings
          // so we don't surface rows the rest of the UI can't filter back to.
          province: { not: '' },
          id: { notIn: Array.from(excludeIds) },
        },
        orderBy: [{ transitionedAt: "desc" }, { updatedAt: "desc" }],
        take: need * 2,
        select: AUCTION_CARD_SELECT,
      });

      let added = 0;
      for (const a of fallbackRows) {
        if (added >= need) break;
        if (excludeIds.has(a.id)) continue;
        // Use transitionedAt if present (true "something changed" timestamp),
        // else updatedAt (Prisma row touch).
        const at = (a.transitionedAt ?? a.updatedAt)?.toISOString();
        if (!at) continue;
        items.push({
          id: `auction-${a.id}`,
          kind: "auction",
          at,
          auctionId: a.id,
          auction: projectAuction(a),
          payload: { type: "auction", reason: "recent_listing" },
        });
        excludeIds.add(a.id);
        added++;
      }
    }

    if (items.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Sort by `at` desc, truncate to limit.
    items.sort((a, b) => b.at.localeCompare(a.at));
    const trimmed = items.slice(0, limit);

    return NextResponse.json({ success: true, data: trimmed });
  } catch (error) {
    console.error("/api/auctions/recent error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load recent events" },
      { status: 500 },
    );
  }
}
