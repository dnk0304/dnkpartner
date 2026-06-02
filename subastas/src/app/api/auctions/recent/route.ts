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
 *   activeOnly  — "1"/"true" to drop event rows whose underlying auction is no
 *                 longer active/upcoming (e.g. bulk "concluida-portal" cleanup
 *                 status-events). Forces the fallback path to surface real
 *                 ACTIVE auctions. Used by the ForexCarousel. Default: false.
 *
 * Performance: each side fetches `limit` rows (so the merged set is at most 3*limit),
 *              relies on the (auctionId, changedAt|seenAt DESC) indexes from
 *              prisma/schema.prisma. No N+1 — single batch fetch for auctions.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boeLinkFor } from "@/lib/boe-link";

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
  claimedAmount: number | null;
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

// DB stores both new plural (per-category scrapers) and legacy singular for
// "otras tributarias" / "administrativas". Fold both into the canonical
// frontend identifier so the UI only sees one label per BOE family.
const DB_TO_FRONTEND_TYPE: Record<string, string> = {
  JUDICIAL: "judicial",
  NOTARIAL: "notarial",
  AEAT: "aeat",
  OTRAS_TRIBUTARIAS: "otras_tributarias",
  TRIBUTARIA: "otras_tributarias",         // legacy → fold
  ADMINISTRATIVAS: "administrativas",
  ADMINISTRATIVA: "administrativas",       // legacy → fold
  BANCARIA: "bancaria",
};

/**
 * Active or upcoming states — anything still genuinely "live" from a user POV.
 * SUSPENDIDA/SUSPENDED removed 2026-06-02 (Forge, issue #2): suspended auctions
 * are not surface-able in the "Últimas actualizaciones" feed. Clock-ended
 * filtering happens in the fallback `where` (endsAt null or future), so a
 * stale CELEBRANDOSE row whose clock has run out doesn't sneak through.
 */
const ACTIVE_OR_UPCOMING_DB_STATUSES = [
  "CELEBRANDOSE",
  "ACTIVE",
  "PROXIMA_APERTURA",
  "PRE_AUCTION",
] as const;

function mapStatus(s: string | null | undefined): string {
  if (!s) return "celebrandose";
  return DB_TO_FRONTEND_STATUS[s] ?? "celebrandose";
}

function mapType(t: string | null | undefined): string | null {
  if (!t) return null;
  return DB_TO_FRONTEND_TYPE[t] ?? null;
}

