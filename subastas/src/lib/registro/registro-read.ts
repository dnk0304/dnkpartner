/**
 * src/lib/registro/registro-read.ts — SERVER-SIDE reads for the /resultados SSR
 * pages. These are faithful in-process mirrors of the three public routes
 * (/api/registro/summary · /list · /regions) so the indexable pages render
 * their content + crawlable links WITHOUT an HTTP self-fetch (no absolute-URL
 * fragility, no double round-trip). The route handlers stay the client API;
 * these are the server-component data layer. Both read the SAME tables and
 * reuse the SAME predicates (outcome-query.ts, auction-outcome.ts), so they
 * cannot diverge in classification.
 *
 * All wrapped in `unstable_cache` (hourly, matching the routes' s-maxage) — the
 * rollup only changes on the nightly recompute and concluded outcomes are
 * immutable.
 */

import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { buildAuctionSlug } from '@/lib/seo/auction-slug';
import { fetchV3UrlsBatch, resolveAuctionPath } from '@/lib/seo/auction-url';
import {
  auctionOutcome,
  AUCTION_OUTCOMES,
  REGISTRY_OUTCOMES,
  type AuctionOutcome,
} from '@/lib/seo/auction-outcome';
import { outcomeWhere, registryBaseWhere } from '@/lib/registro/outcome-query';
import { archiveNodeWhere } from '@/lib/registro/archive-node-read';
import type { ArchiveNode } from '@/lib/seo/archive-partitions';
import { PERIOD_ALL, ROLLUP_ALL } from '@/lib/registro/outcome-stats';
import { OUTCOME_SLUG } from '@/lib/seo/auction-outcome';
import { PROVINCE_DB_KEY_TO_SLUG } from '@/lib/seo/slugs';
// ⭐ Ken's MUNI-A ruling: the INE gazetteer is the ONLY source of towns. Every
// municipality enumeration below goes through this one resolution point — see
// `@/lib/registro/archive-municipality` for the full rationale.
import {
  foldArchiveMunicipalities,
  resolveArchiveMunicipality,
} from '@/lib/registro/archive-municipality';
import { OUTCOME_TO_SLUG, REGISTRY_OUTCOME_ORDER } from '@/lib/registro/registro-ui';
import type { Prisma } from '@prisma/client';

// Lockstep guard (server-only): the inlined /resultados outcome slugs MUST
// equal the canonical taxonomy's. Fails loud at module load if they ever drift.
for (const o of REGISTRY_OUTCOME_ORDER) {
  if (OUTCOME_SLUG[o] !== OUTCOME_TO_SLUG[o]) {
    throw new Error(
      `[registro] outcome-slug drift for ${o}: registro-ui '${OUTCOME_TO_SLUG[o]}' ≠ canonical '${OUTCOME_SLUG[o]}'`,
    );
  }
}
import type {
  OutcomeCounts,
  RegistroListItem,
  RegistrySummary,
  RegistryOutcome,
} from '@/lib/registro/registro-ui';

type PeriodBasis = 'PUBLISHED' | 'CONCLUDED';

function emptyCounts(): OutcomeCounts {
  return {
    VENDIDA: 0,
    DESIERTA: 0,
    CANCELADA: 0,
    FINALIZADA_SIN_RESULTADO: 0,
    INDETERMINADO: 0,
  };
}

