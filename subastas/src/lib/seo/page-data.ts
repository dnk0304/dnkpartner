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
// The canonical status predicates. `buildActiveFirstCaseSql` (used by
// /api/auctions) builds its ORDER BY CASE from these SAME two functions, which
// is what keeps the hub's SSR order and the client list's order from drifting.
import { isActiveStatus, isPreAuctionStatus } from '@/lib/auction-status';
import {
  TIPO_SLUG_TO_DB_KEYS,
  type TipoSlug,
  PROVINCE_DB_KEY_TO_SLUG,
  slugify,
} from './slugs';

/** "Active" auctions for the count-in-title — celebrandose + pre-auction. */
const ACTIVE_STATUSES: AuctionStatus[] = [
  AuctionStatus.ACTIVE,
  AuctionStatus.CELEBRANDOSE,
  AuctionStatus.PRE_AUCTION,
  AuctionStatus.PROXIMA_APERTURA,
];

type CountInput = {
  province?: string | null;
  auctionTypeKeys?: string[] | null;
  category?: string | null;
  /** Wave 56 — exact-DB-name municipality scope, paired with province. */
  municipality?: string | null;
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

export type ScopedAuctionCard = Prisma.AuctionGetPayload<{ select: typeof SEO_CARD_SELECT }>;

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
 */
function activeClockGuard(): Prisma.AuctionWhereInput {
  return { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] };
}

