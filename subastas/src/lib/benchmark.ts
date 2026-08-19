/**
 * benchmark.ts — region €/m² benchmark: pure computation + per-auction
 * comparison. Phase 3 (Forge, 2026-07-16).
 *
 * The value signal a property portal lives on: "is this cheap for the area?".
 * We answer it by comparing an auction's own €/m² against a benchmark median
 * for the same province × property-category (municipality-level when the
 * bucket is dense enough, else province-level).
 *
 * Method (Ken-locked, dispatch brief phase3):
 *   - €/m² per row = derivePricePerM2(valorSubasta, appraisalValue, surfaceM2)
 *     — the SAME definition the card pill uses, so listing €/m² and the
 *     benchmark are always on one basis (valorSubasta preferred, appraisal
 *     fallback). NEVER a mean — auction data is skew/outlier-heavy.
 *   - Outlier handling: a hard plausibility band drops surface-parse garbage
 *     (e.g. €/m² of 0.4 or 480 000), THEN an IQR (1.5×) trim per bucket drops
 *     the statistical tails before the median is taken.
 *   - Minimum-sample honesty: a bucket is only published when it has
 *     >= MIN_SAMPLE comparables AFTER trimming. A median of 2 auctions is
 *     noise — suppressed. Municipality buckets that miss the floor simply
 *     don't exist; the per-auction lookup falls back to the province bucket,
 *     and if that also misses, the signal is honest-null.
 *   - Non-property categories (vehicles, art, machinery) are excluded from the
 *     benchmark entirely — €/m² is meaningless there.
 *
 * Honest-null contract:
 *   - No benchmark without real comparables (>= MIN_SAMPLE).
 *   - No €/m² for a row without a real surface — derivePricePerM2 returns null
 *     and the comparison is null. We NEVER fabricate a benchmark for a
 *     surface-less row.
 */

import { OFFICIAL_CATEGORIES } from '@/lib/constants';
import { derivePricePerM2, coerceFiniteNumber } from '@/lib/auction-derive';

/**
 * Property categories eligible for a €/m² figure — the DWELLING subset (Ken,
 * price-per-m2 dispatch 2026-08-19). NARROWED from REAL_ESTATE: Ghost's
 * full-corpus backfill (2026-08-19) now populates surfaceM2 on garages,
 * trasteros, land (Terrenos/Fincas) and even vehicles, so €/m² must be gated
 * to the categories where a per-square-metre price is a real comparable signal
 * (Viviendas / Locales / Naves industriales). Vehicles / Maquinaria / Joyas /
 * Arte AND garages / land are all excluded. Single source of truth for both
 * the card €/m² pill and the region benchmark.
 */
export const BENCHMARK_CATEGORIES: readonly string[] = OFFICIAL_CATEGORIES.DWELLING;

const BENCHMARK_CATEGORY_SET: ReadonlySet<string> = new Set(BENCHMARK_CATEGORIES);

/** True when a category is a DWELLING type for which €/m² is meaningful. */
export function isBenchmarkCategory(category: string | null | undefined): boolean {
  return category != null && BENCHMARK_CATEGORY_SET.has(category);
}

/**
 * Alias of {@link isBenchmarkCategory}, named for the read-side €/m² pill gate.
 * The card €/m² pill and the benchmark share ONE eligibility rule: a category
 * is priced per m² iff it is a dwelling. Use this name at the pricePerM2 derive
 * sites so the intent ("only dwellings get €/m²") is explicit.
 */
export const isDwellingCategory = isBenchmarkCategory;

/**
 * Minimum comparables (after trimming) for a bucket to be published. Below
 * this the median is noise and we suppress the bucket — the municipality (then
 * province) lookup falls back, and if neither clears the floor the area signal
 * is honest-null and the UI hides it. Raised 5 → 8 (Ken's ruling, price-per-m2
 * dispatch 2026-08-19): "shown only where we have >= 8 comparable sales".
 */
