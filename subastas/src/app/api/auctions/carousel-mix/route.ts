/**
 * GET /api/auctions/carousel-mix — the home page hero carousel composed feed.
 *
 * Returns a fixed-ratio mix of currently-active, upcoming, and suspended
 * auctions so the marquee always cycles through the three states the user
 * cares about. Different from /api/auctions/recent in two ways:
 *   1. recent is an EVENT feed (status/bid history with a starvation
 *      fallback) and its `activeOnly` filter strips SUSPENDIDA — it cannot
 *      surface suspended auctions to the carousel.
 *   2. recent cannot enforce a per-status ratio — it merges whatever the
 *      history tables have.
 *
 * This route runs THREE parallel Prisma queries (one per status bucket),
 * quality-ranks each bucket, applies province round-robin for regional
 * variety, then weighted-interleaves the three buckets into a single
 * marquee-ready list.
 *
 * Ratio (Dennis-locked, 2026-06-04):
 *   50% CELEBRANDOSE → round(0.5 * N)
 *   30% PROXIMA_APERTURA → round(0.3 * N)
 *   20% SUSPENDIDA → remainder (so the three always sum to N)
 *   N = 30 default → 15 + 9 + 6.
 *
 * Live counts (audited 2026-06-04) confirm enough rows for the ratio:
 *   CELEBRANDOSE 437, PROXIMA 220, SUSPENDIDA 102, all 100% lat/lon
 *   coverage so every card renders a map-tile via resolveCardImage().
 *
 * Query params:
 *   limit    — total cards N (default 30, cap 60)
 *   province — optional, exact DB province string passthrough
 *   category — optional, exact DB category string passthrough
 *
 * Response envelope — MATCHES the recent route so Pixel's ForexCarousel
 * mapping (body.data[].auction → FeedAuction) keeps working unchanged:
 *   { success: true, data: FeedItem[] }
 *   FeedItem = { id, kind: "auction", at, auctionId, auction, payload }
 *
 * Per-item projection carries `status` as the frontend-canonical key
 * ("celebrandose" / "proxima-apertura" / "suspendida") so Pixel can badge
 * each card without re-folding DB values. Also carries latitude/longitude
 * for the map-tile image rung, plus all the price/date/location fields the
 * existing card+modal already expect.
 *
 * BigInt-safe: currentBidAmount (cents) is coerced to a finite Number in
 * euros via the same code path the recent route uses. No raw BigInt is
 * ever passed to NextResponse.json.
 *
 * Read-only. No auth. force-dynamic (counts change with every scrape).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boeLinkFor } from "@/lib/boe-link";
import {
  DB_TO_FRONTEND_STATUS,
  activeClockGuardPrisma,
} from "@/lib/auction-status";
import {
  getAppropriateImageUrl,
  isRealAuctionImage,
} from "@/lib/auction-image-projection";
import { OFFICIAL_CATEGORIES } from "@/lib/constants";
import { auctionDisplayTitle } from "@/lib/seo/display-title";

export const dynamic = "force-dynamic";

// ─── Status bucket DB values ─────────────────────────────────────────────
//
// Per the brief: CELEBRANDOSE uses LIVE_NOW_DB_STATUSES (ACTIVE+CELEBRANDOSE,
// no SUSPENDIDA) WITH the clock guard. PROXIMA_APERTURA uses
// PRE_AUCTION_DB_STATUSES (no clock guard — pre-auction has no "has it
// ended" question). SUSPENDIDA is the literal 'SUSPENDIDA' DB status —
// it lives in ACTIVE_DB_STATUSES but is excluded from LIVE_NOW, so we
// select it explicitly. The legacy 'SUSPENDED' value is included so older
// rows that haven't been migrated to the BOE-accurate label still surface.
const CELEBRANDOSE_DB = ["ACTIVE", "CELEBRANDOSE"] as const;
const PROXIMA_DB = ["PRE_AUCTION", "PROXIMA_APERTURA"] as const;
const SUSPENDIDA_DB = ["SUSPENDIDA", "SUSPENDED"] as const;

// ─── Projection (mirrors /api/auctions/recent) ────────────────────────────

type FeedAuctionProjection = {
  id: string;
  boeId: string;
  title: string;
  /**
   * Wave C1a (2026-06-07). Server-derived address-led display title — same
   * derivation the detail page H1 / <title> uses (`auctionDisplayTitle` in
   * `lib/seo/display-title.ts`). Cards can render this verbatim instead of
   * re-implementing the tipo+address fallback ladder per surface. Examples:
   *   - "Subasta de Vivienda en Calle Tollo, 19, Ontur"
   *   - "Subasta de Turismos en Madrid, Madrid"
   * Never null/blank — the ladder always resolves (worst case: "Subasta de
   * Inmueble").
   */
  displayTitle: string;
  category: string;
  province: string | null;
  municipality: string | null;
  address: string | null;
  status: string;
  auctionType: string | null;
  propertyType: string | null;
  currentBid: number | null;
  appraisalValue: number | null;
  // Valor subasta — DISTINCT from appraisalValue (Tasación) and claimedAmount.
  // Ghost split (2026-06-04, commit `443a864`). Honest-NULL.
  valorSubasta: number | null;
  claimedAmount: number | null;
  minimumBid: number | null;
  depositAmount: number | null;
  endsAt: string | null;
  opensAt: string | null;
  // Wave52 (Pixel 2026-06-04): SUSPENDIDA reanudación date for the status-
  // branched card date line.
  resumeAt: string | null;
  endDateTime: string | null;
  lotNumber: string | null;
  imageUrl: string | null;
  /**
   * Wave B0 (2026-06-07). Authoritative "is this a resolver-served real
   * photo?" flag. Mirrors the projection added by `/api/auctions` — Pixel's
   * `resolveCardImage` reads this as the rung-1 signal. Before this fix the
   * carousel projected raw DB `imageUrl` with NO `hasImage`, so EVERY card
   * fell through to the rung-3 branded placeholder. True iff
   * `isRealAuctionImage(rawImageUrl)` — the resolver-served URL test.
   */
  hasImage: boolean;
  boeLink: string | null;
  latitude: number | null;
  longitude: number | null;
  pujaStatus: "CON_PUJA" | "SIN_PUJA" | null;
  currentBidAmount: number | null;
  occupancy: "OCUPADO" | "NO_OCUPADO" | "NO_CONSTA" | null;
  hasDocuments: boolean;
  // Wave E2 (2026-06-07) — vehicle make/model/year. Honest-NULL on non-
  // VEHICLE rows and on VEHICLE rows pre-backfill. Drives the carousel-
  // card headline upgrade via `auctionCardTitle` ("Turismo - SEAT León en
  // Murcia" when both make+model are present).
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
};

