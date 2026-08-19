/**
 * Unit tests for the price-per-m² compute + dwelling restriction + area-median
 * (n>=8) gate. Price-per-m2 dispatch (Forge, Ken 2026-08-19).
 * Run with: npx tsx src/lib/benchmark.price-per-m2.test.ts
 * No framework — plain assertions, exit-code-driven (repo convention).
 *
 * Covers exactly the three brief guarantees:
 *   1. pricePerM2 = value / surfaceM2 with div-by-zero / null / implausible guards.
 *   2. DWELLING RESTRICTION — €/m² only for Viviendas / Locales / Naves;
 *      NOT garages / land / trasteros / vehicles (which now carry surfaceM2
 *      after Ghost's full-corpus backfill).
 *   3. AREA MEDIAN — a municipality/province bucket is published ONLY at
 *      n >= 8 comparables (MIN_SAMPLE), with the sample size carried; below
 *      the floor the signal is honest-null. Median correct for odd/even n and
 *      NULL-bearing input.
 */
import { derivePricePerM2 } from './auction-derive';
import {
  isBenchmarkCategory,
  isDwellingCategory,
  toBenchmarkSample,
  computeBenchmarks,
  buildRegionBenchmarkSignal,
  benchmarkKey,
  MIN_SAMPLE,
  PROVINCE_LEVEL_SENTINEL,
  BENCHMARK_RECENCY_MONTHS,
  benchmarkRecencyCutoff,
  type BenchmarkRow,
  type BenchmarkSample,
} from './benchmark';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.error(`  FAIL ${name}`); }
}

// ── 1. pricePerM2 = value / m², with guards ─────────────────────────────────
{
  check('€/m² = round(valorSubasta / m²)', derivePricePerM2(100_000, null, 50) === 2000);
  check('€/m² rounds to whole euro', derivePricePerM2(100_000, null, 30) === Math.round(100_000 / 30));
  check('valorSubasta preferred over appraisal', derivePricePerM2(100_000, 200_000, 50) === 2000);
  check('appraisal fallback when valorSubasta null', derivePricePerM2(null, 200_000, 50) === 4000);
  check('appraisal fallback when valorSubasta 0', derivePricePerM2(0, 200_000, 50) === 4000);
  // Guards → honest-null
  check('null m² → null (never fabricate)', derivePricePerM2(100_000, null, null) === null);
  check('m² = 0 → null (div-by-zero guard)', derivePricePerM2(100_000, null, 0) === null);
  check('negative m² → null', derivePricePerM2(100_000, null, -20) === null);
  check('no numerator (both null) → null', derivePricePerM2(null, null, 50) === null);
  check('both numerators 0 → null', derivePricePerM2(0, 0, 50) === null);
  check('NaN m² → null', derivePricePerM2(100_000, null, Number.NaN) === null);
}

// ── 2. DWELLING RESTRICTION ─────────────────────────────────────────────────
{
  // Dwelling categories → €/m² is meaningful.
  for (const c of ['Viviendas', 'Locales', 'Naves industriales']) {
    check(`dwelling: ${c} → benchmarkable`, isBenchmarkCategory(c) === true);
    check(`dwelling alias: ${c}`, isDwellingCategory(c) === true);
  }
  // Non-dwelling categories that NOW carry surfaceM2 (Ghost backfill) → excluded.
  for (const c of ['Garajes', 'Trasteros', 'Terrenos', 'Fincas rústicas', 'Otros inmuebles', 'Turismos', 'Maquinaria']) {
    check(`non-dwelling: ${c} → excluded from €/m²`, isBenchmarkCategory(c) === false);
  }
  check('null category → excluded', isBenchmarkCategory(null) === false);

  // toBenchmarkSample: a garage WITH a valid surface+price still yields NO sample.
  const garage = toBenchmarkSample({
    province: 'Madrid', category: 'Garajes', municipality: 'Madrid',
    valorSubasta: 20_000, appraisalValue: 25_000, surfaceM2: 12,
  });
  check('garage w/ surface+price → no benchmark sample', garage === null);

  // Land (Terrenos) with a huge surface → excluded (€/m² meaningless).
  const land = toBenchmarkSample({
    province: 'Toledo', category: 'Terrenos', municipality: 'Ocaña',
    valorSubasta: 500_000, appraisalValue: null, surfaceM2: 10_000,
  });
  check('land w/ surface+price → no benchmark sample', land === null);

  // A dwelling with a real surface → a sample IS produced.
  const flat = toBenchmarkSample({
    province: 'Madrid', category: 'Viviendas', municipality: 'Madrid',
    valorSubasta: 150_000, appraisalValue: null, surfaceM2: 75,
  });
  check('dwelling w/ surface+price → benchmark sample produced', flat !== null && flat.eurM2 === 2000);
}

// ── 3. AREA MEDIAN — n >= 8 gate, sample size carried, median correctness ────
function dwellingSamples(muni: string, values: number[]): BenchmarkSample[] {
  return values.map((eurM2) => ({ province: 'Madrid', category: 'Viviendas', municipality: muni, eurM2, basis: 'sold' as const }));
}

