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
 *   category    — exact accented Spanish label as stored in DB (e.g.
 *                 "Viviendas"). Narrows BOTH the event-driven items AND the
 *                 starvation-fallback rows. Unknown/blank value → ignored
 *                 (graceful no-op). Used by the home quick-filter chips.
 *   province    — exact province string as stored in DB. Same semantics as
 *                 `category` (filters event side + fallback `where`).
 *                 Unknown/blank → ignored.
 *   when        — bucket alias: "active"/"activas" (active right now),
 *                 "proximas"/"upcoming" (upcoming), "todas"/"all" (any
 *                 status — disables both the activeOnly-style status filter
 *                 AND the clock-ended guard, so finished/cancelled auctions
 *                 can appear). Unknown value → ignored (treated as default,
 *                 same as current behavior — active-or-upcoming).
 *
 * Properties-first ordering (Forge 2026-06-03):
 *   When `category` is NOT provided, the merged feed is sorted by
 *   (categoryRank ASC, at DESC) — Viviendas surfaces first, with recency
 *   preserved within each tier. When `category` IS provided, ordering
 *   reverts to pure `at DESC` (every row is the same rank anyway). Rank
 *   table lives in `@/lib/category-rank` (shared with the future
 *   /api/auctions default sort — see sa/promote-properties-sort).
 *
 * Regional variety + soft content-criteria (Forge 2026-06-03, this commit):
 *   The starvation-fallback used to ORDER BY [transitionedAt DESC, updatedAt
 *   DESC]. In the current data, ALL 444 active rows have transitionedAt=NULL
 *   (bulk scraper writes, no tracked transitions), so the recency tiebreak
 *   let Madrid/Alicante/Barcelona dominate — proven 14/30 Madrid on a 30-card
 *   carousel, with small provinces (e.g. Las Palmas, 1 active row) starved
 *   out entirely. The fix:
 *     1. Fetch a generous candidate pool from the fallback `where`.
 *     2. Compute a `qualityScore` per candidate (SOFT — never a gate):
 *          +2 real image; +1 real title; +1 any real price (appraisal /
 *          claimed / minimum > 0); +1 location detail (municipality /
 *          address / lat-lng); +1 propertyType; +1 auctionType.
 *        Image-less / sparse rows still appear — they just sink. Critical
 *        because only ~40/444 active rows have a non-empty imageUrl today;
 *        a HARD image gate would empty most province filters.
 *     3. When NO province is pinned, bucket candidates by province and do
 *        a distinct-province ROUND-ROBIN: best-scored card from each
 *        province in rotation until `limit` filled. The first N cards of
 *        the carousel span N distinct provinces.
 *     4. When a province IS pinned, skip round-robin (single bucket) and
 *        just order by quality DESC then recency DESC.
 *     5. Round-robin runs WITHIN the category-rank tier — Viviendas-first
 *        still leads. Concretely we group candidates by categoryRank, then
 *        round-robin provinces within each rank tier, concatenating tiers
 *        in rank order. Result: Viviendas-with-variety, then the next
 *        category tier, etc.
 *   Province match is now case-insensitive (Prisma QueryMode.insensitive in
 *   the fallback where; lowercase compare on the event side) so the
 *   "Las Palmas" vs "las palmas" DB drift doesn't strand the chip.
 *
 * Performance: each side fetches `limit` rows (so the merged set is at most 3*limit),
 *              relies on the (auctionId, changedAt|seenAt DESC) indexes from
 *              prisma/schema.prisma. No N+1 — single batch fetch for auctions.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boeLinkFor } from "@/lib/boe-link";