type FeedItem = {
  id: string;
  kind: "auction";
  at: string;
  auctionId: string;
  auction: FeedAuctionProjection;
  payload: { type: "auction"; reason: "carousel_mix" };
};

// Same fold map every other route uses — DB → frontend-canonical key.
// IMPORTANT: this is what lets Pixel badge "En curso / Próxima / Suspendida"
// without re-implementing the legacy → BOE fold.
const DB_TO_FRONTEND_TYPE: Record<string, string> = {
  JUDICIAL: "judicial",
  NOTARIAL: "notarial",
  AEAT: "aeat",
  OTRAS_TRIBUTARIAS: "otras_tributarias",
  TRIBUTARIA: "otras_tributarias",
  ADMINISTRATIVAS: "administrativas",
  ADMINISTRATIVA: "administrativas",
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

function titleCaseEs(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

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
  // Valor subasta — Ghost's 2026-06-04 split projection (commit `443a864`).
  valorSubasta: true,
  claimedAmount: true,
  minimumBid: true,
  depositAmount: true,
  endsAt: true,
  opensAt: true,
  resumeAt: true,
  endDateTime: true,
  lotNumber: true,
  imageUrl: true,
  boeLink: true,
  latitude: true,
  longitude: true,
  updatedAt: true,
  transitionedAt: true,
  pujaStatus: true,
  currentBidAmount: true,
  occupancy: true,
  // Wave E2 (2026-06-07) — vehicle make/model/year for the headline upgrade.
  vehicleMake: true,
  vehicleModel: true,
  vehicleYear: true,
  _count: { select: { documents: true } },
} as const;

type AuctionRow = {
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
  updatedAt: Date | null;
  transitionedAt: Date | null;
  pujaStatus?: string | null;
  currentBidAmount?: bigint | number | string | null;
  occupancy?: string | null;
  // Wave E2 (2026-06-07) — vehicle fields, honest-NULL on non-VEHICLE rows.
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  _count?: { documents: number } | null;
};

function projectAuction(a: AuctionRow): FeedAuctionProjection {
  // Wave B0 (2026-06-07). Run the row through the SHARED image-projection
  // ladder so the carousel card receives a usable URL (rung-1 real photo
  // when present, rung-2 static-map pin or rung-3 category placeholder
  // otherwise) — instead of the raw DB `imageUrl` which is null on most
  // rows. The accompanying `hasImage` flag tells `resolveCardImage` whether
  // the URL is an authoritative rung-1 real photo, so the client never
  // mis-promotes a map tile into the photo slot.
  const resolvedImageUrl = getAppropriateImageUrl({
    imageUrl: a.imageUrl,
    latitude: a.latitude,
    longitude: a.longitude,
    boeId: a.boeId,
    category: a.category,
    status: a.status as string | null | undefined,
  });
  return {
    id: a.id,
    boeId: a.boeId,
    title: synthTitle(a.title, a.municipality, a.province),
    // Wave C1a (2026-06-07). Address-led title computed server-side via the
    // same helper the detail page H1 uses, so a vehicle card reads "Turismos
    // en Madrid" and a property card reads "Vivienda en Calle Tollo, 19,
    // Ontur" — matching `auctionDisplayTitle`'s ladder (address → muni/prov
    // → raw title). Honest-fallback: never blank.
    displayTitle: auctionDisplayTitle({
      address: a.address,
      propertyType: a.propertyType,
      auctionType: a.auctionType,
      category: a.category,
      municipality: a.municipality,
      province: a.province,
      title: a.title,
    }),
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
    imageUrl: resolvedImageUrl,
    hasImage: isRealAuctionImage(a.imageUrl),
    boeLink: boeLinkFor(a.boeId, a.boeLink),
    latitude: a.latitude ?? null,
    longitude: a.longitude ?? null,
    pujaStatus:
      a.pujaStatus === "CON_PUJA" || a.pujaStatus === "SIN_PUJA"
        ? a.pujaStatus
        : null,
    currentBidAmount: (() => {
      const raw = a.currentBidAmount;
      if (raw == null) return null;
      const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n / 100;
    })(),
    occupancy:
      a.occupancy === "OCUPADO" ||
      a.occupancy === "NO_OCUPADO" ||
      a.occupancy === "NO_CONSTA"
        ? a.occupancy
        : null,
    hasDocuments: (a._count?.documents ?? 0) > 0,
    // Wave E2 (2026-06-07) — vehicle fields passthrough. The client card
    // forwards these to `auctionCardTitle` for the headline upgrade.
    vehicleMake: a.vehicleMake ?? null,
    vehicleModel: a.vehicleModel ?? null,
    vehicleYear: a.vehicleYear ?? null,
  };
}

/**
 * Same soft quality score the recent route's fallback uses. Rewards rows
 * that look fully populated. NEVER a gate — image-less rows still appear,
 * they just sink. This is critical for the PROXIMA bucket where 0/220
 * rows have a real imageUrl (all render via lat/lon → map tile).
 *   +2 real image
 *   +1 real title (not empty / not "Unknown")
 *   +1 any real price (appraisal / claimed / minimum > 0)
 *   +1 location detail (municipality / address / lat-lng)
 *   +1 propertyType
 *   +1 auctionType
 */
function qualityScoreOf(a: AuctionRow): number {
  let s = 0;
  const img = (a.imageUrl ?? "").trim();
  if (img.length > 0) s += 2;
  const title = (a.title ?? "").trim();
  if (title.length > 0 && title.toLowerCase() !== "unknown") s += 1;
  // hasPrice: post-Ghost-split (2026-06-04), judicial rows often have
  // Tasación=NULL but valorSubasta>0 — including valorSubasta keeps fully-
  // priced judicial rows from sinking under the soft quality sort.
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

// ─── Province-valid predicate (Prisma form) ──────────────────────────────
//
// Mirrors PROVINCE_VALID_SQL in stats/route.ts. Excludes the known
// placeholder/junk province values so the carousel never surfaces a card
// pinned to "Unknown" / "Mapa de la zona". When the caller pins a
// province, we accept it exactly and skip the blacklist (the chip already
// provides a known-good province string).
const PROVINCE_PLACEHOLDER_VALUES = [
  "unknown",
  "desconocida",
  "mapa de la zona",
  "mapa del municipio",
  "null",
  "undefined",
];

function provinceValidWhere(): Record<string, unknown> {
  // Prisma equivalent of stats/route.ts's PROVINCE_VALID_SQL
  // (`LOWER(province) NOT IN (...) AND LENGTH(TRIM(province)) > 1`).
  //
  // Two bugs in the original implementation, both diagnosed against the
  // live wave52 container (2026-06-04):
  //
  //   1. RUNTIME BUG — `province: { not: null, ... }` against the Auction
  //      model throws `PrismaClientValidationError` because `province` is
  //      `String` (NON-nullable) in schema.prisma, so the generated
  //      `StringFilter` does not accept `null` in `not`. Compiled tsc
  //      clean (the `Record<string, unknown>` return type washed away the
  //      Prisma type-check) but the live `prisma.auction.findMany` call
  //      threw 500 on every hit, leaving the home carousel empty.
  //   2. SEMANTIC BUG — `notIn: PROVINCE_PLACEHOLDER_VALUES` is
  //      case-sensitive, and the actual DB stores 34,467 rows with
  //      "Unknown" (capital U) and 46 with "Desconocida". The original
  //      lowercase-only list would have leaked all of those into the
  //      carousel even if the runtime bug were fixed.
  //
  // Fix: drop `not: null` entirely (the field is non-nullable so it's
  // both invalid and unnecessary), and replace `notIn` with a series of
  // case-insensitive `NOT equals` clauses inside `AND` so capitalised
  // drift ("Unknown", "Desconocida", "MAPA DE LA ZONA", …) is caught.
  // A final `{ NOT: { province: "" } }` covers the trim/empty case the
  // raw-SQL LENGTH(TRIM(...)) > 1 guard previously handled — one-char
  // junk is rare enough in practice that we accept the slight semantic
  // gap to stay in pure Prisma-land (raw SQL would be a bigger rewrite).
  return {
    AND: [
      ...PROVINCE_PLACEHOLDER_VALUES.map((v) => ({
        NOT: { province: { equals: v, mode: "insensitive" as const } },
      })),
      { NOT: { province: "" } },
    ],
  };
}

// ─── Per-bucket fetch + quality-rank + round-robin ───────────────────────

type Candidate = {
  row: AuctionRow;
  score: number;
  at: string;
};

async function fetchBucket(
  dbStatuses: readonly string[],
  applyClockGuard: boolean,
  count: number,
  provinceFilter: string | null,
  categoryFilter: string | null,
  categoryGroupFilter: "movable" | "real_estate" | null,
): Promise<AuctionRow[]> {
  if (count <= 0) return [];

  // Pull a generous superset so the JS quality re-rank + province round
  // robin have material to work with. Capped to keep query cost bounded.
  const POOL_CAP = 300;
  const poolSize = Math.min(POOL_CAP, Math.max(count * 8, count * 4));

  const where: Record<string, unknown> = {
    status: { in: dbStatuses as string[] },
  };
  if (applyClockGuard) {
    Object.assign(where, activeClockGuardPrisma());
  }
  if (provinceFilter) {
    where.province = { equals: provinceFilter, mode: "insensitive" };
  } else {
    Object.assign(where, provinceValidWhere());
  }
  if (categoryFilter) {
    // Exact category pin (legacy pre-categoryGroup callers) wins over the
    // group filter — they pinned a single label deliberately.
    where.category = categoryFilter;
  } else if (categoryGroupFilter === "movable") {
    // Wave C1a (2026-06-07). Move the home `Últimos vehículos` filtering
    // server-side so the per-bucket 30-card cap is filled with MOVABLE rows
    // (the previous client-side post-filter on an unfiltered 50/30/20 mix
    // dropped Camiones/Otros vehículos/Embarcaciones AND was always
    // properties-dominant, leaving the vehicle row at ~4 cards). The
    // widened `OFFICIAL_CATEGORIES.MOVABLE` set carries the full set of
    // DB-emitted vehicle labels (Turismos/Motocicletas/Camiones/Barcos/
    // Embarcaciones/Otros vehículos/Vehículos Industriales) + the
    // non-vehicle movables Maquinaria/Joyas/Arte.
    where.category = { in: OFFICIAL_CATEGORIES.MOVABLE };
  } else if (categoryGroupFilter === "real_estate") {
    where.category = { in: OFFICIAL_CATEGORIES.REAL_ESTATE };
  }

  const rows = await prisma.auction.findMany({
    where: where as never,
    orderBy: [{ transitionedAt: "desc" }, { updatedAt: "desc" }],
    take: poolSize,
    select: AUCTION_CARD_SELECT,
  });

  if (rows.length === 0) return [];

  // Build candidates + scores.
  const candidates: Candidate[] = [];
  for (const r of rows) {
    const at = (r.transitionedAt ?? r.updatedAt)?.toISOString();
    if (!at) continue;
    candidates.push({ row: r as AuctionRow, score: qualityScoreOf(r as AuctionRow), at });
  }

  const sortWithinBucket = (a: Candidate, b: Candidate) => {
    if (a.score !== b.score) return b.score - a.score;
    return b.at.localeCompare(a.at);
  };

  // When a province is pinned, no round-robin — single province bucket,
  // just take the best `count` by quality then recency.
  if (provinceFilter) {
    candidates.sort(sortWithinBucket);
    return candidates.slice(0, count).map((c) => c.row);
  }

  // Province round-robin for variety. Don't let one province eat the
  // bucket. Case-folded key matches the recent route's behavior.
  const byProvince = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = (c.row.province ?? "").toLowerCase();
    const arr = byProvince.get(key);
    if (arr) arr.push(c);
    else byProvince.set(key, [c]);
  }
  for (const arr of byProvince.values()) arr.sort(sortWithinBucket);

  // Province rotation order: provinces with the strongest top card go first.
  const provinceOrder = Array.from(byProvince.entries()).sort(
    ([, a], [, b]) => sortWithinBucket(a[0]!, b[0]!),
  );

  const picked: AuctionRow[] = [];
  let progress = true;
  while (progress && picked.length < count) {
    progress = false;
    for (const [, queue] of provinceOrder) {
      if (picked.length >= count) break;
      const next = queue.shift();
      if (!next) continue;
      picked.push(next.row);
      progress = true;
    }
  }
  return picked;
}

// ─── Weighted interleave ─────────────────────────────────────────────────
//
// Don't return [15 active][9 proxima][6 susp] as three solid blocks — the
// marquee would read as "all active, then all upcoming, then all
// suspended". Interleave so the user sees a genuine mix as the carousel
// cycles. Algorithm: maintain a "deficit" counter per bucket; on each
// output slot pick the bucket whose ratio target is most under-served.
// Equivalent to the largest-remainder method run incrementally — produces
// "A P A A P A S A P A A P A S A P A A P A A P A S A P A A P A S A P A"
// style sequences (no 3 same-bucket cards in a row when ratios are 50/30/20).
function weightedInterleave(
  active: AuctionRow[],
  proxima: AuctionRow[],
  susp: AuctionRow[],
): AuctionRow[] {
  const buckets = [
    { name: "active" as const, queue: [...active], target: active.length, taken: 0 },
    { name: "proxima" as const, queue: [...proxima], target: proxima.length, taken: 0 },
    { name: "susp" as const, queue: [...susp], target: susp.length, taken: 0 },
  ];
  const total = buckets.reduce((s, b) => s + b.target, 0);
  if (total === 0) return [];

  const out: AuctionRow[] = [];
  for (let i = 0; i < total; i++) {
    // Pick the bucket whose (taken / target) ratio is most BELOW its
    // (target / total) share — equivalently, whose (taken * total -
    // target * outputSoFar) is most negative.
    let bestIdx = -1;
    let bestDeficit = -Infinity;
    for (let j = 0; j < buckets.length; j++) {
      const b = buckets[j]!;
      if (b.queue.length === 0) continue;
      // Deficit = how far below this bucket's fair share it currently sits.
      // The bucket with the largest deficit wins this slot.
      const fairShare = (b.target * (i + 1)) / total;
      const deficit = fairShare - b.taken;
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        bestIdx = j;
      }
    }
    if (bestIdx === -1) break;
    const winner = buckets[bestIdx]!;
    const row = winner.queue.shift()!;
    out.push(row);
    winner.taken += 1;
  }
  return out;
}