{
  // MIN_SAMPLE is Ken's >= 8 ruling.
  check('MIN_SAMPLE === 8 (Ken ruling)', MIN_SAMPLE === 8);

  // 7 tight comparables → BELOW floor → NO bucket at muni OR province.
  const below = computeBenchmarks(dwellingSamples('Getafe', [1900, 1950, 2000, 2050, 2100, 2150, 2200]));
  check('n=7 → no municipality bucket', !below.some((b) => b.municipality === 'Getafe'));
  check('n=7 → no province bucket either', !below.some((b) => b.municipality === PROVINCE_LEVEL_SENTINEL));

  // 8 tight comparables → bucket published (muni AND province), sampleSize carried.
  const eight = [1900, 1950, 2000, 2050, 2100, 2150, 2200, 2250];
  const at = computeBenchmarks(dwellingSamples('Getafe', eight));
  const muniB = at.find((b) => b.municipality === 'Getafe');
  const provB = at.find((b) => b.municipality === PROVINCE_LEVEL_SENTINEL);
  check('n=8 → municipality bucket published', muniB !== undefined);
  check('n=8 → sampleSize carried (=8, tight set survives IQR)', muniB?.sampleSize === 8);
  check('n=8 → province bucket published', provB !== undefined);
  // Even-n median = mean of the two middles (2050,2100) = 2075.
  check('even-n median interpolates the two middles', muniB?.medianEurM2 === 2075);

  // Odd-n median (9 tight values) = the exact middle.
  const nine = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800];
  const odd = computeBenchmarks(dwellingSamples('Alcorcón', nine));
  const oddB = odd.find((b) => b.municipality === 'Alcorcón');
  check('odd-n median = exact middle (1400)', oddB?.medianEurM2 === 1400);

  // IQR trim drops a wild outlier: 8 tight + 1 absurd (still >= 8 after trim).
  const withOutlier = [1900, 1950, 2000, 2050, 2100, 2150, 2200, 2250, 25_000];
  const trimmed = computeBenchmarks(dwellingSamples('Leganés', withOutlier));
  const trimB = trimmed.find((b) => b.municipality === 'Leganés');
  check('IQR trim removes the 25k outlier from the bucket', trimB !== undefined && trimB.maxEurM2 < 25_000);

  // Mixed-NULL input: rows with no computable €/m² never become samples, so a
  // muni that has 8 real + several null-surface rows still publishes on the 8.
  const rawRows = [
    ...eight.map((v) => ({ province: 'Madrid', category: 'Viviendas', municipality: 'Móstoles', valorSubasta: v * 50, appraisalValue: null, surfaceM2: 50 })),
    { province: 'Madrid', category: 'Viviendas', municipality: 'Móstoles', valorSubasta: 100_000, appraisalValue: null, surfaceM2: null }, // null m² → dropped
    { province: 'Madrid', category: 'Viviendas', municipality: 'Móstoles', valorSubasta: null, appraisalValue: null, surfaceM2: 60 },     // no numerator → dropped
  ];
  const samples = rawRows.map(toBenchmarkSample).filter((s): s is BenchmarkSample => s !== null);
  check('mixed-null input → only the 8 real rows sampled', samples.length === 8);
  const mixB = computeBenchmarks(samples).find((b) => b.municipality === 'Móstoles');
  check('mixed-null → bucket still published on the 8', mixB?.sampleSize === 8);
}

// ── 4. Per-auction signal: muni preferred, honest-null, dwelling-gated ───────
{
  const lookup = new Map<string, BenchmarkRow>();
  const muniRow: BenchmarkRow = { province: 'Madrid', category: 'Viviendas', municipality: 'Madrid', sampleSize: 40, medianEurM2: 3000, p25EurM2: 2500, p75EurM2: 3500 };
  const provRow: BenchmarkRow = { province: 'Madrid', category: 'Viviendas', municipality: PROVINCE_LEVEL_SENTINEL, sampleSize: 900, medianEurM2: 2600, p25EurM2: null, p75EurM2: null };
  lookup.set(benchmarkKey('Madrid', 'Viviendas', 'Madrid'), muniRow);
  lookup.set(benchmarkKey('Madrid', 'Viviendas', PROVINCE_LEVEL_SENTINEL), provRow);

  const sig = buildRegionBenchmarkSignal(
    { province: 'Madrid', category: 'Viviendas', municipality: 'Madrid', valorSubasta: 240_000, appraisalValue: null, surfaceM2: 80 },
    lookup,
  );
  check('signal: municipality bucket preferred', sig?.scope === 'municipality' && sig.sampleSize === 40);
  check('signal: own €/m² computed (3000)', sig?.eurM2 === 3000);
  check('signal: deltaPct vs muni median (0%)', sig?.deltaPct === 0);

  // A municipality WITHOUT its own bucket falls back to province.
  const sigProv = buildRegionBenchmarkSignal(
    { province: 'Madrid', category: 'Viviendas', municipality: 'Rivas', valorSubasta: 130_000, appraisalValue: null, surfaceM2: 50 },
    lookup,
  );
  check('signal: falls back to province bucket', sigProv?.scope === 'province' && sigProv.sampleSize === 900);

  // A GARAGE never gets a signal even if a (stale) lookup row existed.
  const sigGarage = buildRegionBenchmarkSignal(
    { province: 'Madrid', category: 'Garajes', municipality: 'Madrid', valorSubasta: 20_000, appraisalValue: null, surfaceM2: 12 },
    lookup,
  );
  check('signal: garage → honest-null (dwelling gate)', sigGarage === null);

  // No surface → honest-null even for a dwelling.
  const sigNoSurface = buildRegionBenchmarkSignal(
    { province: 'Madrid', category: 'Viviendas', municipality: 'Madrid', valorSubasta: 240_000, appraisalValue: null, surfaceM2: null },
    lookup,
  );
  check('signal: no surface → honest-null', sigNoSurface === null);
}