function pctSold(counts: OutcomeCounts): number | null {
  let denom = 0;
  for (const o of REGISTRY_OUTCOMES) denom += counts[o];
  if (denom === 0) return null;
  return Math.round((counts.VENDIDA / denom) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

type StatRow = {
  province: string;
  outcome: string;
  count: number;
  soldPriceMedianCents: bigint | null;
  discountToAppraisalMedian: number | null;
  discountToValorSubastaMedian: number | null;
};

async function _readSummary(opts: {
  province?: string;
  category?: string;
  periodBasis?: PeriodBasis;
}): Promise<RegistrySummary> {
  const periodBasis: PeriodBasis = opts.periodBasis ?? 'CONCLUDED';
  const province = (opts.province ?? '').trim();
  const category = (opts.category ?? '').trim();

  const geoWhere = province
    ? { province, municipality: ROLLUP_ALL }
    : { province: ROLLUP_ALL, municipality: ROLLUP_ALL };

  const headline = (await prisma.auctionOutcomeStats.findMany({
    where: { period: PERIOD_ALL, periodBasis, category, ...geoWhere },
    select: {
      province: true,
      outcome: true,
      count: true,
      soldPriceMedianCents: true,
      discountToAppraisalMedian: true,
      discountToValorSubastaMedian: true,
    },
  })) as StatRow[];

  const counts = emptyCounts();
  let vendida: StatRow | undefined;
  for (const r of headline) {
    if ((AUCTION_OUTCOMES as string[]).includes(r.outcome)) counts[r.outcome as AuctionOutcome] = r.count;
    if (r.outcome === 'VENDIDA') vendida = r;
  }

  const trendRows = (await prisma.auctionOutcomeStats.findMany({
    where: { period: { not: PERIOD_ALL }, periodBasis, category, ...geoWhere },
    select: { period: true, outcome: true, count: true, soldPriceMedianCents: true },
    orderBy: { period: 'asc' },
  })) as { period: string; outcome: string; count: number; soldPriceMedianCents: bigint | null }[];

  const trendMap = new Map<
    string,
    { period: string; counts: OutcomeCounts; soldPriceMedianCents: number | null }
  >();
  for (const r of trendRows) {
    let t = trendMap.get(r.period);
    if (!t) {
      t = { period: r.period, counts: emptyCounts(), soldPriceMedianCents: null };
      trendMap.set(r.period, t);
    }
    if ((AUCTION_OUTCOMES as string[]).includes(r.outcome)) t.counts[r.outcome as AuctionOutcome] = r.count;
    if (r.outcome === 'VENDIDA' && r.soldPriceMedianCents != null) {
      t.soldPriceMedianCents = Number(r.soldPriceMedianCents);
    }
  }
  const trend = [...trendMap.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((t) => ({
      period: t.period,
      counts: t.counts,
      pctSold: pctSold(t.counts),
      soldPriceMedianCents: t.soldPriceMedianCents,
    }));

  let regions: RegistrySummary['regions'] = [];
  if (!province) {
    const regionRows = (await prisma.auctionOutcomeStats.findMany({
      where: {
        period: PERIOD_ALL,
        periodBasis,
        category,
        municipality: ROLLUP_ALL,
        province: { not: ROLLUP_ALL },
      },
      select: { province: true, outcome: true, count: true, soldPriceMedianCents: true },
    })) as StatRow[];

    const rMap = new Map<
      string,
      { province: string; counts: OutcomeCounts; soldPriceMedianCents: number | null }
    >();
    for (const r of regionRows) {
      let g = rMap.get(r.province);
      if (!g) {
        g = { province: r.province, counts: emptyCounts(), soldPriceMedianCents: null };
        rMap.set(r.province, g);
      }
      if ((AUCTION_OUTCOMES as string[]).includes(r.outcome)) g.counts[r.outcome as AuctionOutcome] = r.count;
      if (r.outcome === 'VENDIDA' && r.soldPriceMedianCents != null) {
        g.soldPriceMedianCents = Number(r.soldPriceMedianCents);
      }
    }
    regions = [...rMap.values()]
      .map((g) => {
        let total = 0;
        for (const o of REGISTRY_OUTCOMES) total += g.counts[o];
        return {
          province: g.province,
          counts: g.counts,
          total,
          pctSold: pctSold(g.counts),
          soldPriceMedianCents: g.soldPriceMedianCents,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  const registryTotal = REGISTRY_OUTCOMES.reduce((s, o) => s + counts[o], 0);

  return {
    scope: { periodBasis, province: province || null, category: category || null },
    headline: {
      counts,
      registryTotal,
      residualIndeterminado: counts.INDETERMINADO,
      pctSold: pctSold(counts),
      soldPriceMedianCents: vendida?.soldPriceMedianCents != null ? Number(vendida.soldPriceMedianCents) : null,
      discountToAppraisalMedian: vendida?.discountToAppraisalMedian ?? null,
      discountToValorSubastaMedian: vendida?.discountToValorSubastaMedian ?? null,
    },
    trend,
    regions,
  };
}

export const readSummary = unstable_cache(_readSummary, ['registro-summary'], {
  revalidate: 3600,
  tags: ['registro'],
});

// ---------------------------------------------------------------------------
// regions (province list, or municipios within a province)
// ---------------------------------------------------------------------------

export interface RegionRow {
  /**
   * At province level: the DB province name. At municipio level: the INE
   * OFFICIAL denomination (MUNI-A) — NOT necessarily any stored
   * `Auction.municipality` value, so never use it in a `where` clause; use
   * `dbNames` for that.
   */
  label: string;
  counts: OutcomeCounts;
  total: number;
  /**
   * Municipio level: every raw corpus spelling that folded onto this town —
   * the values to query with (`municipality: { in: dbNames }`). Province level:
   * the province name itself.
   */
  dbNames: string[];
}

async function _readRegions(opts: {
  province?: string;
  category?: string;
  periodBasis?: PeriodBasis;
}): Promise<{ level: 'province' | 'municipio'; regions: RegionRow[] }> {
  const periodBasis: PeriodBasis = opts.periodBasis ?? 'CONCLUDED';
  const province = (opts.province ?? '').trim();
  const category = (opts.category ?? '').trim();

  const where = province
    ? { period: PERIOD_ALL, periodBasis, category, province, municipality: { not: ROLLUP_ALL } }
    : { period: PERIOD_ALL, periodBasis, category, municipality: ROLLUP_ALL, province: { not: ROLLUP_ALL } };

  const rows = (await prisma.auctionOutcomeStats.findMany({
    where,
    select: { province: true, municipality: true, outcome: true, count: true },
  })) as { province: string; municipality: string; outcome: string; count: number }[];

  const groups = new Map<string, { label: string; counts: OutcomeCounts; dbNames: string[] }>();
  for (const r of rows) {
    let key: string;
    let label: string;
    let raw: string | null = null;
    if (province) {
      // MUNI-A gate: a municipality absent from the INE register is not a town.
      // Those rows are dropped from the municipio list and stay counted at the
      // PROVINCE level (see archive-municipality.ts). Grouping by INE code —
      // not by the corpus string — collapses every spelling onto one town.
      const hit = resolveArchiveMunicipality(province, r.municipality);
      if (!hit) continue;
      key = hit.ine;
      label = hit.name;
      raw = (r.municipality ?? '').trim();
    } else {
      key = r.province;
      label = r.province;
    }
    let g = groups.get(key);
    if (!g) {
      g = { label, counts: emptyCounts(), dbNames: province ? [] : [key] };
      groups.set(key, g);
    }
    if (raw && !g.dbNames.includes(raw)) g.dbNames.push(raw);
    // `+=` (was `=`): at municipio level several spellings now fold onto one
    // town, so their per-outcome counts must SUM, not overwrite each other.
    if ((AUCTION_OUTCOMES as string[]).includes(r.outcome)) g.counts[r.outcome as AuctionOutcome] += r.count;
  }

  const regions = [...groups.values()]
    .map((g) => {
      let total = 0;
      for (const o of REGISTRY_OUTCOMES) total += g.counts[o];
      return { label: g.label, counts: g.counts, total, dbNames: g.dbNames };
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);

  return { level: province ? 'municipio' : 'province', regions };
}

export const readRegions = unstable_cache(_readRegions, ['registro-regions'], {
  revalidate: 3600,
  tags: ['registro'],
});

// ---------------------------------------------------------------------------
// list (a single bounded page of concluded rows, classified)
// ---------------------------------------------------------------------------

export interface ReadListParams {
  /**
   * v4: render exactly the rows of an archive node (`/resultados/{prov}/{muni}/
   * {tipo}/{año}/t{n}`, or the location-free shelf when `prov` is absent).
   *
   * When present this REPLACES the outcome/province/municipio composition below
   * — it is not merged with it. Two independently-built predicates for the same
   * page is how a hub and its own child page end up disagreeing about which rows
   * exist, so a node page uses the planner's predicate and nothing else. The
   * remaining params (sort, page, pageSize) still apply.
   */
  node?: ArchiveNode | null;
  outcome?: RegistryOutcome | null;
  category?: string;
  province?: string;
  /**
   * MUNI-A: an ARRAY is the set of raw `Auction.municipality` spellings that
   * fold onto one INE town (`MunicipioRegionEntry.dbNames`). The INE official
   * name is a display value and must not be used here.
   */
  municipio?: string | string[];
  priceMin?: number | null;
  priceMax?: number | null;
  from?: string | null;
  to?: string | null;
  periodBasis?: PeriodBasis;
  sort?: 'recent' | 'price_desc' | 'price_asc';
  page?: number;
  pageSize?: number;
}

export interface ReadListResult {
  items: RegistroListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

async function _readList(params: ReadListParams): Promise<ReadListResult> {
  const now = new Date();
  const outcome = params.outcome ?? null;
  const category = (params.category ?? '').trim();
  const province = (params.province ?? '').trim();
  const municipioRaw = params.municipio;
  const municipio = Array.isArray(municipioRaw)
    ? municipioRaw.map((m) => m.trim()).filter(Boolean)
    : (municipioRaw ?? '').trim();
  const periodBasis: PeriodBasis = params.periodBasis ?? 'CONCLUDED';
  const sort = params.sort ?? 'recent';
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 24)));

  const and: Prisma.AuctionWhereInput[] = params.node
    ? [archiveNodeWhere(params.node, now)]
    : [outcome ? outcomeWhere(outcome, now) : registryBaseWhere(now)];
  if (!params.node) {
    if (category) and.push({ category });
    if (province) and.push({ province });
    if (Array.isArray(municipio)) {
      if (municipio.length > 0) and.push({ municipality: { in: municipio } });
    } else if (municipio) {
      and.push({ municipality: municipio });
    }
  }

  const priceWhere: { gte?: bigint; lte?: bigint } = {};
  if (params.priceMin != null && Number.isFinite(params.priceMin)) priceWhere.gte = BigInt(Math.round(params.priceMin * 100));
  if (params.priceMax != null && Number.isFinite(params.priceMax)) priceWhere.lte = BigInt(Math.round(params.priceMax * 100));
  if (priceWhere.gte != null || priceWhere.lte != null) and.push({ soldPrice: priceWhere });

  const dateField = periodBasis === 'PUBLISHED' ? 'publishedAt' : 'endsAt';
  const dateWhere: Prisma.DateTimeFilter = {};
  if (params.from) {
    const d = new Date(`${params.from}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) dateWhere.gte = d;
  }
  if (params.to) {
    const d = new Date(`${params.to}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) dateWhere.lte = d;
  }
  if (dateWhere.gte != null || dateWhere.lte != null) and.push({ [dateField]: dateWhere });

  const where: Prisma.AuctionWhereInput = { AND: and };

  let orderBy: Prisma.AuctionOrderByWithRelationInput | Prisma.AuctionOrderByWithRelationInput[];
  if (sort === 'price_desc') orderBy = [{ soldPrice: 'desc' }, { endsAt: 'desc' }];
  else if (sort === 'price_asc') orderBy = [{ soldPrice: 'asc' }, { endsAt: 'desc' }];
  else orderBy = [{ endsAt: 'desc' }, { id: 'desc' }];

  const [total, rows] = await Promise.all([
    prisma.auction.count({ where }),
    prisma.auction.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        boeId: true,
        title: true,
        category: true,
        province: true,
        municipality: true,
        auctionType: true,
        propertyType: true,
        status: true,
        saleResult: true,
        resumeAt: true,
        updatedAt: true,
        soldPrice: true,
        appraisalValue: true,
        valorSubasta: true,
        soldDate: true,
        endsAt: true,
        publishedAt: true,
        imageUrl: true,
      },
    }),
  ]);

  // ONE `= ANY(...)` probe for this page of rows — never a per-row lookup.
  // Batched AFTER the `take: pageSize` slice so the probe is page-sized.
  // Missing ids fall back to the legacy path inside `resolveAuctionPath`,
  // which is the right answer for a held / degraded / quarantined row.
  const v3 = await fetchV3UrlsBatch(rows.map((r) => r.id));

  const items: RegistroListItem[] = rows.map((r) => {
    const classified = auctionOutcome(
      { status: r.status, saleResult: r.saleResult, resumeAt: r.resumeAt, updatedAt: r.updatedAt },
      now,
    );
    const forSlug = {
      id: r.id,
      auctionType: r.auctionType,
      province: r.province,
      municipality: r.municipality,
    };
    const slug = buildAuctionSlug(forSlug);
    return {
      id: r.id,
      boeId: r.boeId,
      slug,
      detailPath: resolveAuctionPath(forSlug, v3.get(r.id) ?? null),
      title: r.title,
      category: r.category,
      province: r.province,
      municipality: r.municipality,
      outcome: classified,
      soldPriceCents: r.soldPrice != null ? Number(r.soldPrice) : null,
      appraisalValue: r.appraisalValue,
      valorSubasta: r.valorSubasta,
      soldDate: r.soldDate?.toISOString() ?? null,
      endsAt: r.endsAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      imageUrl: r.imageUrl,
    };
  });

  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export const readList = unstable_cache(_readList, ['registro-list'], {
  revalidate: 3600,
  tags: ['registro'],
});

// ---------------------------------------------------------------------------
// Region enumeration for the sitemap + programmatic-page reachability. Reads
// ONLY the rollup, count-gated (total > 0) — the SAME gate the region pages
// use to decide index,follow, so a sitemap URL is never noindex.
// ---------------------------------------------------------------------------

export interface ProvinceRegionEntry {
  provinceDbKey: string;
  provinceSlug: string;
  total: number;
  soldCount: number;
}

async function _concludedProvinceRegions(): Promise<ProvinceRegionEntry[]> {
  const { regions } = await _readRegions({});
  const out: ProvinceRegionEntry[] = [];
  for (const r of regions) {
    const slug = PROVINCE_DB_KEY_TO_SLUG[r.label];
    if (!slug) continue; // off-taxonomy province name — skip
    out.push({ provinceDbKey: r.label, provinceSlug: slug, total: r.total, soldCount: r.counts.VENDIDA });
  }
  return out;
}

export const concludedProvinceRegions = unstable_cache(
  _concludedProvinceRegions,
  ['registro-province-regions'],
  { revalidate: 3600, tags: ['registro'] },
);

export interface MunicipioRegionEntry {
  /** INE OFFICIAL denomination (MUNI-A) — display only, never a `where` value. */
  municipalityName: string;
  municipioSlug: string;
  total: number;
  /**
   * Every raw `Auction.municipality` spelling that folded onto this town.
   * Callers building a predicate MUST use `municipality: { in: dbNames }` —
   * `municipalityName` is the register's spelling and may match no stored row.
   */
  dbNames: string[];
}

async function _concludedMunicipioRegions(provinceDbKey: string): Promise<MunicipioRegionEntry[]> {
  const { regions } = await _readRegions({ province: provinceDbKey });
  // `_readRegions` has already applied the gazetteer gate, so its municipio
  // labels are INE official names; the fold below is what mints the (escaped)
  // URL segment, so links and the route resolver cannot disagree.
  const { resolved } = foldArchiveMunicipalities(
    provinceDbKey,
    regions.map((r) => ({ name: r.label, total: r.total })),
  );
  const rawByLabel = new Map(regions.map((r) => [r.label, r.dbNames] as const));
  return resolved.map((m) => ({
    municipalityName: m.name,
    municipioSlug: m.slug,
    total: m.total,
    dbNames: rawByLabel.get(m.name) ?? [],
  }));
}

export const concludedMunicipioRegions = unstable_cache(
  _concludedMunicipioRegions,
  ['registro-municipio-regions'],
  { revalidate: 3600, tags: ['registro'] },
);

export interface MunicipioPair {
  provinceSlug: string;
  municipioSlug: string;
  total: number;
}

/**
 * ALL (province, municipio) pairs with ≥1 concluded registry row — one rollup
 * read, collision-folded. Powers the sitemap's town-level /resultados URLs
 * (the deepest crawl nodes). Count-gated by construction (readRegions filters
 * total>0), so every emitted URL is index,follow — never a noindex sitemap URL.
 */
async function _concludedMunicipioPairsAll(): Promise<MunicipioPair[]> {
  const rows = (await prisma.auctionOutcomeStats.findMany({
    where: {
      period: PERIOD_ALL,
      periodBasis: 'CONCLUDED',
      category: '',
      municipality: { not: ROLLUP_ALL },
      province: { not: ROLLUP_ALL },
    },
    select: { province: true, municipality: true, outcome: true, count: true },
  })) as { province: string; municipality: string; outcome: string; count: number }[];

  // Sum registry-outcome counts per (province, municipality).
  const totals = new Map<string, { province: string; municipality: string; total: number }>();
  for (const r of rows) {
    if (!(REGISTRY_OUTCOMES as string[]).includes(r.outcome)) continue;
    const key = `${r.province}||${r.municipality}`;
    const prev = totals.get(key) ?? { province: r.province, municipality: r.municipality, total: 0 };
    prev.total += r.count;
    totals.set(key, prev);
  }

  // Group by province, then run each province's names through the ONE
  // resolution point. This feeds the sitemap, so the MUNI-A ruling is
  // load-bearing here: a name the INE register does not know must not become a
  // URL at all — its rows stay at the province level.
  const byProvince = new Map<string, Array<{ name: string; total: number }>>();
  for (const g of totals.values()) {
    if (g.total <= 0) continue;
    let list = byProvince.get(g.province);
    if (!list) {
      list = [];
      byProvince.set(g.province, list);
    }
    list.push({ name: g.municipality, total: g.total });
  }

  const out: MunicipioPair[] = [];
  for (const [provinceDbKey, list] of byProvince) {
    const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[provinceDbKey];
    if (!provinceSlug) continue; // off-taxonomy province name — skip
    const { resolved } = foldArchiveMunicipalities(provinceDbKey, list);
    for (const m of resolved) {
      out.push({ provinceSlug, municipioSlug: m.slug, total: m.total });
    }
  }
  return out;
}

export const concludedMunicipioPairsAll = unstable_cache(
  _concludedMunicipioPairsAll,
  ['registro-municipio-pairs-all'],
  { revalidate: 3600, tags: ['registro'] },
);

/**
 * Resolve a /resultados municipality slug → the canonical town within a
 * province. Scoped to concluded-registry municipios and gated by the INE
 * register (MUNI-A): an unknown town simply has no entry.
 *
 * ⚠️ The returned `municipalityName` is the register's spelling. To QUERY, use
 * the entry's `dbNames` (`municipality: { in: entry.dbNames }`).
 */
export async function registroMunicipioSlugToDbName(
  provinceDbKey: string,
  municipioSlug: string,
): Promise<MunicipioRegionEntry | null> {
  const list = await concludedMunicipioRegions(provinceDbKey);
  return list.find((m) => m.municipioSlug === municipioSlug) ?? null;
}