/** Title-case helper for synthesised titles (lower-cased municipality from BOE). */
function titleCaseEs(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Synthesise a human-readable title when the upstream `title` is NULL, empty,
 * or the legacy literal "Unknown" (see Ghost's nullable-title migration intent
 * and the frontend `displayTitle()` convention in
 * src/components/observatory/format.ts). Mirrors that fallback order so
 * server-rendered cards and API consumers never see a blank title.
 */
function synthTitle(
  title: string | null | undefined,
  municipality: string | null | undefined,
  province: string | null | undefined,
): string {
  const raw = (title ?? "").trim();
  if (raw && raw.toLowerCase() !== "unknown") return raw;
  const muni = municipality ? titleCaseEs(municipality) : "";
  const prov = province
    ? province.charAt(0).toUpperCase() + province.slice(1)
    : "";
  if (muni && prov) return `Subasta en ${muni}, ${prov}`;
  if (muni) return `Subasta en ${muni}`;
  if (prov) return `Subasta en ${prov}`;
  return "Subasta judicial";
}

/** Convert a Prisma auction row → the flat projection the feed serves. */
function projectAuction(a: {
  id: string;
  boeId: string;
  title: string | null;
  category: string;
  province: string | null;
  municipality: string | null;
  address: string | null;
  status: unknown;
  auctionType: string | null;
  propertyType: string | null;
  currentBid: number | null;
  appraisalValue: number | null;
  claimedAmount: number | null;
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
    title: synthTitle(a.title, a.municipality, a.province),
    category: a.category,
    province: a.province ?? null,
    municipality: a.municipality ?? null,
    address: a.address ?? null,
    status: mapStatus(a.status as string | null | undefined),
    auctionType: mapType(a.auctionType ?? null),
    propertyType: a.propertyType ?? null,
    currentBid: a.currentBid ?? null,
    appraisalValue: a.appraisalValue ?? null,
    claimedAmount: a.claimedAmount ?? null,
    minimumBid: a.minimumBid ?? null,
    depositAmount: a.depositAmount ?? null,
    endsAt: a.endsAt?.toISOString() ?? null,
    endDateTime: a.endDateTime?.toISOString() ?? null,
    lotNumber: a.lotNumber ?? null,
    imageUrl: a.imageUrl ?? null,
    boeLink: boeLinkFor(a.boeId, a.boeLink),
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
  claimedAmount: true,
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
    const activeOnlyParam = (url.searchParams.get("activeOnly") ?? "").toLowerCase();
    const activeOnly = activeOnlyParam === "1" || activeOnlyParam === "true";
    // Mapped (frontend-canonical) statuses that count as genuinely live for
    // the activeOnly filter. SUSPENDIDA removed 2026-06-02 (Forge, issue #2):
    // suspended auctions are not "active" from a user POV and must not appear
    // in the home-page "Últimas actualizaciones" strip. Concluida/cancelada
    // never belonged here. Clock-ended rows are guarded below.
    const ACTIVE_FRONTEND_STATUSES = new Set([
      "celebrandose",
      "proxima-apertura",
    ]);
    const nowIso = new Date().toISOString();

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

    // ─── activeOnly filter ──────────────────────────────────────────────────
    // When the caller (e.g. the ForexCarousel) only wants currently-active
    // auctions, drop event rows whose underlying auction has moved to a
    // terminal state. Without this, a flood of "concluida-portal" cleanup
    // status-events will fill the feed and starve out the active rows the UI
    // actually wants to render.
    // Clock-wins guard: an auction whose endsAt has passed is NOT active,
    // even if its stored status still says CELEBRANDOSE (sweep lag). Mirrors
    // the `effectiveStatus` rule in components/observatory/status.ts.
    let workingItems = items;
    if (activeOnly) {
      workingItems = items.filter((it) => {
        if (!ACTIVE_FRONTEND_STATUSES.has(it.auction.status)) return false;
        if (it.auction.endsAt && it.auction.endsAt <= nowIso) return false;
        return true;
      });
    }

    // ─── Starvation fallback ────────────────────────────────────────────────
    // When AuctionStatusHistory / AuctionBidHistory don't supply enough
    // events to fill the user-requested `limit`, blend in the most-recently-
    // -updated real active/upcoming auctions. This is what guarantees the
    // feed always shows real titled clickable rows instead of empty state.
    if (wantAuctionFallback && workingItems.length < limit) {
      const need = limit - workingItems.length;
      // Pull a generous superset so we can skip dupes already in items.
      const excludeIds = new Set(workingItems.map((it) => it.auctionId));
      const fallbackRows = await prisma.auction.findMany({
        where: {
          status: { in: ACTIVE_OR_UPCOMING_DB_STATUSES as unknown as string[] } as never,
          // Province is non-nullable in the schema; guard against blank strings
          // so we don't surface rows the rest of the UI can't filter back to.
          province: { not: '' },
          id: { notIn: Array.from(excludeIds) },
          // Clock-wins guard: drop rows whose endsAt is in the past — sweep
          // lag would otherwise let stale CELEBRANDOSE rows surface here.
          // Null endsAt is allowed (no clock set yet, e.g. PROXIMA_APERTURA).
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
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
        workingItems.push({
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

    if (workingItems.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Sort by `at` desc, truncate to limit.
    workingItems.sort((a, b) => b.at.localeCompare(a.at));
    const trimmed = workingItems.slice(0, limit);

    return NextResponse.json({ success: true, data: trimmed });
  } catch (error) {
    console.error("/api/auctions/recent error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load recent events" },
      { status: 500 },
    );
  }
}