function scopedWhere({ province, auctionTypeKeys, category, municipality }: CountInput): Prisma.AuctionWhereInput {
  const where: Prisma.AuctionWhereInput = {
    status: { in: ACTIVE_STATUSES },
    inScope: true,
    ...activeClockGuard(),
  };
  if (province) where.province = province;
  if (auctionTypeKeys && auctionTypeKeys.length > 0) where.auctionType = { in: auctionTypeKeys };
  if (category) where.category = category;
  if (municipality) where.municipality = municipality;
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
  const publishedMs = (r: ScopedAuctionCard): number =>
    r.publishedAt instanceof Date ? r.publishedAt.getTime() : Number.NEGATIVE_INFINITY;

  const sorted = [...matching].sort((a, b) => {
    const t = tier(a.status) - tier(b.status);
    if (t !== 0) return t;
    const p = publishedMs(b) - publishedMs(a); // publishedAt DESC, nulls last
    if (p !== 0) return p;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // id DESC — the same tiebreak
  });

  const rows = sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
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

/** Resolve a tipo slug to its DB auctionType keys. */
export function tipoSlugToDbKeys(slug: TipoSlug): string[] {
  return TIPO_SLUG_TO_DB_KEYS[slug] ?? [];
}

/** Minimum starting price across active auctions for a given filter (Euros). */
async function _minStartingPrice({ province, auctionTypeKeys, category, municipality }: CountInput): Promise<number | null> {
  const where: Prisma.AuctionWhereInput = {
    status: { in: ACTIVE_STATUSES },
    OR: [{ minimumBid: { gt: 0 } }, { currentBid: { gt: 0 } }],
  };
  if (province) where.province = province;
  if (auctionTypeKeys && auctionTypeKeys.length > 0) where.auctionType = { in: auctionTypeKeys };
  if (category) where.category = category;
  if (municipality) where.municipality = municipality;
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
): Promise<Array<{ name: string; count: number; municipioSlug: string }>> {
  const [allRows, activeRows] = await Promise.all([
    prisma.auction.groupBy({
      by: ['municipality'],
      where: { province },
      _count: { _all: true },
    }),
    prisma.auction.groupBy({
      by: ['municipality'],
      where: { status: { in: ACTIVE_STATUSES }, province },
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
  type Acc = { name: string; topCount: number; activeTotal: number; municipioSlug: string };
  const bySlug = new Map<string, Acc>();
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

export const municipalitiesInProvince = unstable_cache(
  _municipalitiesInProvince,
  // Key bumped (town-pages Phase 2) — semantics widened from active-only to
  // any-status towns; a stale active-only cache must not hide finished towns.
  ['seo-municipalities-by-province-anystatus'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/** Slugs of the indexable provinces that actually have inventory (for sitemap). */
export async function provincesWithInventory(): Promise<Set<string>> {
  const rows = await prisma.auction.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
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

async function _distinctMunicipalitiesInProvince(
  provinceDbKey: string,
): Promise<Array<{ name: string; count: number }>> {
  const rows = await prisma.auction.groupBy({
    by: ['municipality'],
    where: { province: provinceDbKey },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ name: (r.municipality ?? '').trim(), count: r._count?._all ?? 0 }))
    .filter((r) => {
      if (!r.name) return false;
      const lc = r.name.toLowerCase();
      return lc !== 'null' && lc !== 'undefined' && lc !== 'desconocida';
    });
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
 * Resolve a municipality slug to its canonical DB name within a given
 * province. Returns null when no municipality (any status) in that province
 * matches. Collision-safe: if two casings fold to the same slug the
 * highest-count variant wins.
 */
export async function municipalitySlugToDbName(
  provinceDbKey: string,
  municipalitySlug: string,
): Promise<string | null> {
  if (!provinceDbKey || !municipalitySlug) return null;
  const rows = await distinctMunicipalitiesInProvince(provinceDbKey);
  let best: { name: string; count: number } | null = null;
  for (const row of rows) {
    if (slugify(row.name) === municipalitySlug) {
      if (!best || row.count > best.count) best = row;
    }
  }
  return best ? best.name : null;
}

/**
 * Shared fold for the (provinceSlug, municipioSlug) pair helpers below.
 * Folds casing collisions to a single canonical slug per pair (highest-count
 * variant wins) and skips any province not in `PROVINCE_DB_KEY_TO_SLUG`
 * (off-taxonomy junk) plus junk municipality names.
 */
async function _municipalityPairs(where: Prisma.AuctionWhereInput): Promise<
  Array<{ provinceSlug: string; municipioSlug: string; count: number; municipalityName: string }>
> {
  const rows = await prisma.auction.groupBy({
    by: ['province', 'municipality'],
    where,
    _count: { _all: true },
  });
  // Fold (provinceSlug, municipioSlug) collisions to highest-count variant.
  const best = new Map<
    string,
    { provinceSlug: string; municipioSlug: string; count: number; municipalityName: string }
  >();
  for (const r of rows) {
    const provinceKey = (r.province ?? '').trim();
    const muniName = (r.municipality ?? '').trim();
    if (!provinceKey || !muniName) continue;
    const lcMuni = muniName.toLowerCase();
    if (lcMuni === 'null' || lcMuni === 'undefined' || lcMuni === 'desconocida') continue;
    const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[provinceKey];
    if (!provinceSlug) continue;
    const municipioSlug = slugify(muniName);
    if (!municipioSlug) continue;
    const key = `${provinceSlug}|${municipioSlug}`;
    const count = r._count?._all ?? 0;
    const prev = best.get(key);
    if (!prev || count > prev.count) {
      best.set(key, { provinceSlug, municipioSlug, count, municipalityName: muniName });
    }
  }
  return Array.from(best.values()).sort((a, b) => b.count - a.count);
}

/**
 * Pairs with ≥1 ACTIVE auction (legacy active-only view — kept exported for
 * call sites that want the live-inventory subset).
 */
export const activeMunicipalityPairs = unstable_cache(
  () => _municipalityPairs({ status: { in: ACTIVE_STATUSES } }),
  ['seo-active-municipality-pairs'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/**
 * Town-pages Phase 2 — ALL clean (provinceSlug, municipioSlug) pairs with
 * ≥1 auction of ANY status. Used by the sitemap: every clean town page ships;
 * 0-active towns are noindex,follow at the page until inventory returns.
 * Same junk gates + collision fold as the active variant.
 */
export const allMunicipalityPairs = unstable_cache(
  () => _municipalityPairs({}),
  ['seo-all-municipality-pairs'],
  { revalidate: 300, tags: ['seo-counts'] },
);

/** Active-count per category label (for sitemap / threshold check). */
export async function categoryActiveCounts(): Promise<Map<string, number>> {
  const rows = await prisma.auction.groupBy({
    by: ['category'],
    where: { status: { in: ACTIVE_STATUSES } },
    _count: { _all: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.category) m.set(r.category, r._count?._all ?? 0);
  }
  return m;
}
