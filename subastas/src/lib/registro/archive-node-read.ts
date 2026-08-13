/**
 * archive-node-read — the RUNTIME half of the v4 archive planner.
 *
 * `archive-partitions.ts` decides the SHAPE of the tree from pure numbers;
 * this module is the `ArchiveCountSource` that feeds it real ones, plus the
 * Prisma predicate that selects a node's rows. Both halves live behind one
 * import so a route never assembles a where-clause of its own — the planner's
 * "which children exist" and the list's "which rows render" must come from the
 * same predicate or a hub links a child page that returns nothing.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ WHY `año` IS EXPRESSED AS AN OR, NOT A COALESCE
 *
 * The `anio`/`trimestre` rungs key on `COALESCE(endsAt, publishedAt)` (P0,
 * approved by Ken 2026-08-13: 17,848 rows have a NULL `endsAt` and 100% of them
 * have a `publishedAt`). Prisma's query builder cannot express COALESCE in a
 * `where`, so the equivalent is written out explicitly:
 *
 *     (endsAt >= lo AND endsAt < hi)  OR  (endsAt IS NULL AND publishedAt >= lo AND publishedAt < hi)
 *
 * which is exactly what COALESCE means once you case-split on the NULL. The
 * alternative — raw SQL — would have forced a second, hand-written copy of the
 * registry outcome predicate (`outcome-query.ts`), and a drifting copy of THAT
 * is how a hub and its own child page start disagreeing about which rows exist.
 *
 * ⚠️ AND WHY THE BUCKETING IS DONE IN JS
 *
 * `EXTRACT(YEAR FROM …)` in Postgres resolves in the SESSION time zone, while a
 * Prisma date comparison is an absolute instant. If those two disagreed, a row
 * near a year boundary would be COUNTED in one year and RENDERED in another —
 * i.e. a node whose totals say 10 pages but whose page 10 comes back empty.
 * Rather than trust the two to agree, `archiveYearOf`/`archiveQuarterOf` below
 * are the single definition, used for BOTH the child census and the filter
 * window. They cannot drift because they are the same function.
 *
 * The offline P0 report reads a SQL rollup and can therefore differ from this by
 * a handful of boundary rows. That is fine and expected: the report is a
 * planning artifact, this is the runtime contract.
 */

import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { outcomeWhere, registryBaseWhere } from '@/lib/registro/outcome-query';
import { registryOutcomeFromSlug } from '@/lib/registro/registro-ui';
import {
  TIPO_SLUG_TO_DB_KEYS,
  DB_AUCTIONTYPE_TO_TIPO_SLUG,
  PROVINCE_SLUG_TO_DB_KEY,
  type TipoSlug,
} from '@/lib/seo/slugs';
import {
  foldArchiveMunicipalities,
  resolveArchiveMunicipality,
} from '@/lib/registro/archive-municipality';
import {
  planArchiveNode,
  type ArchiveCountSource,
  type ArchiveDimension,
  type ArchiveNode,
  type ArchivePlan,
  type ChildCount,
} from '@/lib/seo/archive-partitions';
import type { Prisma } from '@prisma/client';

/**
 * The date a row is PLACED by — `endsAt` when we have it, else `publishedAt`.
 *
 * Not "the year the auction ended": for the 17,848 endsAt-NULL rows this is the
 * year we PUBLISHED it. Never render an end-date claim from it (see the ladder
 * note in `archive-partitions.ts`).
 */
export function archivePlacementDate(row: {
  endsAt: Date | null;
  publishedAt: Date | null;
}): Date | null {
  return row.endsAt ?? row.publishedAt ?? null;
}

/** UTC year of a row's placement date, or null when it has none. */
export function archiveYearOf(row: { endsAt: Date | null; publishedAt: Date | null }): number | null {
  const d = archivePlacementDate(row);
  return d ? d.getUTCFullYear() : null;
}

/** 1..4 — UTC quarter of a row's placement date, or null when it has none. */
export function archiveQuarterOf(row: { endsAt: Date | null; publishedAt: Date | null }): number | null {
  const d = archivePlacementDate(row);
  return d ? Math.floor(d.getUTCMonth() / 3) + 1 : null;
}

/** Half-open [lo, hi) UTC window for a year, or a quarter within it. */
function placementWindow(anio: number, trimestre?: number): { lo: Date; hi: Date } {
  if (trimestre === undefined) {
    return { lo: new Date(Date.UTC(anio, 0, 1)), hi: new Date(Date.UTC(anio + 1, 0, 1)) };
  }
  const m = (trimestre - 1) * 3;
  return { lo: new Date(Date.UTC(anio, m, 1)), hi: new Date(Date.UTC(anio, m + 3, 1)) };
}