// ── 5. Pool-widen: soldPrice-first preference + basis flag + recency window ──
//     (Forge, benchmark-pool-widen dispatch 2026-08-19)
{
  // soldPrice (whole €) OVERRIDES valorSubasta: 300k sold / 100 m² = 3000, not
  // the 2000 valorSubasta would give.
  const sold = toBenchmarkSample({
    province: 'Madrid', category: 'Viviendas', municipality: 'Getafe',
    soldPriceEur: 300_000, valorSubasta: 200_000, appraisalValue: null, surfaceM2: 100,
  });
  check('soldPrice preferred over valorSubasta', sold?.eurM2 === 3000);
  check('soldPrice → basis "sold"', sold?.basis === 'sold');

  // valorSubasta used (basis) when there is no sold price.
  const vs = toBenchmarkSample({
    province: 'Madrid', category: 'Viviendas', municipality: 'Getafe',
    soldPriceEur: null, valorSubasta: 200_000, appraisalValue: 500_000, surfaceM2: 100,
  });
  check('no soldPrice → valorSubasta used (2000)', vs?.eurM2 === 2000);
  check('no soldPrice → basis "valorSubasta"', vs?.basis === 'valorSubasta');

  // appraisal is the last-resort fallback (basis reflects it).
  const ap = toBenchmarkSample({
    province: 'Madrid', category: 'Viviendas', municipality: 'Getafe',
    soldPriceEur: 0, valorSubasta: 0, appraisalValue: 400_000, surfaceM2: 100,
  });
  check('sold=0 & valor=0 → appraisal fallback (4000)', ap?.eurM2 === 4000);
  check('appraisal fallback → basis "appraisal"', ap?.basis === 'appraisal');

  // soldPrice ≤ 0 (DESIERTA / hidden) is treated as absent → falls to valorSubasta.
  const desierta = toBenchmarkSample({
    province: 'Madrid', category: 'Viviendas', municipality: 'Getafe',
    soldPriceEur: 0, valorSubasta: 150_000, appraisalValue: null, surfaceM2: 100,
  });
  check('soldPrice 0 → falls back to valorSubasta', desierta?.eurM2 === 1500 && desierta?.basis === 'valorSubasta');

  // Existing (no soldPriceEur field) callers still work and default to valorSubasta basis.
  const legacy = toBenchmarkSample({
    province: 'Madrid', category: 'Viviendas', municipality: 'Getafe',
    valorSubasta: 250_000, appraisalValue: null, surfaceM2: 100,
  });
  check('legacy row (no soldPriceEur field) still samples', legacy?.eurM2 === 2500 && legacy?.basis === 'valorSubasta');

  // Dwelling gate + plausibility band still hold on the sold path.
  const soldGarage = toBenchmarkSample({
    province: 'Madrid', category: 'Garajes', municipality: 'Getafe',
    soldPriceEur: 300_000, valorSubasta: null, appraisalValue: null, surfaceM2: 100,
  });
  check('sold garage → still rejected (dwelling gate)', soldGarage === null);
  const soldImplausible = toBenchmarkSample({
    province: 'Madrid', category: 'Viviendas', municipality: 'Getafe',
    soldPriceEur: 300_000, valorSubasta: null, appraisalValue: null, surfaceM2: 1,
  });
  check('sold €/m² above plausibility band → rejected', soldImplausible === null);

  // Recency window: 60 months, reproducible against an injected "now".
  check('BENCHMARK_RECENCY_MONTHS is 60', BENCHMARK_RECENCY_MONTHS === 60);
  const now = new Date('2026-08-19T00:00:00.000Z');
  const cutoff = benchmarkRecencyCutoff(now);
  check('recency cutoff = now − 60 months (2021-08-19)', cutoff.toISOString().startsWith('2021-08-19'));
  const soldDate2020 = new Date('2020-01-01T00:00:00.000Z');
  const soldDate2024 = new Date('2024-01-01T00:00:00.000Z');
  check('a 2020 sale is OUTSIDE the 60mo window', soldDate2020 < cutoff);
  check('a 2024 sale is INSIDE the 60mo window', soldDate2024 >= cutoff);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
