/**
 * src/lib/registro/outcome-stats.ts — pure aggregation for the auction-outcome
 * stats rollup (the /resultados registry). Nightly precompute (NOT live — the
 * app had a pg-connection-exhaustion incident; 237k rows are never scanned in a
 * request path). The recompute job classifies each finished row via the
 * canonical `auctionOutcome()` taxonomy, then feeds rows here to be rolled up
 * into `AuctionOutcomeStats`.
 *
 * ── Grouping (GROUPING SETS, emulated in-memory) ──────────────────────────
 * Every row contributes to a lattice of buckets so ONE table answers national,
 * province and municipality questions, all-categories and per-category, on two
 * period bases:
 *   geo   ∈ { national(''), province(P), municipality(P,M) }   (M only if present)
 *   cat   ∈ { all(''), specific(C) }
 *   basis ∈ { PUBLISHED (publishedAt month), CONCLUDED (endsAt month) }   — D3 pending,
 *           we compute BOTH and let the UI pick.
 * The bucket key is (period, periodBasis, province, municipality, category,
 * outcome). Empty-string sentinels (NOT NULL) mark the rollup levels so the
 * UNIQUE key is deterministic (SQL NULLs are distinct — the RegionBenchmark
 * lesson).
 *
 * ── Honest-NULL ───────────────────────────────────────────────────────────
 * Counts are always emitted (a single concluded auction in a town is real and
 * belongs on its browse page). Money medians are SUPPRESSED (NULL) when the
 * bucket has fewer than MIN_MEDIAN_SAMPLE VENDIDA rows — a median of two sales
 * is noise. soldPrice is in CENTS end-to-end. Discounts are whole-percent
 * (positive = sold BELOW the reference), VENDIDA-only.
 */

import type { AuctionOutcome } from '@/lib/seo/auction-outcome';

/** Sentinel for a rollup level (national geo / all-municipalities / all-categories). */
export const ROLLUP_ALL = '';

/**
 * Sentinel `period` for the ALL-TIME bucket. Medians do NOT aggregate across
 * per-month buckets (you cannot average medians), so the headline "median sold
 * price / discount" is served from a true percentile over the FULL sample,
 * emitted alongside the per-month buckets. Summary/regions read period='ALL';
 * the trend series reads the "YYYY-MM" buckets.
 */
export const PERIOD_ALL = 'ALL';

/** Minimum VENDIDA sales in a bucket before we publish a money median. */
export const MIN_MEDIAN_SAMPLE = 5;

export type PeriodBasis = 'PUBLISHED' | 'CONCLUDED';

/** One finished-auction row fed into the rollup (already classified). */
export interface OutcomeStatsInput {
  province: string | null | undefined;
  municipality: string | null | undefined;
  category: string | null | undefined;
  outcome: AuctionOutcome;
  /** Month bucket "YYYY-MM" from publishedAt, or null when absent. */
  publishedMonth: string | null;
  /** Month bucket "YYYY-MM" from endsAt, or null when absent. */
  concludedMonth: string | null;
  /** Winning bid in CENTS (VENDIDA only), else null. */
  soldPriceCents: number | null;
  /** Tasación in euros, for discount-to-appraisal (VENDIDA only). */
  appraisalValue: number | null;
  /** Valor subasta in euros, for discount-to-valor (VENDIDA only). */
  valorSubasta: number | null;
}

/** One output row destined for the AuctionOutcomeStats table. */
export interface OutcomeStatsBucket {
  period: string;
  periodBasis: PeriodBasis;
  province: string;
  municipality: string;
  category: string;
  outcome: AuctionOutcome;
  count: number;
  soldPriceMedianCents: bigint | null;
  soldPriceP25Cents: bigint | null;
  soldPriceP75Cents: bigint | null;
  discountToAppraisalMedian: number | null;
  discountToValorSubastaMedian: number | null;
}