import { derivePricePerM2 } from "@/lib/auction-derive";
import { categoryRankOf } from "@/lib/category-rank";
import {
  ACTIVE_OR_UPCOMING_DB_STATUSES,
  LIVE_NOW_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  DB_TO_FRONTEND_STATUS,
  activeClockGuardPrisma,
} from "@/lib/auction-status";

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
  // Valor subasta — DISTINCT from appraisalValue (Tasación) and claimedAmount
  // (Cantidad reclamada). Ghost split (2026-06-04, commit `443a864`) carries
  // the BOE "Valor subasta" figure separately so the card can show three
  // distinct numbers. Honest-NULL — omit the line when absent.
  valorSubasta: number | null;
  claimedAmount: number | null;
  minimumBid: number | null;
  depositAmount: number | null;
  endsAt: string | null;
  // 2026-06-03 (Pixel cards): start date for PROXIMA_APERTURA cards.
  // Nullable; null = not yet scheduled / not scraped.
  opensAt: string | null;
  // Wave52 (Pixel 2026-06-04): suspended-scraper "fecha prevista de
  // reanudación". Drives the SUSPENDIDA card date line.
  resumeAt: string | null;
  endDateTime: string | null;
  lotNumber: string | null;
  imageUrl: string | null;
  boeLink: string | null;
  latitude: number | null;
  longitude: number | null;
  // #16 / #17 — null-safe pujas + occupancy on the recent feed cards.
  pujaStatus: 'CON_PUJA' | 'SIN_PUJA' | null;
  currentBidAmount: number | null; // EUROS (BIGINT cents → number)
  occupancy: 'OCUPADO' | 'NO_OCUPADO' | 'NO_CONSTA' | null;
  // Document-archive wave (2026-06-03). Lightweight flag derived from a
  // Prisma `_count` on the AuctionDocument relation — no full doc array on
  // the list/feed payload so the card query stays lean.
  hasDocuments: boolean;
  // Wave E2 (2026-06-07) — vehicle make/model/year. Drives the
  // "Turismo - SEAT León en Murcia" card title upgrade. Honest-NULL on
  // non-VEHICLE rows and on VEHICLE rows pre-backfill.
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  // surfaceM2 + derived €/m² (2026-06-19, property-card-redesign). m² from
  // Ghost's prose extraction; €/m² derived at read time. Honest-NULL.
  surfaceM2: number | null;
  pricePerM2: number | null;
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

// Status mapping (DB → frontend canonical) now comes from the shared
// `@/lib/auction-status` so the carousel cards, list cards, and map markers
// all label the same DB value the same way. Imported above.

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
 * Active-or-upcoming for the carousel default bucket now comes from the
 * shared lib (imported above as ACTIVE_OR_UPCOMING_DB_STATUSES). Forge
 * 2026-06-03 (unified active wave): the 2026-06-02 local removal of
 * SUSPENDIDA from this set has been REVERTED — the shared lib re-includes
 * it via ACTIVE_DB_STATUSES. The Madrid-crowding symptom the removal was
 * trying to address is already handled by the round-robin/quality-score
 * variety mechanism below, which is the correct layer for that fix. The
 * clock guard (endsAt-based, null-safe) is still applied in the fallback
 * `where` so a stale CELEBRANDOSE row past its endsAt does NOT surface.
 */