/**
 * Prisma `where` selecting exactly the rows of an archive node.
 *
 * `prov === undefined` means the LOCATION-FREE shelf, and it is a POSITIVE
 * condition (province is null or blank), never the absence of a filter — a
 * missing filter would make the shelf render the whole national corpus, which is
 * both wrong and the sort of thing that looks fine until the row count is
 * checked.
 */
export function archiveNodeWhere(node: ArchiveNode, now: Date = new Date()): Prisma.AuctionWhereInput {
  const and: Prisma.AuctionWhereInput[] = [];

  if (node.outcome !== undefined) {
    const o = registryOutcomeFromSlug(node.outcome);
    // An unknown outcome slug must select NOTHING rather than fall through to
    // "all rows" — a silently-ignored filter is the worst failure mode here.
    and.push(o ? outcomeWhere(o, now) : { id: '__never__' });
  } else {
    and.push(registryBaseWhere(now));
  }

  if (node.prov !== undefined) {
    const dbKey = PROVINCE_SLUG_TO_DB_KEY[node.prov];
    and.push(dbKey ? { province: dbKey } : { id: '__never__' });
  } else {
    // `Auction.province` is a NON-NULL String in the schema, so "no province"
    // is the empty string — not NULL. Writing `province: null` here does not
    // just fail to match, it fails to TYPE-CHECK, which is the schema telling
    // us the sentinel. This mirrors the P0 rollup's `COALESCE(a.province,'')`.
    and.push({ province: '' });
  }

  if (node.muni !== undefined) {
    // `muni` is the URL slug; the query needs the DB name(s) the route resolved.
    //
    // ⚠️ MUNI-A: the town's NAME is now the INE official denomination (see
    // `archive-municipality.ts`), which need not equal any single stored
    // spelling, and several stored spellings fold onto one town. So the filter
    // is a SET membership over every raw corpus name that folds here; equality
    // on one name would select a strict subset and make the hub's count and its
    // own pages disagree. `muniDbName` remains the single-name fallback.
    //
    // An unresolved (or unresolvable) town selects NOTHING — falling back to
    // "no municipality filter" would quietly render the whole province under a
    // town URL, which reads as a working page and is the harder bug to see.
    const names =
      node.muniDbNames && node.muniDbNames.length > 0
        ? [...node.muniDbNames]
        : node.muniDbName
          ? [node.muniDbName]
          : [];
    and.push(names.length > 0 ? { municipality: { in: names } } : { id: '__never__' });
  }

  if (node.tipo !== undefined) {
    const keys = TIPO_SLUG_TO_DB_KEYS[node.tipo];
    and.push(keys ? { auctionType: { in: keys } } : { id: '__never__' });
  }

  if (node.anio !== undefined) {
    const { lo, hi } = placementWindow(node.anio, node.trimestre);
    and.push({
      OR: [
        { endsAt: { gte: lo, lt: hi } },
        { AND: [{ endsAt: null }, { publishedAt: { gte: lo, lt: hi } }] },
      ],
    });
  }

  return { AND: and };
}

/**
 * The province NAME a node sits in, in the form the gazetteer compares against
 * (`resolveTownName` slugs both sides, so the DB key and the slug both work; the
 * DB key is preferred because it is what the rows carry).
 *
 * `undefined` on the location-free shelf — and a row with no province can never
 * resolve a town, which is the correct answer there.
 */
function archiveProvinceName(node: ArchiveNode): string | undefined {
  if (node.prov === undefined) return undefined;
  return PROVINCE_SLUG_TO_DB_KEY[node.prov] ?? node.prov;
}

/**
 * Every raw `Auction.municipality` spelling in `prov` that folds onto `muniSlug`
 * — i.e. the `muniDbNames` a town node needs to select ALL of its own rows.
 *
 * Needed because MUNI-A canonicalises names to the INE denomination, which may
 * match no stored spelling exactly (see `ArchiveNode.muniDbNames`). One grouped
 * scan per province, cached for an hour like every other census here.
 */
async function _readArchiveMuniDbNames(prov: string, muniSlug: string): Promise<string[]> {
  const dbKey = PROVINCE_SLUG_TO_DB_KEY[prov];
  if (!dbKey) return [];
  const rows = await prisma.auction.groupBy({ by: ['municipality'], where: { province: dbKey } });
  const out: string[] = [];
  for (const r of rows) {
    const name = r.municipality;
    if (!name) continue;
    if (resolveArchiveMunicipality(dbKey, name)?.slug === muniSlug) out.push(name);
  }
  return out;
}

