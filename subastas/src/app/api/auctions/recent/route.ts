/**
 * GET /api/auctions/recent — the home page "Últimas actualizaciones" feed.
 *
 * Combines the most recent rows from AuctionStatusHistory and
 * AuctionBidHistory (Wave 1 tables), joins to a thin Auction projection, and
 * returns a single chronologically-sorted feed. This is the heartbeat of the
 * observatory — it proves we're live-tracking, every time the home loads.
 *
 * Public (no auth). Read-only. Lightweight projection.
 *
 * Query params:
 *   limit       — max rows to return (default 25, hard-capped at 100).
 *   types       — comma-separated event types to include:
 *                   "status" (status changes) or "bid" (new bids). Default: both.
 *
 * Performance: each side fetches `limit` rows (so the merged set is at most 2*limit),
 *              relies on the (auctionId, changedAt|seenAt DESC) indexes from
 *              prisma/schema.prisma. No N+1 — single batch fetch for auctions.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type FeedItem = {
  id: string;
  kind: "status" | "bid";
  at: string;            // ISO
  auctionId: string;
  /** Frontend auction shape (minimal). */
  auction: {
    id: string;
    title: string;
    category: string;
    province: string | null;
    municipality: string | null;
    status: string;
    auctionType: string | null;
    currentBid: number | null;
    appraisalValue: number | null;
    endsAt: string | null;
    boeLink: string | null;
  };
  /** Type-specific payload. */
  payload:
    | { type: "status"; fromStatus: string | null; toStatus: string; reason: string | null }
    | { type: "bid"; bid: number; bidType: string };
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

function mapStatus(s: string | null | undefined): string {
  if (!s) return "celebrandose";
  return DB_TO_FRONTEND_STATUS[s] ?? "celebrandose";
}

function mapType(t: string | null | undefined): string | null {
  if (!t) return null;
  return DB_TO_FRONTEND_TYPE[t] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 25);
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 25));
    const typesParam = url.searchParams.get("types");
    const types = new Set(
      (typesParam ? typesParam.split(",") : ["status", "bid"]).map((t) => t.trim()).filter(Boolean),
    );

    const wantStatus = types.has("status");
    const wantBid = types.has("bid");

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

    // Batch-load distinct auction rows.
    const auctionIds = Array.from(
      new Set([...statusRows.map((r) => r.auctionId), ...bidRows.map((r) => r.auctionId)]),
    );

    if (auctionIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const auctions = await prisma.auction.findMany({
      where: { id: { in: auctionIds } },
      select: {
        id: true,
        title: true,
        category: true,
        province: true,
        municipality: true,
        status: true,
        auctionType: true,
        currentBid: true,
        appraisalValue: true,
        endsAt: true,
        boeLink: true,
      },
    });
    const auctionMap = new Map(auctions.map((a) => [a.id, a]));

    const items: FeedItem[] = [];

    for (const r of statusRows) {
      const a = auctionMap.get(r.auctionId);
      if (!a) continue;
      items.push({
        id: r.id,
        kind: "status",
        at: r.changedAt.toISOString(),
        auctionId: r.auctionId,
        auction: {
          id: a.id,
          title: a.title,
          category: a.category,
          province: a.province ?? null,
          municipality: a.municipality ?? null,
          status: mapStatus(a.status as unknown as string),
          auctionType: mapType(a.auctionType ?? null),
          currentBid: a.currentBid ?? null,
          appraisalValue: a.appraisalValue ?? null,
          endsAt: a.endsAt?.toISOString() ?? null,
          boeLink: a.boeLink ?? null,
        },
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
        auction: {
          id: a.id,
          title: a.title,
          category: a.category,
          province: a.province ?? null,
          municipality: a.municipality ?? null,
          status: mapStatus(a.status as unknown as string),
          auctionType: mapType(a.auctionType ?? null),
          currentBid: a.currentBid ?? null,
          appraisalValue: a.appraisalValue ?? null,
          endsAt: a.endsAt?.toISOString() ?? null,
          boeLink: a.boeLink ?? null,
        },
        payload: {
          type: "bid",
          bid: r.bid,
          bidType: r.bidType,
        },
      });
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
