/**
 * POST /api/admin/registro/recompute — rebuild the AuctionOutcomeStats table.
 *
 * Auction-outcome registry (Forge, 2026-07-18). Classifies every finished (or
 * suspended) auction via the canonical `auctionOutcome()` taxonomy, rolls the
 * rows up across the (period × basis × geo × category × outcome) lattice, and
 * REPLACES the table contents atomically. This is the NIGHTLY job body — the
 * Python scheduler POSTs here (same pattern as /api/admin/benchmark/recompute);
 * it can also be run manually.
 *
 * Auth: `CRON_SECRET` Bearer OR an admin session (requireAdminOrCron).
 *
 * Why not live: 237k rows + grouped percentile aggregation would hammer PG on
 * every request (the app had a pg-connection-exhaustion incident). Precompute →
 * the read APIs are single indexed lookups.
 *
 * Scope: ALL categories ("analyze everything" — counts are cheap and the
 * aggregate covers Maquinaria/Joyas/Arte too). The INDEXABLE registry surface
 * stays properties+vehicles (concluded-indexable.ts); this rollup is broader.
 *
 * Response: { success, mode, stats:{ sourceRows, buckets, byOutcome, computedAt } }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { coerceFiniteNumber } from '@/lib/auction-derive';
import { auctionOutcome, type AuctionOutcome } from '@/lib/seo/auction-outcome';
import {
  rollupOutcomeStats,
  monthBucket,
  type OutcomeStatsInput,
} from '@/lib/registro/outcome-stats';
import type { Prisma, AuctionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Rows that have LEFT the live pool (any terminal status) OR are SUSPENDIDA
// (candidate for stale→CANCELADA). Clearly-active states (PROXIMA_APERTURA /
// CELEBRANDOSE / ACTIVE / PRE_AUCTION) are never an outcome and are excluded
// from the fetch — they'd only ever classify INDETERMINADO. Legacy statuses
// included so old rows are covered.
const ROLLUP_SOURCE_STATUSES = [
  'CONCLUIDA_PORTAL',
  'FINALIZADA_AUTORIDAD',
  'FINISHED',
  'CANCELADA',
  'CANCELLED',
  'SUSPENDIDA',
  'SUSPENDED',
] as unknown as AuctionStatus[];

export async function POST(req: NextRequest) {
  const gate = await requireAdminOrCron(req);
  if (gate instanceof NextResponse) return gate;

  const now = new Date();

  try {
    const rows = await prisma.auction.findMany({
      where: { status: { in: ROLLUP_SOURCE_STATUSES } },
      select: {
        province: true,
        municipality: true,
        category: true,
        status: true,
        saleResult: true,
        resumeAt: true,
        updatedAt: true,
        publishedAt: true,
        endsAt: true,
        soldPrice: true,
        appraisalValue: true,
        valorSubasta: true,
      },
    });

    const byOutcome: Record<AuctionOutcome, number> = {
      VENDIDA: 0,
      DESIERTA: 0,
      CANCELADA: 0,
      FINALIZADA_SIN_RESULTADO: 0,
      INDETERMINADO: 0,
    };

    const inputs: OutcomeStatsInput[] = rows.map((r) => {
      const outcome = auctionOutcome(
        { status: r.status, saleResult: r.saleResult, resumeAt: r.resumeAt, updatedAt: r.updatedAt },
        now,
      );
      byOutcome[outcome] += 1;
      return {
        province: r.province,
        municipality: r.municipality,
        category: r.category,
        outcome,
        publishedMonth: monthBucket(r.publishedAt),
        concludedMonth: monthBucket(r.endsAt),
        // soldPrice is BigInt cents (nullable). Number() is safe — max realistic
        // value (~21M EUR = 2.1e9 cents) is far below Number.MAX_SAFE_INTEGER.
        soldPriceCents: r.soldPrice != null ? Number(r.soldPrice) : null,
        appraisalValue: coerceFiniteNumber(r.appraisalValue),
        valorSubasta: coerceFiniteNumber(r.valorSubasta),
      };
    });

    const buckets = rollupOutcomeStats(inputs);
    const computedAt = new Date();

    const data: Prisma.AuctionOutcomeStatsCreateManyInput[] = buckets.map((b) => ({
      period: b.period,
      periodBasis: b.periodBasis,
      province: b.province,
      municipality: b.municipality,
      category: b.category,
      outcome: b.outcome,
      count: b.count,
      soldPriceMedianCents: b.soldPriceMedianCents,
      soldPriceP25Cents: b.soldPriceP25Cents,
      soldPriceP75Cents: b.soldPriceP75Cents,
      discountToAppraisalMedian: b.discountToAppraisalMedian,
      discountToValorSubastaMedian: b.discountToValorSubastaMedian,
      computedAt,
    }));

    // Atomic full replace — old buckets gone, new buckets in, in one tx so a
    // concurrent read never sees an empty table. createMany chunked to stay
    // well under PG parameter limits.
    const CHUNK = 5_000;
    const chunks: Prisma.AuctionOutcomeStatsCreateManyInput[][] = [];
    for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));

    await prisma.$transaction([
      prisma.auctionOutcomeStats.deleteMany({}),
      ...chunks.map((c) => prisma.auctionOutcomeStats.createMany({ data: c })),
    ]);

    return NextResponse.json({
      success: true,
      mode: gate.mode,
      stats: {
        sourceRows: rows.length,
        buckets: buckets.length,
        byOutcome,
        computedAt: computedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[registro/recompute] failed:', err);
    return NextResponse.json(
      { success: false, error: 'recompute_failed', details: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/admin/registro/recompute',
    auth: 'Authorization: Bearer <CRON_SECRET> OR admin session',
    effect:
      'Rebuilds AuctionOutcomeStats from all finished/suspended auctions via the canonical auctionOutcome() taxonomy (full replace).',
  });
}