// ─── Handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 30);
    const limit = Math.max(
      1,
      Math.min(60, Number.isFinite(limitRaw) ? limitRaw : 30),
    );
    const rawProvince = (url.searchParams.get("province") ?? "").trim();
    const provinceFilter = rawProvince.length > 0 ? rawProvince : null;
    const rawCategory = (url.searchParams.get("category") ?? "").trim();
    const categoryFilter = rawCategory.length > 0 ? rawCategory : null;
    // Wave C1a (2026-06-07). `categoryGroup` widens server-side filtering to
    // ALL movable OR ALL real-estate categories at once — used by the home
    // "Últimos inmuebles" / "Últimos vehículos" rows. Ignored when an exact
    // `category` is pinned. Only two values are valid; anything else is null.
    const rawGroup = (url.searchParams.get("categoryGroup") ?? "").trim().toLowerCase();
    const categoryGroupFilter: "movable" | "real_estate" | null =
      rawGroup === "movable" || rawGroup === "real_estate" ? rawGroup : null;

    // 50 / 30 / 20 split. Round on the first two; remainder absorbs
    // rounding so the three counts always sum to `limit` exactly.
    const nActive = Math.round(0.5 * limit);
    const nProxima = Math.round(0.3 * limit);
    const nSusp = limit - nActive - nProxima;

    // Fetch all three buckets in parallel.
    const [activeRows, proximaRows, suspRows] = await Promise.all([
      fetchBucket(CELEBRANDOSE_DB, true, nActive, provinceFilter, categoryFilter, categoryGroupFilter),
      // PROXIMA has NO clock guard — pre-auction has no "has it ended"
      // question to ask. Brief explicitly calls this out.
      fetchBucket(PROXIMA_DB, false, nProxima, provinceFilter, categoryFilter, categoryGroupFilter),
      fetchBucket(SUSPENDIDA_DB, true, nSusp, provinceFilter, categoryFilter, categoryGroupFilter),
    ]);

    // Weighted interleave so the marquee reads as a real mix, not 3 blocks.
    const merged = weightedInterleave(activeRows, proximaRows, suspRows);

    const items: FeedItem[] = merged.map((a) => {
      const at = (a.transitionedAt ?? a.updatedAt)?.toISOString() ?? "";
      return {
        id: `auction-${a.id}`,
        kind: "auction",
        at,
        auctionId: a.id,
        auction: projectAuction(a),
        payload: { type: "auction", reason: "carousel_mix" },
      };
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("/api/auctions/carousel-mix error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load carousel mix" },
      { status: 500 },
    );
  }
}