export const readArchiveMuniDbNames = unstable_cache(
  _readArchiveMuniDbNames,
  ['archive-muni-db-names'],
  { revalidate: 3600, tags: ['registro'] },
);

/**
 * A node's row count. The ONE number that decides its page count, its page size
 * and whether it splits — so it is read once and threaded through, never
 * recomputed per consumer.
 */
async function _readArchiveNodeTotal(node: ArchiveNode): Promise<number> {
  return prisma.auction.count({ where: archiveNodeWhere(node) });
}

export const readArchiveNodeTotal = unstable_cache(_readArchiveNodeTotal, ['archive-node-total'], {
  revalidate: 3600,
  tags: ['registro'],
});

/**
 * Ceiling on rows projected into memory for the date rungs.
 *
 * `municipio` and `tipo` children come from a Postgres `groupBy`; `anio` and
 * `trimestre` cannot (see the header) and are bucketed in JS from a two-column
 * projection. That is affordable because of WHERE the date rungs sit: a node only
 * reaches `anio` after municipio and tipo have already been applied, so it is a
 * (town, tipo) leaf — thousands of rows, not the ~30k of a province. The cap is a
 * guard against the pathological case (a single-town province whose tipo rung is
 * degenerate), not the expected path; crossing it is reported, never silently
 * truncated, because a truncated census would under-count a child and orphan its
 * rows.
 */
const DATE_RUNG_PROJECTION_CAP = 50_000;

