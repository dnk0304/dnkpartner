/**
 * GET /api/registro/regions — province / municipio list with per-region outcome
 * counts. Drives programmatic-page generation (/resultados/{provincia}[/{muni}])
 * and the registry nav. Reads ONLY the precomputed AuctionOutcomeStats table.
 *
 * Query params:
 *   periodBasis = PUBLISHED | CONCLUDED   (default CONCLUDED)
 *   province    = <province name>         (optional; omit → provinces list,
 *                                          present → municipios within it)
 *   category    = <DB category label>     (optional; omit → all categories)
 *
 * Uses the all-time (period='ALL') buckets so region cards show lifetime totals.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PERIOD_ALL, ROLLUP_ALL, type PeriodBasis } from '@/lib/registro/outcome-stats';
import { AUCTION_OUTCOMES, REGISTRY_OUTCOMES, type AuctionOutcome } from '@/lib/seo/auction-outcome';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_HEADER = 'public, s-maxage=3600, stale-while-revalidate=86400';

function parseBasis(v: string | null): PeriodBasis {
  return v === 'PUBLISHED' ? 'PUBLISHED' : 'CONCLUDED';
}

function emptyCounts(): Record<AuctionOutcome, number> {
  return {
    VENDIDA: 0,
    DESIERTA: 0,
    CANCELADA: 0,
    FINALIZADA_SIN_RESULTADO: 0,
    INDETERMINADO: 0,
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const periodBasis = parseBasis(sp.get('periodBasis'));
  const province = (sp.get('province') ?? '').trim();
  const category = (sp.get('category') ?? '').trim();

  try {
    // province present → municipios within it (province=P, municipality != '').
    // province absent  → provinces list (municipality='', province != '').
    const where = province
      ? { period: PERIOD_ALL, periodBasis, category, province, municipality: { not: ROLLUP_ALL } }
      : { period: PERIOD_ALL, periodBasis, category, municipality: ROLLUP_ALL, province: { not: ROLLUP_ALL } };

    const rows = (await prisma.auctionOutcomeStats.findMany({
      where,
      select: { province: true, municipality: true, outcome: true, count: true },
    })) as { province: string; municipality: string; outcome: string; count: number }[];

    // Group by the region key (municipality when scoped to a province, else province).
    const groups = new Map<string, { label: string; counts: Record<AuctionOutcome, number> }>();
    for (const r of rows) {
      const label = province ? r.municipality : r.province;
      let g = groups.get(label);
      if (!g) {
        g = { label, counts: emptyCounts() };
        groups.set(label, g);
      }
      if ((AUCTION_OUTCOMES as string[]).includes(r.outcome)) {
        g.counts[r.outcome as AuctionOutcome] = r.count;
      }
    }

    const regions = [...groups.values()]
      .map((g) => {
        let total = 0;
        for (const o of REGISTRY_OUTCOMES) total += g.counts[o];
        return { label: g.label, counts: g.counts, total };
      })
      // Only regions with ≥1 real registry row (mirror the count-based gate —
      // no programmatic page for an empty region).
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total);

    const res = NextResponse.json({
      scope: { periodBasis, province: province || null, category: category || null },
      level: province ? 'municipio' : 'province',
      regions,
    });
    res.headers.set('Cache-Control', CACHE_HEADER);
    return res;
  } catch (err) {
    console.error('[registro/regions] failed:', err);
    return NextResponse.json({ error: 'regions_failed' }, { status: 500 });
  }
}