export const MIN_SAMPLE = 8;

/**
 * Hard plausibility band for €/m² (whole euros). Anything outside is a data
 * error (surface parsed as 1 m², valorSubasta in the wrong units, etc.) and
 * is dropped BEFORE the IQR trim. Deliberately wide — the IQR trim does the
 * fine work; this band only kills the physically-impossible tail.
 */
export const PLAUSIBILITY_MIN_EUR_M2 = 50;
export const PLAUSIBILITY_MAX_EUR_M2 = 30_000;

/** IQR multiplier for the per-bucket outlier trim. */
const IQR_K = 1.5;

/**
 * Recency window (months) for CONCLUDED/adjudicated comparables entering the
 * benchmark pool (Forge, benchmark-pool-widen dispatch 2026-08-19). A decade-old
 * sale is a poor proxy for today's area price, so concluded rows older than this
 * (by soldDate) are excluded from the median. Aligned with the SEO concluded
 * ramp's 60-month step (see lib/seo/concluded-indexable.ts). Active + upcoming
 * rows carry no sale date and represent the live market — they are NOT
 * date-filtered. Ken's call was "consider ~60mo"; locked at 60 here.
 */
export const BENCHMARK_RECENCY_MONTHS = 60;

/**
 * The cutoff Date: concluded comparables with soldDate strictly before this are
 * dropped. `now` is injectable for reproducible tests.
 */
export function benchmarkRecencyCutoff(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - BENCHMARK_RECENCY_MONTHS);
  return d;
}

/** Sentinel municipality value for a PROVINCE-LEVEL bucket (municipality NULL
 * in the source row). Empty string keeps the (province, category, municipality)
 * unique key clean and makes upsert deterministic (SQL NULLs are distinct). */
export const PROVINCE_LEVEL_SENTINEL = '';

/** Which price the €/m² numerator came from (provenance flag, Forge
 * benchmark-pool-widen 2026-08-19). 'sold' = adjudicated winning bid (the truest
 * market signal), then valorSubasta, then appraisal as last resort. */
export type BenchmarkPriceBasis = 'sold' | 'valorSubasta' | 'appraisal';

/** One raw comparable fed into the aggregator. */
export type BenchmarkSample = {
  province: string;
  category: string;
  municipality: string | null;
  eurM2: number;
  /** Provenance of the €/m² numerator (observability only — not aggregated). */
  basis: BenchmarkPriceBasis;
};

/** A published benchmark bucket (one row of the RegionBenchmark table). */
export type BenchmarkBucket = {
  province: string;
  category: string;
  /** '' = province-level bucket; otherwise the municipality. */
  municipality: string;
  sampleSize: number;
  medianEurM2: number;
  p25EurM2: number;
  p75EurM2: number;
  minEurM2: number;
  maxEurM2: number;
};

/**
 * Build a benchmark sample from a raw auction row, or null when the row can't
 * contribute (non-property category, no province, or no computable €/m²).
 * Used by the precompute job AND (indirectly) the per-auction comparison so
 * the €/m² definition is identical on both sides.
 */