async function dateRungChildren(
  node: ArchiveNode,
  dim: 'anio' | 'trimestre',
): Promise<ChildCount[]> {
  const rows = await prisma.auction.findMany({
    where: archiveNodeWhere(node),
    select: { endsAt: true, publishedAt: true },
    take: DATE_RUNG_PROJECTION_CAP + 1,
  });
  if (rows.length > DATE_RUNG_PROJECTION_CAP) {
    throw new Error(
      `[archive] date-rung census over ${DATE_RUNG_PROJECTION_CAP} rows at ` +
        `${JSON.stringify(node)} — the ladder reached '${dim}' on a node far larger ` +
        `than any measured leaf. Investigate the rung order before raising this cap.`,
    );
  }
  const tally = new Map<string, number>();
  for (const r of rows) {
    const v = dim === 'anio' ? archiveYearOf(r) : archiveQuarterOf(r);
    if (v === null) continue; // undated rows cannot be placed on a date rung
    const k = String(v);
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return [...tally].map(([key, total]) => ({ key, total }));
}

async function _readArchiveChildren(
  node: ArchiveNode,
  dim: ArchiveDimension,
): Promise<ChildCount[]> {
  if (dim === 'anio' || dim === 'trimestre') return dateRungChildren(node, dim);

  if (dim === 'municipio') {
    const rows = await prisma.auction.groupBy({
      by: ['municipality'],
      where: archiveNodeWhere(node),
      _count: { _all: true },
    });
    // ⭐ MUNI-A: the INE register is the only source of towns. The fold — the
    // junk gate, the canonical name, the slug escape and the collision SUM —
    // lives in `archive-municipality.ts` so this census, the planner's child
    // keys and the route resolver cannot disagree about which towns exist.
    // Names that do not resolve are NOT children; their rows stay reachable
    // through the province's own pagination.
    const { resolved } = foldArchiveMunicipalities(
      archiveProvinceName(node),
      rows.map((r) => ({ name: r.municipality, total: r._count._all })),
    );
    return resolved.map((m) => ({ key: m.slug, total: m.total }));
  }

  // tipo
  const rows = await prisma.auction.groupBy({
    by: ['auctionType'],
    where: archiveNodeWhere(node),
    _count: { _all: true },
  });
  const tally = new Map<TipoSlug, number>();
  for (const r of rows) {
    const db = (r.auctionType ?? '') as string;
    const slug = db ? DB_AUCTIONTYPE_TO_TIPO_SLUG[db] : undefined;
    // An off-taxonomy auctionType has no tipo URL. Dropping it here is correct
    // — we never mint a segment we cannot resolve back — and it is safe because
    // the tipo rung is only ever a SPLIT: rows it cannot place stay reachable
    // through the parent's own pagination and through the other rungs.
    if (!slug) continue;
    tally.set(slug, (tally.get(slug) ?? 0) + r._count._all);
  }
  return [...tally].map(([key, total]) => ({ key, total }));
}

export const readArchiveChildren = unstable_cache(_readArchiveChildren, ['archive-children'], {
  revalidate: 3600,
  tags: ['registro'],
});

/**
 * Plan ONE node against live counts.
 *
 * The planner is synchronous by design (it must be unit-testable with no DB), so
 * the async reads are done first and handed to it through a tiny in-memory
 * `ArchiveCountSource`. Only the rungs the planner actually asks for are
 * fetched — it stops at the first non-degenerate one — so an ordinary town that
 * fits in its pagination costs exactly one `count` and no census at all.
 */
export interface ArchivePlanWithCounts {
  readonly plan: ArchivePlan;
  /**
   * Row count per child, keyed by the child's ladder KEY (town slug, tipo slug,
   * year, quarter). Carried alongside the plan because the child links render a
   * count, and re-counting each child would be one extra query per anchor.
   */
  readonly childTotals: ReadonlyMap<string, number>;
}

export async function readArchivePlan(node: ArchiveNode): Promise<ArchivePlanWithCounts> {
  const total = await readArchiveNodeTotal(node);

  // Fast path: the planner will not ask for children unless the node overflows.
  // Probing that with a throwaway plan keeps the "does it overflow?" rule in the
  // planner rather than duplicating the capacity arithmetic here — and it is the
  // common case (most towns fit), so the ordinary page costs ONE count query.
  const dry = planArchiveNode(node, { total: () => total, children: () => [] });
  if (dry.children.length === 0 && dry.skippedDimensions.length === 0) {
    return { plan: dry, childTotals: new Map() };
  }

  const cache = new Map<string, ChildCount[]>();
  for (const dim of ['municipio', 'tipo', 'anio', 'trimestre'] as const) {
    cache.set(dim, await readArchiveChildren(node, dim));
  }
  const counts: ArchiveCountSource = {
    total: () => total,
    children: (_n, dim) => cache.get(dim) ?? [],
  };
  const plan = planArchiveNode(node, counts);
  const childTotals = new Map<string, number>();
  if (plan.splitDimension) {
    for (const c of cache.get(plan.splitDimension) ?? []) childTotals.set(c.key, c.total);
  }
  return { plan, childTotals };
}

// ---------------------------------------------------------------------------
// The location-free shelf
// ---------------------------------------------------------------------------

export interface ShelfRoot {
  readonly tipo: TipoSlug;
  readonly total: number;
}

/**
 * Every `/resultados/{tipo}` shelf root that has rows — i.e. the tipos present
 * among the province-less corpus.
 *
 * ⛔ RELEASE GATE (Ken, 2026-08-13): `/resultados` MUST link all of these. The
 * shelf is where the province-less rows live and it has NO other parent, so an
 * unlinked shelf root orphans precisely the rows the shelf was built for. The
 * count is data-dependent and bounded by `TIPO_SLUGS` (5), which is why the root
 * page renders this list rather than a hardcoded one.
 */
async function _readShelfRoots(): Promise<ShelfRoot[]> {
  const rows = await prisma.auction.groupBy({
    by: ['auctionType'],
    where: archiveNodeWhere({}),
    _count: { _all: true },
  });
  const tally = new Map<TipoSlug, number>();
  for (const r of rows) {
    const db = (r.auctionType ?? '') as string;
    const slug = db ? DB_AUCTIONTYPE_TO_TIPO_SLUG[db] : undefined;
    // No province AND no tipo → nothing to place the row by. Ken's ruling:
    // excluded from the tree AND the sitemap. We do not advertise a page we
    // cannot place, and we never invent a province to manufacture one.
    if (!slug) continue;
    tally.set(slug, (tally.get(slug) ?? 0) + r._count._all);
  }
  return [...tally]
    .map(([tipo, total]) => ({ tipo, total }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);
}

export const readShelfRoots = unstable_cache(_readShelfRoots, ['archive-shelf-roots'], {
  revalidate: 3600,
  tags: ['registro'],
});

/**
 * Province-less rows that no shelf can hold (no tipo). Reported, never placed —
 * Ken asked for the number in the ledger rather than a conclusion.
 */
async function _readUnplaceableCount(): Promise<number> {
  return prisma.auction.count({
    where: {
      AND: [archiveNodeWhere({}), { OR: [{ auctionType: null }, { auctionType: '' }] }],
    },
  });
}

export const readUnplaceableCount = unstable_cache(_readUnplaceableCount, ['archive-unplaceable'], {
  revalidate: 3600,
  tags: ['registro'],
});
