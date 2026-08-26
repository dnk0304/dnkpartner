/**
 * Server-side data fetchers for SEO programmatic pages.
 *
 * These run at request time (Server Components) so the title/intro show LIVE
 * active counts (the count-in-title pattern is the duplicate-content defence,
 * 07 §3.1). Cached briefly with `unstable_cache` to keep the SEO pages cheap.
 */

import { unstable_cache } from 'next/cache';
import { AuctionStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { fetchV3UrlsBatch, resolveAuctionPath } from '@/lib/seo/auction-url';
// ⭐ Ken's MUNI-A ruling: the INE gazetteer is the ONLY source of towns — no
// municipality enumeration may derive its list from raw corpus rows. Rationale
// lives in `@/lib/registro/archive-municipality`.
import {
  archiveWhitelistActive,
  archiveWhitelistCacheKey,
  foldArchiveMunicipalities,
  foldMunicipalitiesForLegacySurface,
  resolveArchiveMunicipality,
} from '@/lib/registro/archive-municipality';
import { safeMunicipioSegment } from '@/lib/seo/archive-partitions';
// The canonical status predicates. `buildActiveFirstCaseSql` (used by
// /api/auctions) builds its ORDER BY CASE from these SAME two functions, which
// is what keeps the hub's SSR order and the client list's order from drifting.
import {
  isActiveStatus,
  isPreAuctionStatus,
  WHEN_BUCKET_DB_STATUSES,
  whenBucketWherePrisma,
} from '@/lib/auction-status';
import {
  TIPO_SLUG_TO_DB_KEYS,
  type TipoSlug,
  PROVINCE_DB_KEY_TO_SLUG,
  slugify,
} from './slugs';
// ⭐ Phase B: the SINGLE-SOURCE concluded-indexable predicate — reused verbatim
// for the finished-only town count AND the "recent results" content block, so
// the town index tier can never fork from the sitemap/detail-page gate.
import { concludedIndexableWhere } from '@/lib/seo/concluded-indexable';

/**
 * "Active" auctions for the count-in-title.
 *
 * ⭐ NOW DERIVED FROM THE CANONICAL BUCKET (Forge 2026-08-05). This was a LOCAL
 * array = [ACTIVE, CELEBRANDOSE, PRE_AUCTION, PROXIMA_APERTURA] — it counted
 * PRÓXIMAS as active and dropped SUSPENDIDAS, while the Activas tab (which the
 * same page renders directly underneath) used the API's ACTIVE_DB_STATUSES =
 * [ACTIVE, CELEBRANDOSE, SUSPENDED, SUSPENDIDA]. The two sets disagreed in
 * BOTH directions, so the intro sentence and the tab could never match:
 * Zaragoza advertised 42 with an empty Activas tab, Albacete 22 vs 1,
 * Madrid 107 vs 26.
 *
 * There is now exactly one definition, in @/lib/auction-status, shared by the
 * intro count, the SSR card block, the H1 subtitle and the API tab query.
 */
const ACTIVE_STATUSES = [...WHEN_BUCKET_DB_STATUSES.activas] as AuctionStatus[];

/**
 * The set the SITEMAP / indexability helpers below use. Deliberately LEFT AT
 * ITS PRE-2026-08-05 VALUE (active + upcoming, no suspendidas) so this commit
 * changes what the hub DISPLAYS without silently re-gating which URLs ship in
 * the sitemap — that is a separate, SEO-visible decision. Named explicitly so
 * the divergence from `ACTIVE_STATUSES` is a stated choice, not a leftover
 * copy of a predicate someone forgot to update.
 */
export const SITEMAP_INVENTORY_STATUSES: AuctionStatus[] = [
  AuctionStatus.ACTIVE,
  AuctionStatus.CELEBRANDOSE,
  AuctionStatus.PRE_AUCTION,
  AuctionStatus.PROXIMA_APERTURA,
];

type CountInput = {
  province?: string | null;
  auctionTypeKeys?: string[] | null;
  category?: string | null;
  /**
   * Wave 56 — exact-DB-name municipality scope, paired with province.
   * MUNI-A: accepts an ARRAY of raw DB spellings (`municipalityDbNamesForSlug`)
   * because one INE town can be stored under several corpus spellings.
   */
  municipality?: string | string[] | null;
};

/**
 * The count shown in the H1 / <title> ("N subastas activas en Madrid").
 *
 * ⚠️ It now uses EXACTLY the same predicate as the list below (`scopedWhere`).
 * It did not before: the count omitted `inScope`, so a hub could advertise a
 * number it then failed to show — the count included soft-hidden rows the list
 * filtered out. Found while adding the clock guard (2026-08-04); left
 * un-diverged now, because a count that disagrees with the rows underneath it
 * is precisely what a "does this hub show its active auctions" sweep flags,
 * and the two drifting apart again is the failure mode worth designing out.
 */
async function _countActive(args: CountInput): Promise<number> {
  return prisma.auction.count({ where: scopedWhere(args) });
}

/** Memoised count (60s cache — survives traffic bursts without hammering PG). */
export const countActiveAuctions = unstable_cache(
  _countActive,
  ['seo-active-count'],
  { revalidate: 60, tags: ['seo-counts'] },
);

/**
 * ⭐ THE INDEXABILITY COUNT (Forge 2026-08-24) — restores Dennis's 2026-06-24
 * "index active + upcoming" directive.
 *
 * This is a SEPARATE count from `countActiveAuctions`, and the separation is
 * the whole point:
 *
 *   - `countActiveAuctions` drives the DISPLAY (H1/title/intro) and MUST stay
 *     bound to the `activas` bucket so the number over the Activas tab matches
 *     the tab (the correct 2026-08-05 display fix). That bucket DROPS upcoming
 *     (PRE_AUCTION / PROXIMA_APERTURA).
 *   - `countIndexableInventory` drives ONLY the `robots:` decision on the town,
 *     town-pagination, province, and province-pagination pages. It is gated on
 *     `SITEMAP_INVENTORY_STATUSES` — the EXACT status set the sitemap's
 *     `activeMunicipalityPairs()` / `provincesWithInventory()` use — so a page
 *     the sitemap advertises can never say `noindex`, and vice-versa.
 *
 * WHY THE TWO CAN'T BE ONE. On 2026-08-05 the hub-count unification collapsed
 * the indexing signal onto the display bucket, silently dropping upcoming towns
 * out of the index while the sitemap kept advertising them — the mixed signal
 * that grew "Excluded by noindex" to ~1,305 in GSC. Keeping the robots count on
 * the SAME constant the sitemap reads is the drift-proofing (see the drift
 * test, `page-data.indexability-drift.test.ts`).
 *
 * PREDICATE: `status ∈ SITEMAP_INVENTORY_STATUSES` (active + upcoming) AND
 * `inScope = true` (the soft-hide gate every catalog surface shares). NO clock
 * guard — mirrors how the sitemap treats these rows: a PROXIMA_APERTURA row
 * with a null/stale `endsAt` is still genuinely upcoming inventory and must
 * keep its page indexable, exactly as the sitemap keeps its `<loc>`.
 */
export function indexableWhere({ province, auctionTypeKeys, category, municipality }: CountInput): Prisma.AuctionWhereInput {
  const where: Prisma.AuctionWhereInput = {
    status: { in: SITEMAP_INVENTORY_STATUSES },
    inScope: true,
  };
  if (province) where.province = province;
  if (auctionTypeKeys && auctionTypeKeys.length > 0) where.auctionType = { in: auctionTypeKeys };
  if (category) where.category = category;
  if (municipality) {
    // MUNI-A: an array is the set of raw spellings that fold onto one INE town.
    where.municipality = Array.isArray(municipality) ? { in: municipality } : municipality;
  }
  return where;
}

async function _countIndexable(args: CountInput): Promise<number> {
  return prisma.auction.count({ where: indexableWhere(args) });
}

/** Memoised indexability count (60s — same TTL as the display count). */
export const countIndexableInventory = unstable_cache(
  _countIndexable,
  ['seo-indexable-count'],
  { revalidate: 60, tags: ['seo-counts'] },
);

/**
 * ⭐ PHASE B (Forge 2026-08-24, Dennis-approved B1) — concluded-with-result
 * count for the "finished-only town" indexability tier.
 *
 * Reuses the SINGLE-SOURCE-OF-TRUTH concluded predicate
 * (`concludedIndexableWhere` in `@/lib/seo/concluded-indexable`) — the SAME
 * fragment the sitemap membership query and the concluded DETAIL-page robots
 * gate use, so a town this count marks indexable is composed entirely of rows
 * the sitemap already trusts (no new predicate to drift). AND-ed with the
 * `inScope` soft-hide gate every catalog surface shares, plus the town/province
 * scope.
 *
 * WHY A SEPARATE COUNT. `countIndexableInventory` (active+upcoming) drives the
 * existing town/province robots decision; this adds the finished dimension.
 * The town robots decision becomes `countIndexableInventory > 0 OR
 * countConcludedIndexable > 0` (see `isSeoIndexable`), so a town with ONLY
 * finished-with-result inventory now indexes — but ONLY because the content
 * block (below) renders that inventory as real crawlable HTML, so the page is
 * never thin. A truly-zero-history town (both counts 0) stays noindex.
 */
async function _countConcludedIndexable({ province, municipality }: CountInput): Promise<number> {
  const where: Prisma.AuctionWhereInput = {
    ...concludedIndexableWhere(),
    inScope: true,
  };
  if (province) where.province = province;
  if (municipality) {
    where.municipality = Array.isArray(municipality) ? { in: municipality } : municipality;
  }
  return prisma.auction.count({ where });
}

/** Memoised concluded-with-result count (60s — same TTL as the other counts). */
export const countConcludedIndexable = unstable_cache(
  _countConcludedIndexable,
  ['seo-concluded-indexable-count'],
  { revalidate: 60, tags: ['seo-counts'] },
);

/**
 * ⭐ THE SHARED town/province robots decision (Phase B). Index a location iff it
 * carries ANY renderable inventory — active/upcoming (the sitemap inventory
 * set) OR finished-with-result (the concluded-indexable set). noindex ONLY when
 * BOTH are zero: a truly-empty location with no auction in any status, ever.
 *
 * ONE helper, used by the town page, the province page, and their metadata, so
 * the gate can never fork between the `robots:` meta and the content it guards.
 */
export function isSeoIndexable(indexableCount: number, concludedCount: number): boolean {
  return indexableCount > 0 || concludedCount > 0;
}

async function _findActive(args: CountInput & { take: number }) {
  const where: Prisma.AuctionWhereInput = { status: { in: ACTIVE_STATUSES } };
  if (args.province) where.province = args.province;
  if (args.auctionTypeKeys && args.auctionTypeKeys.length > 0) where.auctionType = { in: args.auctionTypeKeys };
  if (args.category) where.category = args.category;
  return prisma.auction.findMany({
    where,
    orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
    take: args.take,
    select: {
      id: true,
      title: true,
      category: true,
      province: true,
      municipality: true,
      status: true,
      auctionType: true,
      currentBid: true,
      minimumBid: true,
      appraisalValue: true,
      endsAt: true,
      publishedAt: true,
      imageUrl: true,
      latitude: true,
      longitude: true,
    },
  });
}

export const findActiveAuctions = unstable_cache(
  _findActive,
  ['seo-active-list'],
  { revalidate: 60, tags: ['seo-counts'] },
);

// ---------------------------------------------------------------------------
// P1 + P2 (SEO crawl-path unlock, 2026-07-31) — server-rendered, PAGINATED,
// scope-gated auction slice for the hub/listing pages.
//
// WHY: the hub pages (/subastas, /subastas/<prov>, /subastas/<prov>/<muni>,
// /subastas/tipo/<t>) render their auction cards CLIENT-side from
// /api/auctions, which robots blocks (Disallow: /api/). Googlebot therefore
// saw ZERO crawlable <a href> to any detail page → the ~active detail pages
// were sitemap-only orphans. This helper lets the SERVER component render the
// cards as real anchors in the initial HTML + drive path-based pagination.
//
// SCOPE GATE: ANDs `inScope = true` (wave155 soft-hide) so hidden/junk rows
// never surface — the SAME predicate every other catalog surface uses. Status
// gate is the SEO ACTIVE set (matches the detail page's index gate + sitemap),
// so a linked auction is always an indexable page (no crawl-path to noindex).
// ---------------------------------------------------------------------------

/** Cards per hub page. Kept modest so SSR of a hub never blows up render. */
export const SEO_PAGE_SIZE = 24;

/** One card's worth of columns — matches SeoAuctionGrid's Row shape. */
const SEO_CARD_SELECT = {
  id: true,
  title: true,
  category: true,
  province: true,
  municipality: true,
  status: true,
  auctionType: true,
  currentBid: true,
  minimumBid: true,
  appraisalValue: true,
  valorSubasta: true,
  claimedAmount: true,
  endsAt: true,
  // Not rendered on the card — it is the SECONDARY sort key of the `active_first`
  // ordering (status tier, then publishedAt DESC), so it has to be selected for
  // the hub list to sort the same way the client list does.
  publishedAt: true,
  // Ungated (Dennis 2026-07-31): auction data is fully public — the card shows
  // the real street address, no registration wall.
  address: true,
} satisfies Prisma.AuctionSelect;

/**
 * One SSR card row, PLUS the detail path it should link at.
 *
 * ⭐ `detailPath` is ADDITIVE (Forge 2026-08-05). Nothing was removed from the
 * select; the field is appended after the DB read and every consumer that does
 * not know about it is unaffected.
 *
 * WHY IT IS ON THE ROW. The v3 url lives in the unmanaged `auction_url_v3`
 * table, so only a server context can resolve it. The SSR grid used to build
 * `/subastas/subasta/${buildAuctionSlug(a)}` itself — a hardcoded LEGACY path
 * that never consulted the mint table, so with URL_V3_SWITCH=1 every internal
 * link on every hub still pointed at the pre-flip URL while the detail page it
 * landed on canonicalised to v3. Google re-crawling post-flip would read those
 * as the site's own vote for the legacy URLs.
 */
/** The raw DB payload, BEFORE the detail path is resolved onto it. */
export type ScopedAuctionRow = Prisma.AuctionGetPayload<{ select: typeof SEO_CARD_SELECT }>;

export type ScopedAuctionCard = ScopedAuctionRow & {
  /** Resolved detail path — the minted v3 url, or the legacy path when unminted. */
  detailPath: string;
};

export type ScopedAuctionPage = {
  rows: ScopedAuctionCard[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
};

/**
 * ⭐ THE CLOCK GUARD, Prisma form (Ken, 2026-08-04).
 *
 * Twin of `ACTIVE_CLOCK_GUARD_SQL` in `@/lib/auction-status` — same rule, same
 * null-safety, expressed for a Prisma `where`:
 *
 *     endsAt IS NULL OR endsAt > now()
 *
 * WHY IT IS HERE. The hub list is ordered by status tier, but membership was
 * status-only, and a stored status can be STALE — the scheduler sweep lags, so
 * rows still marked PROXIMA_APERTURA sit in the table with an `endsAt` years in
 * the past. Under the previous `endsAt ASC` ordering those rows sorted to
 * position 1, and `/subastas/madrid` opened with auctions that ended in **2011
 * and 2014**. Four such rows corpus-wide occupied the top slots of three
 * province hubs plus the Madrid town hub — the most valuable real estate on the
 * site, showing dead inventory.
 *
 * Null-safe deliberately: a row with no `endsAt` (the BOE has not published an
 * end timestamp, common for PROXIMA_APERTURA) is still genuinely upcoming and
 * must NOT be filtered out. That is also why the old ordering was wrong in the
 * other direction — Postgres sorts NULLs last under ASC, so 48 active rows,
 * including CELEBRANDOSE auctions being held *right now*, sank to the bottom.
 * Ordering by status tier instead of by `endsAt` dissolves that entirely.
 *
 * 2026-08-05: this local twin is GONE. It now lives once, in
 * `activeClockGuardPrisma` (@/lib/auction-status), and reaches this file via
 * `whenBucketWherePrisma('activas')` — a hand-copied predicate is exactly the
 * thing that drifts, and this file already had one such copy (`ACTIVE_STATUSES`)
 * that had drifted from the API's set in both directions.
 */

function scopedWhere({ province, auctionTypeKeys, category, municipality }: CountInput): Prisma.AuctionWhereInput {
  // Status set + scope gate + clock guard all come from ONE place. Scope
  // filters are spread on top; nothing here re-declares the predicate.
  const where: Prisma.AuctionWhereInput = {
    ...whenBucketWherePrisma('activas'),
  } as Prisma.AuctionWhereInput;
  if (province) where.province = province;
  if (auctionTypeKeys && auctionTypeKeys.length > 0) where.auctionType = { in: auctionTypeKeys };
  if (category) where.category = category;
  if (municipality) {
    // MUNI-A: an array is the set of raw spellings that fold onto one INE town.
    where.municipality = Array.isArray(municipality) ? { in: municipality } : municipality;
  }
  return where;
}

async function _findScopedAuctionsPage(
  args: CountInput & { page: number; pageSize?: number },
): Promise<ScopedAuctionPage> {
  const pageSize = args.pageSize && args.pageSize > 0 ? Math.floor(args.pageSize) : SEO_PAGE_SIZE;
  const page = Number.isFinite(args.page) && args.page > 0 ? Math.floor(args.page) : 1;
  const where = scopedWhere(args);

  // ⭐ ORDERING NOW MATCHES THE CLIENT LIST EXACTLY (Ken, 2026-08-04).
  //
  // Was `endsAt ASC, id ASC` — soonest-closing first. The hydrated list
  // (`SubastasListClient` -> /api/auctions) has defaulted to `active_first`
  // since wave173, so the crawlable block and the list a user ends up looking
  // at were ordered by different rules on the same page. Googlebot only ever
  // sees the SSR order, and the URL-v3 flip is the worst possible moment to
  // have the bot and the user disagree about what a hub's best content is.
  //
  // The rule is: status tier (active -> upcoming -> finished), then
  // `publishedAt` DESC, then `id` DESC — identical to /api/auctions' SORT_MAP
  // entry for `active_first`.
  //
  // Prisma cannot express a CASE in `orderBy`. Rather than write a second,
  // raw-SQL copy of the membership predicate — which would be a second thing to
  // drift, the exact defect this change exists to remove — the tier is applied
  // in JS from `isActiveStatus` / `isPreAuctionStatus`: the SAME two predicates
  // `buildActiveFirstCaseSql` builds its CASE from, in the same module that
  // owns the status sets. One definition of "active", one of "upcoming", used
  // by both surfaces.
  //
  // Sorting in memory is safe here because a hub scope is small: 853 active
  // rows corpus-wide, at most 103 in the largest province. This is not a
  // 240k-row sort, and `scopedWhere` still does all the filtering in Postgres.
  const [total, matching] = await Promise.all([
    prisma.auction.count({ where }),
    prisma.auction.findMany({ where, select: SEO_CARD_SELECT }),
  ]);

  const tier = (status: unknown): number => {
    if (isActiveStatus(status as string)) return 0;
    if (isPreAuctionStatus(status as string)) return 1;
    return 2;
  };
  const publishedMs = (r: ScopedAuctionRow): number =>
    r.publishedAt instanceof Date ? r.publishedAt.getTime() : Number.NEGATIVE_INFINITY;

  const sorted = [...matching].sort((a, b) => {
    const t = tier(a.status) - tier(b.status);
    if (t !== 0) return t;
    const p = publishedMs(b) - publishedMs(a); // publishedAt DESC, nulls last
    if (p !== 0) return p;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // id DESC — the same tiebreak
  });

  const slice = sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  // ⭐ ONE batched probe per page — never per row (Forge 2026-08-05).
  //
  // `fetchV3UrlsBatch` is a single `= ANY(...)` against the `auction_url_v3`
  // primary key for the <=24 ids actually being rendered, AFTER the slice, so a
  // 103-row province still costs exactly one extra query. It returns an empty
  // map when the switch is off, so this adds zero query load pre-flip.
  //
  // Rows missing from the map fall back to the legacy path via
  // `resolveAuctionPath` — the correct answer for a held / degraded /
  // quarantined / hex-legacy auction, which must keep linking somewhere that
  // 200s rather than 404.
  const v3 = await fetchV3UrlsBatch(slice.map((r) => r.id));
  const rows: ScopedAuctionCard[] = slice.map((r) => ({
    ...r,
    detailPath: resolveAuctionPath(r, v3.get(r.id) ?? null),
  }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { rows, total, totalPages, page, pageSize };
}

/**
 * Scope-gated, paginated auction slice for a hub page. Cached 60s (the counts
 * cache TTL) — keyed by the full args object (filter + page) so every hub +
 * page combination memoises independently.
 */
export const findScopedAuctionsPage = unstable_cache(
  _findScopedAuctionsPage,
  ['seo-scoped-auctions-page'],
  { revalidate: 60, tags: ['seo-counts'] },
);

// ---------------------------------------------------------------------------
// ⭐ PHASE B — the finished-only town CONTENT BLOCK data (Forge 2026-08-24).
//
// PURPOSE (dual). (1) Anti-thin: a town indexed on finished-only inventory must
// carry a genuine server-rendered content block or it is a thin page. (2)
// Anti-SSR-gap: the existing `findScopedAuctionsPage` is bound to the `activas`
// bucket, so an upcoming-only OR finished-only town renders ZERO server-side
// anchors to detail pages — Googlebot sees no internal crawl path. This block
// emits REAL crawlable <a href> to detail pages for BOTH cases.
//
// It fetches TWO scoped, capped, SSR-anchored slices:
//   - upcoming teaser  — the `proximas` bucket (PRE_AUCTION), the same set the
//                        sitemap inventory count already trusts.
//   - recent results   — `concludedIndexableWhere()` (the single-source concluded
//                        predicate), most-recent first, capped ~10. TEASER ONLY:
//                        capped so the town page never becomes a second full
//                        archive competing with /resultados (see the cap).
// ---------------------------------------------------------------------------

/** Cap on each content-block section — a teaser, never a full archive. */
export const SEO_TOWN_CONTENT_CAP = 10;

/** One concluded-results card — the SSR card columns PLUS the outcome fields. */
const SEO_CONCLUDED_CARD_SELECT = {
  ...SEO_CARD_SELECT,
  saleResult: true,
  soldPrice: true,
  soldDate: true,
} satisfies Prisma.AuctionSelect;

type ConcludedResultRow = Prisma.AuctionGetPayload<{ select: typeof SEO_CONCLUDED_CARD_SELECT }>;

/** One concluded-results card as rendered — outcome fields + resolved link. */
export type ConcludedResultCard = ScopedAuctionCard & {
  saleResult: string | null;
  /** Winning bid in CENTS (BigInt in the DB → number here so the row is
   * JSON-serialisable across the `unstable_cache` boundary). NULL for DESIERTA. */
  soldPriceCents: number | null;
  soldDate: Date | null;
};

/** The whole town content block payload. */
export type TownContentBlock = {
  upcoming: ScopedAuctionCard[];
  concluded: ConcludedResultCard[];
};

/** Scope spread shared by both content-block queries (province + MUNI-A muni). */
function applyScope(where: Prisma.AuctionWhereInput, { province, municipality }: CountInput): void {
  if (province) where.province = province;
  if (municipality) {
    where.municipality = Array.isArray(municipality) ? { in: municipality } : municipality;
  }
}

/** Resolve v3/legacy detail paths for a set of rows in ONE batched probe. */
async function resolveDetailPaths<T extends { id: string; auctionType: string | null; province: string | null; municipality: string | null }>(
  rows: T[],
): Promise<Array<T & { detailPath: string }>> {
  const v3 = await fetchV3UrlsBatch(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, detailPath: resolveAuctionPath(r, v3.get(r.id) ?? null) }));
}

async function _findTownContentBlock(args: CountInput): Promise<TownContentBlock> {
  // Section A — upcoming teaser (PRE_AUCTION), scope-gated, capped. Soonest
  // opening first (endsAt asc, nulls last), id tiebreak.
  const upcomingWhere = { ...whenBucketWherePrisma('proximas') } as Prisma.AuctionWhereInput;
  applyScope(upcomingWhere, args);

  // Section B — recent finished-with-result, via the SINGLE-SOURCE concluded
  // predicate (result-checked, indexable category, sold/deserted, recency
  // floor) + scope + soft-hide. Most recent first (endsAt desc), capped.
  const concludedWhere: Prisma.AuctionWhereInput = { ...concludedIndexableWhere(), inScope: true };
  applyScope(concludedWhere, args);

  const [upcomingRaw, concludedRaw] = await Promise.all([
    prisma.auction.findMany({
      where: upcomingWhere,
      select: SEO_CARD_SELECT,
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
      take: SEO_TOWN_CONTENT_CAP,
    }),
    prisma.auction.findMany({
      where: concludedWhere,
      select: SEO_CONCLUDED_CARD_SELECT,
      orderBy: [{ endsAt: 'desc' }, { id: 'desc' }],
      take: SEO_TOWN_CONTENT_CAP,
    }),
  ]);

  const upcoming = await resolveDetailPaths(upcomingRaw);
  const concludedLinked = await resolveDetailPaths(concludedRaw as ConcludedResultRow[]);
  const concluded: ConcludedResultCard[] = concludedLinked.map(({ soldPrice, ...r }) => ({
    ...r,
    saleResult: r.saleResult == null ? null : String(r.saleResult),
    // BigInt → number for cross-cache serialisation. `soldPrice` (BigInt CENTS)
    // is DESTRUCTURED OUT of the spread above so the raw BigInt can NEVER survive
    // into the returned object. It used to ride along in `...r`: the map added
    // `soldPriceCents` but left the raw `soldPrice` BigInt on the row, so on any
    // town/province page with a concluded SOLD result `unstable_cache` threw
    // "Do not know how to serialize a BigInt" while serialising this value —
    // surfacing as a recurring `unhandledRejection` on the background cache write
    // (wave206). Cents are well within Number.MAX_SAFE_INTEGER (a winning bid in
    // cents never approaches 9e15), so Number() is exact — same choice as the
    // detail payload's soldPriceSafe.
    soldPriceCents: soldPrice == null ? null : Number(soldPrice),
    soldDate: r.soldDate ?? null,
  }));

  return { upcoming, concluded };
}

/**
 * Fetch the finished-only town content block. Cached 60s (the counts TTL),
 * keyed by the full args object so every town memoises independently.
 */
export const findTownContentBlock = unstable_cache(
  _findTownContentBlock,
  ['seo-town-content-block'],
  { revalidate: 60, tags: ['seo-counts'] },
);

/** Resolve a tipo slug to its DB auctionType keys. */
export function tipoSlugToDbKeys(slug: TipoSlug): string[] {
  return TIPO_SLUG_TO_DB_KEYS[slug] ?? [];
}

/** Minimum starting price across active auctions for a given filter (Euros). */
async function _minStartingPrice({ province, auctionTypeKeys, category, municipality }: CountInput): Promise<number | null> {
  // Same predicate as `countActiveAuctions` — the "desde X €" line and the
  // count sit in the SAME intro sentence, so they must be computed over the
  // same rows. This previously omitted `inScope` AND the clock guard, so the
  // advertised floor price could come from a row the count did not include.
  // `AND`-ed rather than spread so the bucket's own `OR` (the clock guard) is
  // not clobbered by the price `OR`.
  const where: Prisma.AuctionWhereInput = {
    AND: [
      whenBucketWherePrisma('activas') as Prisma.AuctionWhereInput,
      { OR: [{ minimumBid: { gt: 0 } }, { currentBid: { gt: 0 } }] },
    ],
  };
  if (province) where.province = province;
  if (auctionTypeKeys && auctionTypeKeys.length > 0) where.auctionType = { in: auctionTypeKeys };
  if (category) where.category = category;
  if (municipality) {
    // MUNI-A: an array is the set of raw spellings that fold onto one INE town.
    where.municipality = Array.isArray(municipality) ? { in: municipality } : municipality;
  }
  const row = await prisma.auction.aggregate({
    where,
    _min: { minimumBid: true, currentBid: true },
  });
  const candidates = [row._min.minimumBid, row._min.currentBid].filter((v): v is number => typeof v === 'number' && v > 0);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

export const minStartingPrice = unstable_cache(_minStartingPrice, ['seo-min-price'], { revalidate: 300 });

/**
 * Town directory for a province (province SEO page "Por municipio" section +
 * town-page sibling cluster). Returns ONE row per clean town in the province
 * with ≥1 auction of ANY status (town-pages Phase 2 — finished-only towns are
 * real pages now), but `count` stays the ACTIVE count (the user-facing live
 * signal; 0 is a legitimate value for finished-only towns).
 *
 * Junk names (null/empty/"desconocida") filtered out — matches the cleanup
 * the home ProvinceGrid does client-side, kept consistent server-side here.
 *
 * Wave 56: each row carries the canonical `municipioSlug` so the province
 * page can link straight at the new town URL `/subastas/{prov}/{muni}`.
 * Per-slug collisions are folded to the highest-TOTAL-count casing — same
 * rule `municipalitySlugToDbName` uses — keeping the link cluster and the
 * resolver in lockstep.
 */
async function _municipalitiesInProvince(
  province: string,
  /** Cache-key discriminator only — see `municipalitiesInProvince`. */
  _whitelist: string,
): Promise<Array<{ name: string; count: number; municipioSlug: string }>> {
  const [allRows, activeRows] = await Promise.all([
    prisma.auction.groupBy({
      by: ['municipality'],
      where: { province },
      _count: { _all: true },
    }),
    prisma.auction.groupBy({
      by: ['municipality'],
      // The per-town chip counts link straight at the town hubs, so they must
      // count what those hubs will show: the SAME activas bucket (status set +
      // inScope + clock guard) the province count and cards use.
      where: { ...(whenBucketWherePrisma('activas') as Prisma.AuctionWhereInput), province },
      _count: { _all: true },
    }),
  ]);
  const activeByName = new Map<string, number>();
  for (const r of activeRows) {
    const name = (r.municipality ?? '').trim();
    if (name) activeByName.set(name, r._count?._all ?? 0);
  }
  // Fold per-slug collisions in two passes so we don't double-count:
  //   1. Sum total ANY-status count + ACTIVE count per slug.
  //   2. Pick the highest-individual-TOTAL-count DB casing as the display
  //      name (mirrors `municipalitySlugToDbName`'s resolution so the link
  //      cluster and the town-page resolver agree on the same canonical
  //      DB name).
  // ⛔ GAZETTEER-GATED (Ken's MUNI-A ruling) — see `@/lib/registro/archive-municipality`.
  // This cluster mints links at `/subastas/{prov}/{muni}`, and those pages now
  // resolve through the same gate, so an ungated chip here would link straight
  // at a 404. Names are canonicalised to the INE denomination and every spelling
  // of one town folds onto one chip; unresolved names produce no chip at all.
  //
  // ⛔ …BUT ONLY WHEN THE SWITCH IS ON (MUNI-A2). This function does not mint a
  // URL, it mints the CHIP CLUSTER on `/subastas/{prov}` — a page that ships
  // today. Applying the whitelist while dark silently deletes every junk chip
  // from a live page, which is a visible content change with the flag off. It
  // also has to move in lockstep with `distinctMunicipalitiesInProvince` above:
  // if the chips were gated and the resolver were not (or vice versa) the hub
  // would link towns that 404, or hide towns that serve — which is the exact
  // link/resolver disagreement MUNI-A's one-resolution-point rule exists to
  // prevent. One switch, read in both places, keeps them in step in BOTH states.
  if (archiveWhitelistActive()) {
    type Acc = { name: string; activeTotal: number; municipioSlug: string };
    const byIne = new Map<string, Acc>();
    for (const r of allRows) {
      const name = (r.municipality ?? '').trim();
      if (!name) continue;
      const town = resolveArchiveMunicipality(province, name);
      if (!town) continue;
      const active = activeByName.get(name) ?? 0;
      const prev = byIne.get(town.ine);
      if (prev) prev.activeTotal += active;
      else byIne.set(town.ine, { name: town.name, activeTotal: active, municipioSlug: town.slug });
    }
    return Array.from(byIne.values())
      .map((a) => ({ name: a.name, count: a.activeTotal, municipioSlug: a.municipioSlug }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  }

  // ── DARK: the pre-MUNI-A body, reproduced exactly. 🗑️ Delete at the flip. ──
  // Note the asymmetry, which is original and load-bearing: `activeTotal` SUMS
  // across the spellings that share a slug, but the display `name` is the one
  // with the highest ANY-STATUS count. Folding those two the same way would
  // change the chip labels on a live page.
  type LegacyAcc = { name: string; topCount: number; activeTotal: number; municipioSlug: string };
  const bySlug = new Map<string, LegacyAcc>();
  for (const r of allRows) {
    const name = (r.municipality ?? '').trim();
    if (!name) continue;
    const lc = name.toLowerCase();
    if (lc === 'null' || lc === 'undefined' || lc === 'desconocida') continue;
    const municipioSlug = slugify(name);
    if (!municipioSlug) continue;
    const count = r._count?._all ?? 0;
    const active = activeByName.get(name) ?? 0;
    const prev = bySlug.get(municipioSlug);
    if (!prev) {
      bySlug.set(municipioSlug, { name, topCount: count, activeTotal: active, municipioSlug });
    } else {
      prev.activeTotal += active;
      if (count > prev.topCount) {
        prev.name = name;
        prev.topCount = count;
      }
    }
  }
  return Array.from(bySlug.values())
    .map((a) => ({ name: a.name, count: a.activeTotal, municipioSlug: a.municipioSlug }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

const municipalitiesInProvinceCached = unstable_cache(
  _municipalitiesInProvince,
  // Key bumped (town-pages Phase 2) — semantics widened from active-only to
  // any-status towns; a stale active-only cache must not hide finished towns.
  ['seo-municipalities-by-province-anystatus'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/**
 * Public signature UNCHANGED for callers; the switch state rides along as a
 * second argument purely so it lands in the `unstable_cache` key. See
 * `distinctMunicipalitiesCached` for why a shared key across the two states
 * would make the flip take up to 300s instead of being instant.
 */
export function municipalitiesInProvince(province: string) {
  return municipalitiesInProvinceCached(province, archiveWhitelistCacheKey());
}

/** Slugs of the indexable provinces that actually have inventory (for sitemap). */
export async function provincesWithInventory(): Promise<Set<string>> {
  const rows = await prisma.auction.findMany({
    where: { status: { in: SITEMAP_INVENTORY_STATUSES } },
    select: { province: true },
    distinct: ['province'],
  });
  return new Set(rows.map((r) => r.province as string));
}

// ---------------------------------------------------------------------------
// Wave 56 — municipality slug resolver + pairs helpers.
//
// `municipalitySlugToDbName(provinceDbKey, slug)`: given a province's DB key
// and a URL slug for a municipality, return the canonical DB municipality
// name. Implementation: scan distinct municipality names within that province
// (ANY status — town-pages Phase 2: towns with only finished inventory are
// real pages too, gated noindex,follow by the page's robots rule), slugify
// each, match. On per-slug collision pick the highest-count variant
// ("most-frequent casing wins"). Cached per-province (300s) since the
// universe is small.
// ---------------------------------------------------------------------------

/**
 * The province's real towns — MUNI-A: gated by the INE register through the
 * archive's ONE resolution point (see `@/lib/registro/archive-municipality`),
 * never `DISTINCT(municipality)` over the raw corpus. `name` is the register's
 * official denomination; `dbNames` are the raw spellings to query with.
 */
async function _distinctMunicipalitiesInProvince(
  provinceDbKey: string,
  /** Cache-key discriminator only — see `distinctMunicipalitiesCached`. */
  _whitelist: string,
): Promise<Array<{ name: string; slug: string; count: number; dbNames: string[] }>> {
  const rows = await prisma.auction.groupBy({
    by: ['municipality'],
    where: { province: provinceDbKey },
    _count: { _all: true },
  });
  const folded = foldMunicipalitiesForLegacySurface(
    provinceDbKey,
    rows.map((r) => ({ name: r.municipality, total: r._count?._all ?? 0 })),
  );
  return folded.map((m) => ({ name: m.name, slug: m.slug, count: m.total, dbNames: m.dbNames }));
}

const distinctMunicipalitiesInProvince = unstable_cache(
  _distinctMunicipalitiesInProvince,
  // Key bumped (town-pages Phase 2) — was 'seo-distinct-municipalities-in-
  // province' with active-only semantics; a stale cache must not 404 towns
  // post-deploy.
  ['seo-distinct-municipalities-in-province-anystatus'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/**
 * ⚠️ The `whitelist` argument is not used by the callee — it is a CACHE KEY.
 *
 * `unstable_cache` keys on the static key array PLUS the arguments, so a value
 * computed while dark would otherwise still be served after the flip (and vice
 * versa on a rollback) until the 300s revalidate expired. Ken's rollback budget
 * is one minute; a five-minute stale town list is not compatible with that.
 * Threading the switch state through as an argument makes the two states
 * physically different cache entries, so a flip is instant in both directions.
 */
function distinctMunicipalitiesCached(provinceDbKey: string) {
  return distinctMunicipalitiesInProvince(provinceDbKey, archiveWhitelistCacheKey());
}

/**
 * Resolve a municipality slug to its canonical town name within a province.
 * Returns null when the slug is not a real (INE-registered) town of that
 * province with ≥1 auction of any status.
 *
 * ⚠️ MUNI-A: the returned name is the INE OFFICIAL denomination — a DISPLAY
 * name. It may match no stored `Auction.municipality` value, so it must NOT be
 * used in a `where` clause; use `municipalityDbNamesForSlug` for that.
 */
export async function municipalitySlugToDbName(
  provinceDbKey: string,
  municipalitySlug: string,
): Promise<string | null> {
  if (!provinceDbKey || !municipalitySlug) return null;
  const rows = await distinctMunicipalitiesCached(provinceDbKey);
  return rows.find((r) => r.slug === municipalitySlug)?.name ?? null;
}

/**
 * The raw DB spellings behind a town slug — what a `where` clause must use
 * (`municipality: { in: … }`). Empty when the slug is not a real town.
 */
export async function municipalityDbNamesForSlug(
  provinceDbKey: string,
  municipalitySlug: string,
): Promise<string[]> {
  if (!provinceDbKey || !municipalitySlug) return [];
  const rows = await distinctMunicipalitiesCached(provinceDbKey);
  return rows.find((r) => r.slug === municipalitySlug)?.dbNames ?? [];
}

// ---------------------------------------------------------------------------
// Town-BROWSE slug redirect resolver (Forge 2026-08-26, Dennis-approved).
//
// THE GAP: `/subastas/{prov}/{town}` had no 301/alias layer. When the town-slug
// normalization moved a town's canonical slug (Jávea→Xàbia, Sagunto→Sagunt,
// Ibiza→Eivissa, Alcoy→Alcoi, "Donostia/San Sebastián"→donostia, …) the OLD
// crawled slug started hard-404ing, while the property-DETAIL layer got its
// `auction_url_v3_alias` 308s. GSC surfaced ~114 such town-browse 404s.
//
// THE FIX — reverse-resolution, NOT a hardcoded list. Two deterministic signals,
// both derived from the SAME data the live resolver uses, so the map stays
// correct as the corpus and gazetteer grow:
//
//   1. CORPUS REVERSE MAP. Every live town carries `dbNames` — the raw
//      `Auction.municipality` spellings the INE gazetteer folded onto it. The
//      OLD url slug for any of those spellings is `slugify(rawName)`. So
//      `slugify(rawName) -> town.currentSlug` is the exact inverse of the fold:
//      "Javea"→xabia, "Sagunto"→sagunt, "Ibiza"→eivissa, "Alcoy"/"Alcoi-Alcoy"→
//      alcoi, "Donostia/San Sebastián"→donostia. No town names are hardcoded —
//      this is generated from whatever spellings the corpus currently holds.
//
//   2. COMPOUND-SEGMENT REDUCTION. Historical slugs the corpus no longer holds
//      verbatim are address/compound artifacts — a real town slug wearing an
//      extra segment: `llucmajor-palma`, `o-porto-do-son`, `saladillo-estepona`,
//      `donostia-san-sebastian`. We progressively drop trailing THEN leading
//      hyphen segments (longest candidate first) and accept the first candidate
//      that is itself a LIVE town slug (or a corpus-map key). `-palma` peels off
//      Llucmajor; the leading `o-` article peels off Porto do Son; the neighbourhood
//      prefix `saladillo-` peels off Estepona.
//
// Every returned town target is a slug that resolves 200 by construction (it
// came from the live town set), so a 301 can never land on a 404, and the target
// is canonical so it never itself redirects — max chain length is structurally 1.
// A slug that matches neither signal is a typo / address fragment / wrong-province
// junk: it 301s to the PROVINCE page (which always exists), never a hard 404.
// The caller reserves 404 for an INVALID province.
//
// SWITCH-AGNOSTIC BY CONSTRUCTION: the map is read from `distinctMunicipalitiesCached`,
// the very set that decides what answers 200, so it tracks the whitelist flip in
// lockstep with the pages themselves — no `URL_V4_SWITCH` gate is needed. A slug
// that answers 200 today never reaches this resolver (the page renders first), so
// no live 200 can be turned into a redirect (the dark-redirect regression Ken
// rolled back on `/resultados` cannot occur here).
// ---------------------------------------------------------------------------

// Known name-VARIANT aliases the corpus reverse-map cannot produce because the
// corpus never held the variant spelling verbatim — a rename / exonym, NOT an
// accent fold (accent folds like Jávea→xabia come for free from `dbNames`).
// Keyed old-browse-slug -> current town slug. Seeded into `reverse` below ONLY
// when the target is a LIVE town in the province being resolved, so the
// invariants hold: the target 200s (no 301→404), and it is canonical so it never
// itself redirects (max chain length stays 1). A variant whose canonical is not
// live in this province is simply skipped and falls through to the province page,
// exactly as before — so this can only ADD a correct town hop, never break one.
const TOWN_SLUG_NAME_VARIANTS: Record<string, string> = {
  ibiza: 'eivissa', // Baleares — Castilian exonym for the official Catalan name Eivissa
  murguia: 'murgia', // Araba/Álava — old Castilian spelling of the official Murgia
};

/** Every legacy slug spelling for a slug's own segments, longest candidate first. */
function segmentReductions(slug: string): string[] {
  const segs = slug.split('-').filter(Boolean);
  if (segs.length < 2) return [];
  const out: string[] = [];
  // Drop trailing segments (llucmajor-palma -> llucmajor), then leading
  // segments (o-porto-do-son -> porto-do-son, saladillo-estepona -> estepona).
  // Longest candidate first so the most specific real town wins.
  for (let keep = segs.length - 1; keep >= 1; keep--) {
    out.push(segs.slice(0, keep).join('-')); // drop from the end
    out.push(segs.slice(segs.length - keep).join('-')); // drop from the start
  }
  // Dedup, preserve order, never return the input itself.
  return [...new Set(out)].filter((s) => s && s !== slug);
}

async function _townBrowseRedirectTarget(
  provinceDbKey: string,
  provinceSlug: string,
  municipalitySlug: string,
): Promise<string | null> {
  if (!provinceDbKey || !provinceSlug || !municipalitySlug) return null;
  const towns = await distinctMunicipalitiesCached(provinceDbKey);

  // Live canonical slugs (answer 200) + the corpus reverse map
  // (old-spelling-slug -> current-slug). Both derived from the SAME town set.
  const liveSlugs = new Set<string>();
  const reverse = new Map<string, string>();
  for (const t of towns) {
    liveSlugs.add(t.slug);
    for (const raw of t.dbNames) {
      const s = slugify(raw);
      if (!s) continue;
      // Old /subastas urls used bare `slugify`; the LIT resolver escapes reserved
      // segments. Key on both so a legacy slug matches regardless.
      for (const key of new Set([s, safeMunicipioSegment(s)])) {
        if (key && key !== t.slug && !reverse.has(key)) reverse.set(key, t.slug);
      }
    }
  }

  // Seed the known name-variant aliases (exonyms / old spellings the corpus
  // never held verbatim). Guarded on `liveSlugs.has(canonical)` so the target is
  // guaranteed to answer 200 in THIS province — a variant for another province's
  // town never matches here and harmlessly falls through to the province page.
  for (const [variant, canonical] of Object.entries(TOWN_SLUG_NAME_VARIANTS)) {
    if (liveSlugs.has(canonical) && !reverse.has(variant)) reverse.set(variant, canonical);
  }

  const toTown = (target: string) =>
    target && target !== municipalitySlug ? `/subastas/${provinceSlug}/${target}` : null;

  // 1. Exact corpus reverse-map hit (Jávea→xabia, Sagunto→sagunt, …).
  const direct = reverse.get(municipalitySlug);
  if (direct) {
    const t = toTown(direct);
    if (t) return t;
  }

  // 2. Compound-segment reduction (llucmajor-palma→llucmajor, o-porto-do-son→
  //    porto-do-son, saladillo-estepona→estepona). Accept the first candidate
  //    that is a live town slug or a known old spelling.
  for (const cand of segmentReductions(municipalitySlug)) {
    if (liveSlugs.has(cand)) {
      const t = toTown(cand);
      if (t) return t;
    }
    const mapped = reverse.get(cand);
    if (mapped) {
      const t = toTown(mapped);
      if (t) return t;
    }
  }

  // 3. Unresolvable town slug under a valid province -> the province page.
  //    Recovers crawl signal instead of a hard 404. The caller has already
  //    confirmed the province is real; an invalid province stays a 404.
  return `/subastas/${provinceSlug}`;
}

/**
 * Where a `/subastas/{prov}/{town}` request whose town slug does NOT resolve to a
 * live town page should be 301-redirected. Returns:
 *   - `/subastas/{prov}/{current-slug}` when the old slug reverse-resolves to a
 *     real, currently-live town (moved/renormalized slug), or
 *   - `/subastas/{prov}` (province page) when it cannot — typo, address fragment,
 *     wrong-province junk.
 * Never returns the input path (no self-loop); every town target answers 200.
 * Cached per-province, keyed by the whitelist state so a flip is instant.
 */
export function townBrowseRedirectTarget(
  provinceDbKey: string,
  provinceSlug: string,
  municipalitySlug: string,
): Promise<string | null> {
  return townBrowseRedirectTargetCached(
    provinceDbKey,
    provinceSlug,
    municipalitySlug,
    archiveWhitelistCacheKey(),
  );
}

const townBrowseRedirectTargetCached = unstable_cache(
  (provinceDbKey: string, provinceSlug: string, municipalitySlug: string, _whitelist: string) =>
    _townBrowseRedirectTarget(provinceDbKey, provinceSlug, municipalitySlug),
  ['seo-town-browse-redirect-target'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/**
 * Did this town slug EVER name a page — i.e. does some raw `Auction.municipality`
 * in this province slugify to it?
 *
 * Deliberately UNGATED by the gazetteer, and that is the whole point. It answers
 * a historical question ("was this URL live before MUNI-A?"), not a canonical
 * one ("is this a real municipality?"). The redirect layer needs both: a slug
 * the corpus produced is a retired page and must 301, while a slug nobody ever
 * minted — a typo in someone's address bar, a probe — must still 404. Without
 * this distinction the resolver 301s literally every unrecognised segment to the
 * province, which turns bogus URLs into soft-200s and destroys the 404 signal.
 */
async function _legacyMunicipalitySlugExists(
  provinceDbKey: string,
  municipalitySlug: string,
): Promise<boolean> {
  if (!provinceDbKey || !municipalitySlug) return false;
  const rows = await prisma.auction.groupBy({
    by: ['municipality'],
    where: { province: provinceDbKey },
    _count: { _all: true },
  });
  for (const r of rows) {
    const name = (r.municipality ?? '').trim();
    if (!name) continue;
    const s = slugify(name);
    if (s && safeMunicipioSegment(s) === municipalitySlug) return true;
  }
  return false;
}

export const legacyMunicipalitySlugExists = unstable_cache(
  _legacyMunicipalitySlugExists,
  ['seo-legacy-muni-slug-exists'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/**
 * Shared fold for the (provinceSlug, municipioSlug) pair helpers below.
 * MUNI-A: grouped by province and routed through the archive's one resolution
 * point, so only INE-registered towns of that province mint a pair — this feeds
 * the sitemap. Off-taxonomy provinces are still skipped.
 */
async function _municipalityPairs(where: Prisma.AuctionWhereInput): Promise<
  Array<{ provinceSlug: string; municipioSlug: string; count: number; municipalityName: string }>
> {
  const rows = await prisma.auction.groupBy({
    by: ['province', 'municipality'],
    where,
    _count: { _all: true },
  });

  const byProvince = new Map<string, Array<{ name: string | null; total: number }>>();
  for (const r of rows) {
    const provinceKey = (r.province ?? '').trim();
    if (!provinceKey) continue;
    let list = byProvince.get(provinceKey);
    if (!list) {
      list = [];
      byProvince.set(provinceKey, list);
    }
    list.push({ name: r.municipality, total: r._count?._all ?? 0 });
  }

  const out: Array<{
    provinceSlug: string;
    municipioSlug: string;
    count: number;
    municipalityName: string;
  }> = [];
  for (const [provinceKey, list] of byProvince) {
    const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[provinceKey];
    if (!provinceSlug) continue;
    // ⛔ SWITCH-GATED (MUNI-A2). These pairs are the v3 SITEMAP's town-page
    // entries. Whitelisting them while dark deletes ~7,100 `<loc>`s from the
    // live sitemap with the flag off — the single most visible dark change
    // available to us, and one Googlebot acts on within hours.
    for (const m of foldMunicipalitiesForLegacySurface(provinceKey, list)) {
      out.push({
        provinceSlug,
        municipioSlug: m.slug,
        count: m.total,
        municipalityName: m.name,
      });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * Pairs with ≥1 ACTIVE auction (legacy active-only view — kept exported for
 * call sites that want the live-inventory subset).
 */
const activeMunicipalityPairsCached = unstable_cache(
  (_whitelist: string) => _municipalityPairs({ status: { in: SITEMAP_INVENTORY_STATUSES } }),
  ['seo-active-municipality-pairs'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/** Switch state rides in the cache key — this feeds the SITEMAP. */
export function activeMunicipalityPairs() {
  return activeMunicipalityPairsCached(archiveWhitelistCacheKey());
}

/**
 * Town-pages Phase 2 — ALL clean (provinceSlug, municipioSlug) pairs with
 * ≥1 auction of ANY status. Used by the sitemap: every clean town page ships;
 * 0-active towns are noindex,follow at the page until inventory returns.
 * Same junk gates + collision fold as the active variant.
 */
const allMunicipalityPairsCached = unstable_cache(
  (_whitelist: string) => _municipalityPairs({}),
  ['seo-all-municipality-pairs'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/** Switch state rides in the cache key — this feeds the SITEMAP. */
export function allMunicipalityPairs() {
  return allMunicipalityPairsCached(archiveWhitelistCacheKey());
}

/** Active-count per category label (for sitemap / threshold check). */
export async function categoryActiveCounts(): Promise<Map<string, number>> {
  const rows = await prisma.auction.groupBy({
    by: ['category'],
    where: { status: { in: SITEMAP_INVENTORY_STATUSES } },
    _count: { _all: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.category) m.set(r.category, r._count?._all ?? 0);
  }
  return m;
}
