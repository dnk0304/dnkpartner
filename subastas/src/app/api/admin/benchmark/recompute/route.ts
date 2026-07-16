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
 *   - Pool = property categories only (OFFICIAL_CATEGORIES.REAL_ESTATE),
 *     status ∈ active ∪ upcoming, surfaceM2 present, and a positive
 *     valorSubasta OR appraisalValue (so €/m² is computable).
 *   - €/m² per row = valorSubasta||appraisalValue ÷ surfaceM2 (card-pill
 *     definition), then plausibility band + 1.5×IQR trim, then MEDIAN.
 *   - One province-level bucket + one bucket per municipality that each clear
 *     MIN_SAMPLE comparables after trimming. Sub-threshold buckets suppressed.
 *
 * Response: { success, mode, stats:{ poolRows, samples, buckets,
 *             provinceBuckets, municipalityBuckets, computedAt } }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { ACTIVE_DB_STATUSES, PRE_AUCTION_DB_STATUSES } from '@/lib/auction-status';
import { coerceFiniteNumber } from '@/lib/auction-derive';
import {
  BENCHMARK_CATEGORIES,
  PROVINCE_LEVEL_SENTINEL,
  computeBenchmarks,
  toBenchmarkSample,
  type BenchmarkSample,
} from '@/lib/benchmark';
import type { Prisma, AuctionStatus } from '@prisma/client';

// active + upcoming — "what's on the market in this area right now". Cast: the
// status constants are the AuctionStatus enum values as strings.
const BENCHMARK_POOL_STATUSES = [
  ...ACTIVE_DB_STATUSES,
  ...PRE_AUCTION_DB_STATUSES,
] as unknown as AuctionStatus[];

export async function POST(req: NextRequest) {
  const gate = await requireAdminOrCron(req);
  if (gate instanceof NextResponse) return gate;

  try {
    // Pull only the columns the benchmark needs, only for rows that can
    // possibly contribute (property category, has surface).
    const rows = await prisma.auction.findMany({
      where: {
        status: { in: BENCHMARK_POOL_STATUSES },
        category: { in: BENCHMARK_CATEGORIES as string[] },
        surfaceM2: { not: null },
      },
      select: {
        province: true,
        category: true,
        municipality: true,
        valorSubasta: true,
        appraisalValue: true,
        surfaceM2: true,
      },
    });

    const samples: BenchmarkSample[] = [];
    for (const r of rows) {
      const s = toBenchmarkSample({
        province: r.province,
        category: r.category,
        municipality: r.municipality,
        valorSubasta: coerceFiniteNumber(r.valorSubasta),
        appraisalValue: coerceFiniteNumber(r.appraisalValue),
        surfaceM2: coerceFiniteNumber(r.surfaceM2),
      });
      if (s) samples.push(s);
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