/** Linear-interpolated percentile over a pre-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Turn a Date/ISO string into a "YYYY-MM" month bucket (UTC), or null. */
export function monthBucket(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Mutable per-bucket accumulator. */
interface Acc {
  count: number;
  soldPrices: number[]; // cents
  discAppraisal: number[]; // whole-percent
  discValor: number[]; // whole-percent
}

function newAcc(): Acc {
  return { count: 0, soldPrices: [], discAppraisal: [], discValor: [] };
}

/**
 * Discount (whole percent) of a sold price against a reference value.
 * Positive = sold BELOW reference. Returns null unless both are positive and
 * finite. `refEuros` is euros; `soldCents` is cents.
 */
function discountPct(soldCents: number | null, refEuros: number | null): number | null {
  if (soldCents == null || refEuros == null) return null;
  if (!Number.isFinite(soldCents) || !Number.isFinite(refEuros)) return null;
  if (soldCents <= 0 || refEuros <= 0) return null;
  const soldEuros = soldCents / 100;
  return ((refEuros - soldEuros) / refEuros) * 100;
}

/**
 * Roll up finished-auction rows into AuctionOutcomeStats buckets across the full
 * (geo × category × basis) lattice. Pure — deterministic for a given input set.
 */
export function rollupOutcomeStats(rows: readonly OutcomeStatsInput[]): OutcomeStatsBucket[] {
  // key: `${period}|${basis}|${province}|${municipality}|${category}|${outcome}`
  const acc = new Map<string, Acc>();
  // Retain the structured key parts for output without re-parsing.
  const keyMeta = new Map<
    string,
    { period: string; basis: PeriodBasis; province: string; municipality: string; category: string; outcome: AuctionOutcome }
  >();

  const bump = (
    period: string,
    basis: PeriodBasis,
    province: string,
    municipality: string,
    category: string,
    outcome: AuctionOutcome,
    row: OutcomeStatsInput,
  ) => {
    const key = `${period}|${basis}|${province}|${municipality}|${category}|${outcome}`;
    let a = acc.get(key);
    if (!a) {
      a = newAcc();
      acc.set(key, a);
      keyMeta.set(key, { period, basis, province, municipality, category, outcome });
    }
    a.count += 1;
    if (outcome === 'VENDIDA') {
      if (row.soldPriceCents != null && Number.isFinite(row.soldPriceCents) && row.soldPriceCents > 0) {
        a.soldPrices.push(row.soldPriceCents);
      }
      const dA = discountPct(row.soldPriceCents, row.appraisalValue);
      if (dA != null) a.discAppraisal.push(dA);
      const dV = discountPct(row.soldPriceCents, row.valorSubasta);
      if (dV != null) a.discValor.push(dV);
    }
  };

  for (const row of rows) {
    const province = (row.province ?? '').trim();
    const municipality = (row.municipality ?? '').trim();
    const category = (row.category ?? '').trim();

    // geo levels: national, province (if known), municipality (if both known)
    const geoLevels: Array<[string, string]> = [[ROLLUP_ALL, ROLLUP_ALL]];
    if (province) {
      geoLevels.push([province, ROLLUP_ALL]);
      if (municipality) geoLevels.push([province, municipality]);
    }
    // category levels: all + specific (if known)
    const catLevels: string[] = [ROLLUP_ALL];
    if (category) catLevels.push(category);

    // period bases: emit whichever month is derivable
    const bases: Array<[PeriodBasis, string | null]> = [
      ['PUBLISHED', row.publishedMonth],
      ['CONCLUDED', row.concludedMonth],
    ];

    for (const [basis, month] of bases) {
      if (!month) continue;
      // Emit BOTH the "YYYY-MM" month bucket (trend series) AND the ALL-TIME
      // bucket (headline true-median). Same accumulation, two period keys.
      for (const period of [month, PERIOD_ALL]) {
        for (const [prov, muni] of geoLevels) {
          for (const cat of catLevels) {
            bump(period, basis, prov, muni, cat, row.outcome, row);
          }
        }
      }
    }
  }

  const out: OutcomeStatsBucket[] = [];
  for (const [key, a] of acc) {
    const meta = keyMeta.get(key)!;
    const sold = a.soldPrices.length >= MIN_MEDIAN_SAMPLE ? [...a.soldPrices].sort((x, y) => x - y) : null;
    const dA = a.discAppraisal.length >= MIN_MEDIAN_SAMPLE ? [...a.discAppraisal].sort((x, y) => x - y) : null;
    const dV = a.discValor.length >= MIN_MEDIAN_SAMPLE ? [...a.discValor].sort((x, y) => x - y) : null;

    out.push({
      period: meta.period,
      periodBasis: meta.basis,
      province: meta.province,
      municipality: meta.municipality,
      category: meta.category,
      outcome: meta.outcome,
      count: a.count,
      soldPriceMedianCents: sold ? BigInt(Math.round(percentile(sold, 0.5))) : null,
      soldPriceP25Cents: sold ? BigInt(Math.round(percentile(sold, 0.25))) : null,
      soldPriceP75Cents: sold ? BigInt(Math.round(percentile(sold, 0.75))) : null,
      discountToAppraisalMedian: dA ? Math.round(percentile(dA, 0.5) * 10) / 10 : null,
      discountToValorSubastaMedian: dV ? Math.round(percentile(dV, 0.5) * 10) / 10 : null,
    });
  }
  return out;
}
