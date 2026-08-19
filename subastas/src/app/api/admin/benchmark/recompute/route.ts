/**
 * POST /api/admin/benchmark/recompute — rebuild the RegionBenchmark table.
 *
 * Phase 3 (Forge, 2026-07-16). Recomputes the region €/m² value-signal buckets
 * from the current active+upcoming property pool and REPLACES the table
 * contents atomically. Derived table → full replace is correct (stale buckets
 * for regions that emptied out are dropped).
 *
 * Auth: `CRON_SECRET` Bearer OR an admin session (same gate as
 * POST /api/dispatch/run). Wire it to the existing Python scheduler cron
 * (e.g. hourly/daily) so the benchmark tracks the live pool.
 *
 * Method (see src/lib/benchmark.ts):
 *   - Pool = DWELLING categories only (BENCHMARK_CATEGORIES), surfaceM2 present,
 *     and EITHER a live-market row (active ∪ upcoming) OR a recently-adjudicated
 *     row (concluded/sold status with soldDate within BENCHMARK_RECENCY_MONTHS).
 *     Pool-widen (benchmark-pool-widen, 2026-08-19): Ken §3 — the area median
 *     comes from ADJUDICATED (sold) data, which the active-only pool dropped.
 *   - €/m² per row = soldPrice(¢→€) FIRST, else valorSubasta, else appraisal,
 *     ÷ surfaceM2 (card-pill rounding/guards via derivePricePerM2), then the
 *     plausibility band + 1.5×IQR trim, then MEDIAN.
 *   - One province-level bucket + one bucket per municipality that each clear
 *     MIN_SAMPLE comparables after trimming. Sub-threshold buckets suppressed.
 *
 * Response: { success, mode, stats:{ poolRows, samples, buckets,
 *             provinceBuckets, municipalityBuckets, computedAt } }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import {
  ACTIVE_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  ADJUDICATED_DB_STATUSES,
} from '@/lib/auction-status';
import { coerceFiniteNumber } from '@/lib/auction-derive';
import {
  BENCHMARK_CATEGORIES,
  PROVINCE_LEVEL_SENTINEL,
  benchmarkRecencyCutoff,
  BENCHMARK_RECENCY_MONTHS,
  computeBenchmarks,
  toBenchmarkSample,
  type BenchmarkSample,
} from '@/lib/benchmark';
import type { Prisma, AuctionStatus } from '@prisma/client';

// The LIVE-market arm: active + upcoming — "what's on the market in this area
// right now". Not date-filtered (these rows have no sale date). Cast: the
// status constants are the AuctionStatus enum values as strings.
const BENCHMARK_LIVE_STATUSES = [
  ...ACTIVE_DB_STATUSES,
  ...PRE_AUCTION_DB_STATUSES,
] as unknown as AuctionStatus[];

// The ADJUDICATED arm: concluded/sold rows (Ken §3 — area median from sold
// data). Recency-windowed by soldDate so decade-old sales don't pollute the
// median. This is the pool-widen (benchmark-pool-widen, 2026-08-19): today's
// active-only pool clears n>=8 in ~1 municipality; adding recent sold dwellings
// lifts that to ~400 (soldPrice) / up to ~900 (valorSubasta fallback).
const BENCHMARK_SOLD_STATUSES = [
  ...ADJUDICATED_DB_STATUSES,
] as unknown as AuctionStatus[];

export async function POST(req: NextRequest) {
  const gate = await requireAdminOrCron(req);
  if (gate instanceof NextResponse) return gate;

  try {
    // Pull only the columns the benchmark needs, only for rows that can
    // possibly contribute (property category, has surface).
    const recencyCutoff = benchmarkRecencyCutoff();
    const rows = await prisma.auction.findMany({
      where: {
        // dwelling-category gate + surface guard apply to the WHOLE pool.
        category: { in: BENCHMARK_CATEGORIES as string[] },
        surfaceM2: { not: null },
        // Two arms: the live market (no date gate) OR recently-sold rows.
        OR: [
          { status: { in: BENCHMARK_LIVE_STATUSES } },
          {
            status: { in: BENCHMARK_SOLD_STATUSES },
            soldDate: { gte: recencyCutoff },
          },
        ],
      },
      select: {
        province: true,
        category: true,
        municipality: true,
        soldPrice: true,
        valorSubasta: true,
        appraisalValue: true,
        surfaceM2: true,
      },
    });

    const samples: BenchmarkSample[] = [];
    const basisCounts = { sold: 0, valorSubasta: 0, appraisal: 0 };
    for (const r of rows) {
      // soldPrice is BigInt CENTS (winning bid); convert to whole euros.
      const soldCents = coerceFiniteNumber(r.soldPrice);
      const soldPriceEur = soldCents != null && soldCents > 0 ? soldCents / 100 : null;
      const s = toBenchmarkSample({
        province: r.province,
        category: r.category,
        municipality: r.municipality,
        soldPriceEur,
        valorSubasta: coerceFiniteNumber(r.valorSubasta),
        appraisalValue: coerceFiniteNumber(r.appraisalValue),
        surfaceM2: coerceFiniteNumber(r.surfaceM2),
      });
      if (s) {
        samples.push(s);
        basisCounts[s.basis]++;
      }
    }

    const buckets = computeBenchmarks(samples);
    const computedAt = new Date();

    const data: Prisma.RegionBenchmarkCreateManyInput[] = buckets.map((b) => ({
      province: b.province,
      category: b.category,
      municipality: b.municipality,
      sampleSize: b.sampleSize,
      medianEurM2: b.medianEurM2,
      p25EurM2: b.p25EurM2,
      p75EurM2: b.p75EurM2,
      minEurM2: b.minEurM2,
      maxEurM2: b.maxEurM2,
      computedAt,
    }));

    // Atomic full replace — old buckets gone, new buckets in, in one tx so a
    // concurrent read never sees an empty table.
    await prisma.$transaction([
      prisma.regionBenchmark.deleteMany({}),
      ...(data.length > 0 ? [prisma.regionBenchmark.createMany({ data })] : []),
    ]);

    const provinceBuckets = buckets.filter((b) => b.municipality === PROVINCE_LEVEL_SENTINEL).length;

    return NextResponse.json({
      success: true,
      mode: gate.mode,
      stats: {
        poolRows: rows.length,
        samples: samples.length,
        buckets: buckets.length,
        provinceBuckets,
        municipalityBuckets: buckets.length - provinceBuckets,
        // Price-provenance breakdown of the samples (Ken §3 observability):
        // soldPrice-first, valorSubasta fallback, appraisal last resort.
        priceBasis: basisCounts,
        recencyMonths: BENCHMARK_RECENCY_MONTHS,
        recencyCutoff: recencyCutoff.toISOString(),
        computedAt: computedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[benchmark/recompute] failed:', err);
    return NextResponse.json(
      { success: false, error: 'recompute_failed', details: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/admin/benchmark/recompute',
    auth: 'Authorization: Bearer <CRON_SECRET> OR admin session',
    effect: 'Rebuilds RegionBenchmark from the active+upcoming property pool (full replace).',
  });
}
