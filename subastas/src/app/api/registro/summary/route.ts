/**
 * GET /api/registro/summary — the /resultados registry overview.
 *
 * Reads ONLY the precomputed AuctionOutcomeStats table (never Auction). Returns
 * national (or per-province) headline bucket counts, % sold, median sold price
 * + median discounts (all-time true medians from the period='ALL' bucket), a
 * per-month trend series, and — at national scope — a per-province breakdown.
 *
 * Query params:
 *   periodBasis = PUBLISHED | CONCLUDED   (default CONCLUDED)
 *   province    = <province name>         (optional; omit → national)
 *   category    = <DB category label>     (optional; omit → all categories)
 *
 * Cache: public, hourly s-maxage (far longer than the 30s auctionCache) — the
 * table only changes on the nightly recompute.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  PERIOD_ALL,
  ROLLUP_ALL,
  type PeriodBasis,
} from '@/lib/registro/outcome-stats';
import { AUCTION_OUTCOMES, REGISTRY_OUTCOMES, type AuctionOutcome } from '@/lib/seo/auction-outcome';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_HEADER = 'public, s-maxage=3600, stale-while-revalidate=86400';

function parseBasis(v: string | null): PeriodBasis {
  return v === 'PUBLISHED' ? 'PUBLISHED' : 'CONCLUDED';
}

type StatRow = {
  province: string;
  outcome: string;
  count: number;
  soldPriceMedianCents: bigint | null;
  discountToAppraisalMedian: number | null;
  discountToValorSubastaMedian: number | null;
};

/** Blank per-outcome count map. */
function emptyCounts(): Record<AuctionOutcome, number> {
  return {
    VENDIDA: 0,
    DESIERTA: 0,
    CANCELADA: 0,
    FINALIZADA_SIN_RESULTADO: 0,
    INDETERMINADO: 0,
  };
}

/** % sold over the registry buckets (excludes INDETERMINADO). null when none. */
function pctSold(counts: Record<AuctionOutcome, number>): number | null {
  let denom = 0;
  for (const o of REGISTRY_OUTCOMES) denom += counts[o];
  if (denom === 0) return null;
  return Math.round((counts.VENDIDA / denom) * 1000) / 10;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const periodBasis = parseBasis(sp.get('periodBasis'));
  const province = (sp.get('province') ?? '').trim();
  const category = (sp.get('category') ?? '').trim();

  try {
    const geoWhere = province
      ? { province, municipality: ROLLUP_ALL }
      : { province: ROLLUP_ALL, municipality: ROLLUP_ALL };

    // Headline (all-time) rows for the requested geo+category.
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
      if ((AUCTION_OUTCOMES as string[]).includes(r.outcome)) {
        counts[r.outcome as AuctionOutcome] = r.count;
      }
      if (r.outcome === 'VENDIDA') vendida = r;
    }

    // Trend series: per-month counts + VENDIDA median for this geo+category.
    const trendRows = (await prisma.auctionOutcomeStats.findMany({
      where: { period: { not: PERIOD_ALL }, periodBasis, category, ...geoWhere },
      select: { period: true, outcome: true, count: true, soldPriceMedianCents: true },
      orderBy: { period: 'asc' },
    })) as { period: string; outcome: string; count: number; soldPriceMedianCents: bigint | null }[];

    const trendMap = new Map<
      string,
      { period: string; counts: Record<AuctionOutcome, number>; soldPriceMedianCents: number | null }
    >();
    for (const r of trendRows) {
      let t = trendMap.get(r.period);
      if (!t) {
        t = { period: r.period, counts: emptyCounts(), soldPriceMedianCents: null };
        trendMap.set(r.period, t);
      }
      if ((AUCTION_OUTCOMES as string[]).includes(r.outcome)) {
        t.counts[r.outcome as AuctionOutcome] = r.count;
      }
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

    // National scope only: per-province headline breakdown (drives the region
    // overview grid). province-level rows: municipality='', category as asked.
    let regions: Array<{
      province: string;
      counts: Record<AuctionOutcome, number>;
      total: number;
      pctSold: number | null;
      soldPriceMedianCents: number | null;
    }> = [];
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
        { province: string; counts: Record<AuctionOutcome, number>; soldPriceMedianCents: number | null }
      >();
      for (const r of regionRows) {
        let g = rMap.get(r.province);
        if (!g) {
          g = { province: r.province, counts: emptyCounts(), soldPriceMedianCents: null };
          rMap.set(r.province, g);
        }
        if ((AUCTION_OUTCOMES as string[]).includes(r.outcome)) {
          g.counts[r.outcome as AuctionOutcome] = r.count;
        }
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

    // Residual (INDETERMINADO) count is reported separately, not in headline %s.
    const registryTotal = REGISTRY_OUTCOMES.reduce((s, o) => s + counts[o], 0);

    const res = NextResponse.json({
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
    });
    res.headers.set('Cache-Control', CACHE_HEADER);
    return res;
  } catch (err) {
    console.error('[registro/summary] failed:', err);
    return NextResponse.json({ error: 'summary_failed' }, { status: 500 });
  }
}