export function toBenchmarkSample(row: {
  province: string | null | undefined;
  category: string | null | undefined;
  municipality: string | null | undefined;
  /** Adjudicated winning bid in WHOLE EUROS (not cents). When present and > 0
   * it OVERRIDES valorSubasta/appraisal — the sold price is the truest market
   * signal (Ken §3, benchmark-pool-widen 2026-08-19). Optional: omitted for
   * active/upcoming rows that have not sold. */
  soldPriceEur?: number | null | undefined;
  valorSubasta: number | null | undefined;
  appraisalValue: number | null | undefined;
  surfaceM2: number | null | undefined;
}): BenchmarkSample | null {
  const province = (row.province ?? '').trim();
  const category = (row.category ?? '').trim();
  if (!province || !isBenchmarkCategory(category)) return null;

  // Price preference: soldPrice FIRST, then valorSubasta, then appraisal.
  // We reuse derivePricePerM2 (the card-pill definition — same surface guards,
  // same whole-€ rounding) by feeding the sold price as its primary numerator
  // when present, so listing €/m² and benchmark €/m² stay on one arithmetic.
  const sold = coerceFiniteNumber(row.soldPriceEur);
  const valor = coerceFiniteNumber(row.valorSubasta);
  const appraisal = coerceFiniteNumber(row.appraisalValue);
  const usedSold = sold != null && sold > 0;
  const primary = usedSold ? sold : valor;
  const eurM2 = derivePricePerM2(primary, row.appraisalValue, row.surfaceM2);
  if (eurM2 == null) return null;
  if (eurM2 < PLAUSIBILITY_MIN_EUR_M2 || eurM2 > PLAUSIBILITY_MAX_EUR_M2) return null;

  const basis: BenchmarkPriceBasis = usedSold
    ? 'sold'
    : valor != null && valor > 0
      ? 'valorSubasta'
      : 'appraisal';
  const municipality = (row.municipality ?? '').trim() || null;
  return { province, category, municipality, eurM2, basis };
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

/**
 * IQR-trim a set of €/m² values (1.5× rule) and, if >= MIN_SAMPLE survive,
 * return the bucket statistics. Returns null when the bucket is too thin.
 */
function summarizeBucket(values: number[]): Omit<BenchmarkBucket, 'province' | 'category' | 'municipality'> | null {
  if (values.length < MIN_SAMPLE) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - IQR_K * iqr;
  const hi = q3 + IQR_K * iqr;
  const trimmed = sorted.filter((v) => v >= lo && v <= hi);
  if (trimmed.length < MIN_SAMPLE) return null;
  return {
    sampleSize: trimmed.length,
    medianEurM2: Math.round(percentile(trimmed, 0.5)),
    p25EurM2: Math.round(percentile(trimmed, 0.25)),
    p75EurM2: Math.round(percentile(trimmed, 0.75)),
    minEurM2: Math.round(trimmed[0]),
    maxEurM2: Math.round(trimmed[trimmed.length - 1]),
  };
}

/**
 * Aggregate raw samples into published benchmark buckets.
 *
 * Emits, per (province, category):
 *   - one PROVINCE-LEVEL bucket (municipality = '') if it clears MIN_SAMPLE;
 *   - one bucket per municipality that INDEPENDENTLY clears MIN_SAMPLE.
 *
 * A municipality that misses the floor contributes to its province bucket but
 * gets no bucket of its own — the per-auction lookup falls back to province.
 */
export function computeBenchmarks(samples: readonly BenchmarkSample[]): BenchmarkBucket[] {
  // province|category -> all eur/m²   AND   province|category|muni -> eur/m²
  const provinceGroups = new Map<string, { province: string; category: string; values: number[] }>();
  const muniGroups = new Map<string, { province: string; category: string; municipality: string; values: number[] }>();

  for (const s of samples) {
    const pKey = `${s.province} ${s.category}`;
    let pg = provinceGroups.get(pKey);
    if (!pg) {
      pg = { province: s.province, category: s.category, values: [] };
      provinceGroups.set(pKey, pg);
    }
    pg.values.push(s.eurM2);

    if (s.municipality) {
      const mKey = `${pKey} ${s.municipality}`;
      let mg = muniGroups.get(mKey);
      if (!mg) {
        mg = { province: s.province, category: s.category, municipality: s.municipality, values: [] };
        muniGroups.set(mKey, mg);
      }
      mg.values.push(s.eurM2);
    }
  }

  const out: BenchmarkBucket[] = [];
  for (const pg of provinceGroups.values()) {
    const stats = summarizeBucket(pg.values);
    if (stats) out.push({ province: pg.province, category: pg.category, municipality: PROVINCE_LEVEL_SENTINEL, ...stats });
  }
  for (const mg of muniGroups.values()) {
    const stats = summarizeBucket(mg.values);
    if (stats) out.push({ province: mg.province, category: mg.category, municipality: mg.municipality, ...stats });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-auction comparison (read-side)
// ---------------------------------------------------------------------------

/** A benchmark row as loaded from the RegionBenchmark table for lookup. */
export type BenchmarkRow = {
  province: string;
  category: string;
  municipality: string; // '' = province-level
  sampleSize: number;
  medianEurM2: number;
  p25EurM2?: number | null;
  p75EurM2?: number | null;
};

/** The per-auction signal projected onto the API payload. Honest-null when
 * there is no computable €/m² or no qualifying benchmark. */
export type RegionBenchmarkSignal = {
  /** This auction's own €/m² (whole euros). */
  eurM2: number;
  /** Benchmark median €/m² for the resolved scope. */
  benchmarkEurM2: number;
  /** 'municipality' | 'province' — which bucket answered. */
  scope: 'municipality' | 'province';
  /** Human region label the benchmark refers to (municipality or province). */
  regionLabel: string;
  /** Comparables behind the benchmark. */
  sampleSize: number;
  /** Signed % delta vs benchmark, rounded. Negative = cheaper than area. */
  deltaPct: number;
  /** Interquartile band, when stored (context for "how spread out"). */
  p25EurM2: number | null;
  p75EurM2: number | null;
};

/**
 * Build a lookup key. Callers index rows they fetched by this key so the
 * comparison is O(1) per auction.
 */
export function benchmarkKey(province: string, category: string, municipality: string): string {
  return `${province} ${category} ${municipality}`;
}

/**
 * Resolve the best benchmark for one auction and compute the delta.
 *
 * @param lookup  Map keyed by benchmarkKey(province, category, municipality).
 *                Must contain municipality-level ('' for province) rows that
 *                cleared MIN_SAMPLE at precompute time.
 * Returns null (honest) when €/m² is not computable or no qualifying bucket
 * exists at either municipality or province scope.
 */
export function buildRegionBenchmarkSignal(
  auction: {
    province: string | null | undefined;
    category: string | null | undefined;
    municipality: string | null | undefined;
    valorSubasta: number | null | undefined;
    appraisalValue: number | null | undefined;
    surfaceM2: number | null | undefined;
  },
  lookup: ReadonlyMap<string, BenchmarkRow>,
): RegionBenchmarkSignal | null {
  const province = (auction.province ?? '').trim();
  const category = (auction.category ?? '').trim();
  if (!province || !isBenchmarkCategory(category)) return null;

  // €/m² for THIS auction — same definition as the card pill. Null surface ⇒
  // null signal (never fabricate a benchmark for a surface-less row).
  const eurM2 = derivePricePerM2(auction.valorSubasta, auction.appraisalValue, auction.surfaceM2);
  if (eurM2 == null) return null;

  const municipality = (auction.municipality ?? '').trim();

  // Prefer the municipality bucket (only present when it cleared MIN_SAMPLE),
  // else province-level.
  let row: BenchmarkRow | undefined;
  let scope: 'municipality' | 'province' = 'province';
  let regionLabel = province;
  if (municipality) {
    const m = lookup.get(benchmarkKey(province, category, municipality));
    if (m) {
      row = m;
      scope = 'municipality';
      regionLabel = municipality;
    }
  }
  if (!row) {
    row = lookup.get(benchmarkKey(province, category, PROVINCE_LEVEL_SENTINEL));
    scope = 'province';
    regionLabel = province;
  }
  if (!row || !(row.medianEurM2 > 0)) return null;

  const deltaPct = Math.round(((eurM2 - row.medianEurM2) / row.medianEurM2) * 100);

  return {
    eurM2,
    benchmarkEurM2: row.medianEurM2,
    scope,
    regionLabel,
    sampleSize: row.sampleSize,
    deltaPct,
    p25EurM2: row.p25EurM2 ?? null,
    p75EurM2: row.p75EurM2 ?? null,
  };
}