function mapStatus(s: string | null | undefined): string {
  if (!s) return "celebrandose";
  // Shared fold from `@/lib/auction-status` (imported at top).
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
  // Valor subasta — DISTINCT from appraisalValue (Tasación) and claimedAmount
  // (Cantidad reclamada). Ghost split (2026-06-04, commit `443a864`) carries
  // the BOE "Valor subasta" figure separately so the card can show three
  // distinct numbers. Honest-NULL — omit the line when absent.
  valorSubasta: number | null;
  claimedAmount: number | null;
  minimumBid: number | null;
  depositAmount: number | null;
  endsAt: Date | null;
  opensAt: Date | null;
  resumeAt: Date | null;
  endDateTime: Date | null;
  lotNumber: string | null;
  imageUrl: string | null;
  boeLink: string | null;
  latitude: number | null;
  longitude: number | null;
  pujaStatus?: string | null;
  currentBidAmount?: bigint | number | string | null;
  occupancy?: string | null;
  // Wave E2 (2026-06-07) — vehicle fields, honest-NULL.
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  // surfaceM2 (2026-06-19) — Float? from Prisma → number | null.
  surfaceM2?: number | null;
  _count?: { documents: number } | null;
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
    valorSubasta: a.valorSubasta ?? null,
    claimedAmount: a.claimedAmount ?? null,
    minimumBid: a.minimumBid ?? null,
    depositAmount: a.depositAmount ?? null,
    endsAt: a.endsAt?.toISOString() ?? null,
    opensAt: a.opensAt?.toISOString() ?? null,
    resumeAt: a.resumeAt?.toISOString() ?? null,
    endDateTime: a.endDateTime?.toISOString() ?? null,
    lotNumber: a.lotNumber ?? null,
    imageUrl: a.imageUrl ?? null,
    boeLink: boeLinkFor(a.boeId, a.boeLink),
    latitude: a.latitude ?? null,
    longitude: a.longitude ?? null,
    pujaStatus:
      a.pujaStatus === 'CON_PUJA' || a.pujaStatus === 'SIN_PUJA' ? a.pujaStatus : null,
    currentBidAmount: (() => {
      const raw = a.currentBidAmount;
      if (raw == null) return null;
      const n = typeof raw === 'bigint' ? Number(raw) : Number(raw);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n / 100; // cents -> euros
    })(),
    occupancy:
      a.occupancy === 'OCUPADO' || a.occupancy === 'NO_OCUPADO' || a.occupancy === 'NO_CONSTA'
        ? a.occupancy
        : null,
    // Document-archive wave: `_count.documents > 0` if at least one
    // AuctionDocument row exists for this auction. Cards render a compact
    // "documentos" indicator off this boolean; the full list ships via the
    // detail endpoint.
    hasDocuments: (a._count?.documents ?? 0) > 0,
    // Wave E2 (2026-06-07) — vehicle fields passthrough.
    vehicleMake: a.vehicleMake ?? null,
    vehicleModel: a.vehicleModel ?? null,
    vehicleYear: a.vehicleYear ?? null,
    // surfaceM2 + derived €/m² (2026-06-19). Same derive rule as /api/auctions:
    // round(valorSubasta||appraisalValue ÷ m²). Honest-NULL ⇒ card omits pill.
    surfaceM2: a.surfaceM2 ?? null,
    pricePerM2: derivePricePerM2(a.valorSubasta, a.appraisalValue, a.surfaceM2),
  };
}

/**
 * Soft content-quality score (Forge 2026-06-03, regional-variety wave).
 *
 * Rewards rows that look like fully-filled, presentable listings:
 *   +2 real image (non-null, non-empty, not a known placeholder)
 *   +1 real title (non-null, non-empty, not "Unknown")
 *   +1 any real price (appraisal / claimed / minimum > 0)
 *   +1 location detail (municipality / address / lat-lng present)
 *   +1 propertyType present  (sparse pre-doc-archive; treated as bonus)
 *   +1 auctionType present
 *
 * SOFT: a score of 0 is allowed — never a gate. Sparse rows still appear
 * in the feed (and in single-province filters) so small provinces don't
 * empty out. Quality is a SORT signal, not an inclusion gate.
 */
function qualityScoreOf(a: {
  title: string | null;
  imageUrl: string | null;
  appraisalValue: number | null;
  valorSubasta: number | null;
  claimedAmount: number | null;
  minimumBid: number | null;
  municipality: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  propertyType: string | null;
  auctionType: string | null;
}): number {
  let s = 0;
  const img = (a.imageUrl ?? "").trim();
  // "Known placeholder" guard: leave a TODO list of canonical placeholders if
  // any surface in the wild. Today the dominant placeholder pattern is the
  // empty string (404/444 active rows), so empty-string detection suffices.
  if (img.length > 0) s += 2;
  const title = (a.title ?? "").trim();
  if (title.length > 0 && title.toLowerCase() !== "unknown") s += 1;
  // hasPrice: any of the three Dennis-spec price columns + minimumBid count.
  // Post-Ghost-split (2026-06-04), judicial rows often have Tasación=NULL but
  // valorSubasta>0 — without including valorSubasta here, those rows would
  // sink in the soft quality sort despite being fully-priced listings.
  const hasPrice =
    (a.appraisalValue ?? 0) > 0 ||
    (a.valorSubasta ?? 0) > 0 ||
    (a.claimedAmount ?? 0) > 0 ||
    (a.minimumBid ?? 0) > 0;
  if (hasPrice) s += 1;
  const hasLoc =
    (a.municipality ?? "").trim().length > 0 ||
    (a.address ?? "").trim().length > 0 ||
    (a.latitude != null && a.longitude != null);
  if (hasLoc) s += 1;
  if ((a.propertyType ?? "").trim().length > 0) s += 1;
  if ((a.auctionType ?? "").trim().length > 0) s += 1;
  return s;
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
  // Valor subasta — Ghost's 2026-06-04 split (commit `443a864`) added this
  // column distinct from appraisalValue (Tasación). Projected for the card.
  valorSubasta: true,
  claimedAmount: true,
  minimumBid: true,
  depositAmount: true,
  endsAt: true,
  // 2026-06-03 (Pixel cards): start date projection for PROXIMA_APERTURA cards.
  opensAt: true,
  // Wave52 (Pixel 2026-06-04): suspended-scraper reanudación date for the
  // SUSPENDIDA card date line.
  resumeAt: true,
  endDateTime: true,
  lotNumber: true,
  imageUrl: true,
  boeLink: true,
  latitude: true,
  longitude: true,
  updatedAt: true,
  transitionedAt: true,
  // #16 / #17 — pujas + occupancy on the recent feed.
  pujaStatus: true,
  currentBidAmount: true,
  occupancy: true,
  // Wave E2 (2026-06-07) — vehicle make/model/year for the headline upgrade.
  vehicleMake: true,
  vehicleModel: true,
  vehicleYear: true,
  // surfaceM2 (2026-06-19) — Prisma select MUST list it explicitly (unlike the
  // raw `SELECT Auction.*` route). Feeds the read-time €/m² derive.
  surfaceM2: true,
  // Document-archive wave (2026-06-03). `_count` produces `hasDocuments` on
  // cards WITHOUT inlining the full doc array (keeps the list query lean).
  _count: { select: { documents: true } },
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

    // ─── Quick-filter params (Forge 2026-06-03, home chips) ─────────────────
    // category/province are exact-match against the DB-stored values.
    // Trim + treat blank as absent. Invalid (e.g. unknown) categories are
    // accepted at the WHERE layer — Prisma returns 0 rows instead of throwing,
    // so the feed stays empty rather than 500-ing. That's the desired
    // "graceful ignore on bad input" the brief asks for.
    const rawCategory = (url.searchParams.get("category") ?? "").trim();
    const categoryFilter = rawCategory.length > 0 ? rawCategory : null;
    const rawProvince = (url.searchParams.get("province") ?? "").trim();
    const provinceFilter = rawProvince.length > 0 ? rawProvince : null;

    // `when` bucket — match the semantics already used by the listing page.
    // Aliases:
    //   active   | activas    → active-now (CELEBRANDOSE/ACTIVE only)
    //   proximas | upcoming   → upcoming-only (PROXIMA_APERTURA/PRE_AUCTION)
    //   todas    | all        → no status filter, no clock-ended guard
    //   (absent / unknown)    → default: active OR upcoming (today's behavior)
    const rawWhen = (url.searchParams.get("when") ?? "").trim().toLowerCase();
    type WhenBucket = "active" | "proximas" | "todas" | "default";
    const whenBucket: WhenBucket = (() => {
      switch (rawWhen) {
        case "active":
        case "activas":
          return "active";
        case "proximas":
        case "próximas":
        case "upcoming":
          return "proximas";
        case "todas":
        case "all":
          return "todas";
        default:
          return "default";
      }
    })();
    // Local aliases for the carousel's two "specialized" buckets. Both come
    // from the shared lib — LIVE_NOW = strict subset of ACTIVE (used by
    // when=active, "celebrándose right now"), PRE_AUCTION = upcoming (used by
    // when=proximas). Keeping the local names so the rest of this file reads
    // unchanged.
    const ACTIVE_DB_STATUSES = LIVE_NOW_DB_STATUSES;
    const UPCOMING_DB_STATUSES = PRE_AUCTION_DB_STATUSES;
    const ACTIVE_FRONTEND_STATUSES_ACTIVE_ONLY = new Set(["celebrandose"]);
    const ACTIVE_FRONTEND_STATUSES_UPCOMING_ONLY = new Set(["proxima-apertura"]);
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

    // ─── activeOnly / when / category / province filters ────────────────────
    // When the caller (e.g. the ForexCarousel) only wants currently-active
    // auctions, drop event rows whose underlying auction has moved to a
    // terminal state. Without this, a flood of "concluida-portal" cleanup
    // status-events will fill the feed and starve out the active rows the UI
    // actually wants to render.
    // Clock-wins guard: an auction whose endsAt has passed is NOT active,
    // even if its stored status still says CELEBRANDOSE (sweep lag). Mirrors
    // the `effectiveStatus` rule in components/observatory/status.ts.
    //
    // The quick-filter chips (Forge 2026-06-03) add three orthogonal filters
    // applied to the SAME event-row set: category, province, and when-bucket.
    // when="todas" disables BOTH the active/upcoming status filter AND the
    // clock-ended guard, so finished/cancelled rows can appear.
    // Decide whether to enforce a status/clock filter on the event side:
    //   - activeOnly=1     → enforce active+upcoming + clock guard (legacy)
    //   - when=active      → enforce active-only + clock guard
    //   - when=proximas    → enforce upcoming-only + clock guard
    //   - when=todas       → DO NOT enforce status or clock guard
    //   - default (none)   → DO NOT enforce status (today's contract)
    const enforceEventStatus =
      activeOnly || whenBucket === "active" || whenBucket === "proximas";
    const allowedFrontendStatuses: Set<string> =
      whenBucket === "active"
        ? ACTIVE_FRONTEND_STATUSES_ACTIVE_ONLY
        : whenBucket === "proximas"
          ? ACTIVE_FRONTEND_STATUSES_UPCOMING_ONLY
          : ACTIVE_FRONTEND_STATUSES; // activeOnly legacy → active+upcoming

    // Case-insensitive province comparator (defensive — DB has "Las Palmas"
    // alongside lowercase "las palmas"; chip sends the canonical capitalised
    // form but a robust match avoids silent zero-result drift if the DB ever
    // grows other casing variants). Mirrors the Prisma `mode:'insensitive'`
    // applied to the fallback `where` below. No accent folding (Prisma's
    // insensitive mode does case but not accents); add accent fold later if
    // the chip list ever grows entries with accent drift.
    const provinceFilterLc = provinceFilter ? provinceFilter.toLowerCase() : null;

    // Round-robin order index for fallback items, keyed by item.id. The
    // final outer sort consults this map so the carefully-interleaved
    // province sequence isn't collapsed by a recency tiebreak. Event
    // items aren't in this map and fall through to recency.
    const fallbackOrder = new Map<string, number>();

    let workingItems = items;
    if (enforceEventStatus || categoryFilter || provinceFilter) {
      workingItems = items.filter((it) => {
        if (enforceEventStatus) {
          if (!allowedFrontendStatuses.has(it.auction.status)) return false;
          if (it.auction.endsAt && it.auction.endsAt <= nowIso) return false;
        }
        if (categoryFilter && it.auction.category !== categoryFilter) return false;
        if (
          provinceFilterLc &&
          (it.auction.province ?? "").toLowerCase() !== provinceFilterLc
        ) {
          return false;
        }
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

      // Status set for the fallback `where`:
      //   - when=active   → ACTIVE_DB_STATUSES only
      //   - when=proximas → UPCOMING_DB_STATUSES only
      //   - when=todas    → no status constraint (any state goes)
      //   - default       → ACTIVE_OR_UPCOMING (today's behavior)
      const fallbackStatuses: readonly string[] | null =
        whenBucket === "active"
          ? (ACTIVE_DB_STATUSES as unknown as readonly string[])
          : whenBucket === "proximas"
            ? (UPCOMING_DB_STATUSES as unknown as readonly string[])
            : whenBucket === "todas"
              ? null
              : (ACTIVE_OR_UPCOMING_DB_STATUSES as unknown as readonly string[]);

      // Build the where dynamically so when=todas drops both the status
      // constraint AND the clock guard (finished auctions are allowed).
      // Province match is case-insensitive (Prisma QueryMode.insensitive)
      // so the chip's canonical "Las Palmas" finds both "Las Palmas" and
      // "las palmas" DB rows. Without case insensitivity, single-row
      // provinces are one DB casing flip away from a zero-result chip.
      const fallbackWhere: Record<string, unknown> = {
        province: provinceFilter
          ? { equals: provinceFilter, mode: "insensitive" }
          : { not: "" },
        id: { notIn: Array.from(excludeIds) },
      };
      if (fallbackStatuses !== null) {
        fallbackWhere.status = { in: fallbackStatuses as string[] };
        // Clock-wins guard: shared helper produces the same null-safe
        // predicate every other surface uses. A stale CELEBRANDOSE row past
        // endsAt does not surface; PROXIMA_APERTURA rows with null endsAt
        // do (no clock set yet).
        Object.assign(fallbackWhere, activeClockGuardPrisma());
      }
      if (categoryFilter) {
        fallbackWhere.category = categoryFilter;
      }

      // Pool size: pull a generous candidate superset so round-robin has
      // room to span many provinces. Capped at 300 to keep query cost bounded
      // — at limit=30 the cap kicks in at need*6=180, well under 300; the cap
      // only matters if a caller asks for a very large limit.
      const POOL_CAP = 300;
      const poolSize = Math.min(POOL_CAP, Math.max(need * 6, need * 2));

      const fallbackRows = await prisma.auction.findMany({
        where: fallbackWhere as never,
        // Pull by recency; quality re-ranking happens in JS over the pool.
        // We can't ORDER BY a computed quality score in SQL without a stored
        // column, and given pool sizes (<=300) the JS sort is trivial.
        orderBy: [{ transitionedAt: "desc" }, { updatedAt: "desc" }],
        take: poolSize,
        select: AUCTION_CARD_SELECT,
      });

      // ─── Score + bucket pool, then round-robin across provinces ────────
      //
      // Goal: when NO province is pinned, the first N cards of the carousel
      // should span N distinct provinces (best card from each) so a single
      // dominant region (Madrid) doesn't crowd everything else out. The
      // pool is sorted DESCending by qualityScore (soft criteria — image,
      // title, price, location, propertyType, auctionType), then by
      // recency. Bucketing by province preserves Viviendas-first because
      // round-robin is applied WITHIN each categoryRank tier and tiers are
      // concatenated in rank order.
      //
      // When a province IS pinned, the pool is already a single bucket;
      // round-robin degenerates to a simple quality-then-recency sort —
      // which is exactly what the brief asks for ("score DESC then
      // recency"), so we go through the same code path.
      type FallbackCand = {
        row: (typeof fallbackRows)[number];
        score: number;
        at: string;
        rank: number; // categoryRank — outer ordering key
      };

      const candidates: FallbackCand[] = [];
      for (const r of fallbackRows) {
        if (excludeIds.has(r.id)) continue;
        const at = (r.transitionedAt ?? r.updatedAt)?.toISOString();
        if (!at) continue;
        candidates.push({
          row: r,
          score: qualityScoreOf(r),
          at,
          rank: categoryRankOf(r.category),
        });
      }

      // Within-bucket sort: quality DESC, then recency DESC.
      const sortWithinBucket = (a: FallbackCand, b: FallbackCand) => {
        if (a.score !== b.score) return b.score - a.score;
        return b.at.localeCompare(a.at);
      };

      // When category is pinned every row shares the same rank, so the
      // outer "tier" loop runs once and the only diversity axis is province.
      // When no category is pinned, group by categoryRank and round-robin
      // provinces WITHIN each rank tier so Viviendas-first holds AND each
      // tier shows regional variety.
      const tiers = new Map<number, FallbackCand[]>();
      for (const c of candidates) {
        const arr = tiers.get(c.rank);
        if (arr) arr.push(c);
        else tiers.set(c.rank, [c]);
      }
      const tierKeys = Array.from(tiers.keys()).sort((a, b) => a - b);

      const picked: FallbackCand[] = [];
      outer: for (const rank of tierKeys) {
        const tier = tiers.get(rank)!;
        // Bucket this tier by province (case-folded so "Las Palmas" and
        // "las palmas" land in the same bucket — matches the DB case-insensitive
        // where filter and prevents a single province from getting two slots).
        const byProvince = new Map<string, FallbackCand[]>();
        for (const c of tier) {
          const key = (c.row.province ?? "").toLowerCase();
          const arr = byProvince.get(key);
          if (arr) arr.push(c);
          else byProvince.set(key, [c]);
        }
        // Sort each province's queue best-first.
        for (const arr of byProvince.values()) arr.sort(sortWithinBucket);
        // Province rotation order: best card per province defines the
        // province's strength; pick the order that surfaces the strongest
        // province first within the tier, then rotate.
        const provinceOrder = Array.from(byProvince.entries()).sort(
          ([, a], [, b]) => sortWithinBucket(a[0]!, b[0]!),
        );
        // Round-robin: one card per province per pass, until either the
        // tier is exhausted or we've filled `need`.
        let progress = true;
        while (progress && picked.length < need) {
          progress = false;
          for (const [, queue] of provinceOrder) {
            if (picked.length >= need) break outer;
            const next = queue.shift();
            if (!next) continue;
            picked.push(next);
            progress = true;
          }
        }
        if (picked.length >= need) break;
      }

      // Push picked fallback items AND record the round-robin order so the
      // final outer sort can preserve province variety (otherwise the
      // outer "at DESC" tiebreak collapses round-robin back into recency
      // dominance — exactly the Madrid 14/30 pathology we're fixing).
      for (let i = 0; i < picked.length; i++) {
        const c = picked[i]!;
        const a = c.row;
        const item: FeedItem = {
          id: `auction-${a.id}`,
          kind: "auction",
          at: c.at,
          auctionId: a.id,
          auction: projectAuction(a),
          payload: { type: "auction", reason: "recent_listing" },
        };
        workingItems.push(item);
        // Stable ascending order index — smaller = earlier in round-robin.
        fallbackOrder.set(item.id, i);
        excludeIds.add(a.id);
      }
    }

    if (workingItems.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Sort: properties-first by default (categoryRank ASC, then at DESC) so
    // Viviendas surfaces at the top of the home carousel. When the caller
    // pins a single `category`, every row shares the same rank — fall back to
    // pure `at DESC` recency. Rank table is the SAME one used by the
    // /api/auctions default sort (see @/lib/category-rank) so the home
    // carousel and the listing page never disagree about which category is
    // "hero".
    //
    // Round-robin variety preservation (Forge 2026-06-03): fallback items
    // were already ordered into a province round-robin sequence above. The
    // outer sort honours that order via `fallbackOrder` (ASC) — without
    // this, the recency tiebreak would collapse the carefully-spread
    // province sequence back into a recency dominance (Madrid 14/30).
    //
    // Within a category-rank tier we put TRUE EVENTS (status/bid) first
    // sorted by recency (they're real "something changed" signals — they
    // earn the lead), then FALLBACK items in round-robin order (the
    // variety mechanism). In current data the event tables are near-empty
    // so the visible behavior is dominated by the round-robin fallback,
    // but this preserves "events lead" semantics for when history fills in.
    const isFallback = (it: FeedItem) => fallbackOrder.has(it.id);
    const orderOf = (item: FeedItem): number =>
      fallbackOrder.get(item.id) ?? -1; // -1 sentinel = event item
    const tieByEventsThenVariety = (a: FeedItem, b: FeedItem): number => {
      const fa = isFallback(a);
      const fb = isFallback(b);
      if (fa !== fb) return fa ? 1 : -1; // events (non-fallback) lead
      if (!fa) return b.at.localeCompare(a.at); // both events → recency
      return orderOf(a) - orderOf(b); // both fallback → round-robin order
    };
    if (categoryFilter) {
      workingItems.sort(tieByEventsThenVariety);
    } else {
      workingItems.sort((a, b) => {
        const ra = categoryRankOf(a.auction.category);
        const rb = categoryRankOf(b.auction.category);
        if (ra !== rb) return ra - rb;
        return tieByEventsThenVariety(a, b);
      });
    }
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
