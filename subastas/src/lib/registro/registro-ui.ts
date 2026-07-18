/**
 * src/lib/registro/registro-ui.ts — shared, framework-neutral UI constants for
 * the /resultados registry surface. Importable by BOTH server components (SSR
 * pages, rows) and client components (the filterable archive island) — it must
 * stay free of any 'use client' / server-only imports.
 *
 * Holds: the registry outcome display order, honest bilingual labels (the
 * "puja máxima" honesty rule lives here), the URL-slug ↔ outcome map for the
 * programmatic /resultados/{outcome}/… pages, the VALIDATED data-viz colours
 * (dataviz skill palette — passes every CVD/contrast check in light & dark,
 * see the palette validator run), and the small bilingual copy dictionary the
 * pages render from (a typed module instead of ~50 keys sprayed across the two
 * next-intl JSON files — cohesive, type-checked, one place to edit).
 */

import type { AuctionOutcome } from '@/lib/seo/auction-outcome';
import { CATEGORY_SLUG_TO_DB_LABEL, CATEGORY_LABEL_PLURAL, type CategorySlug } from '@/lib/seo/slugs';

export type Locale = 'es' | 'en';

// ---------------------------------------------------------------------------
// The row shape returned by /api/registro/list and by readList() — the single
// contract the archive island (client) and the SSR rows both render.
// ---------------------------------------------------------------------------

export interface RegistroListItem {
  id: string;
  boeId: string | null;
  slug: string;
  detailPath: string;
  title: string | null;
  category: string | null;
  province: string | null;
  municipality: string | null;
  outcome: AuctionOutcome;
  soldPriceCents: number | null;
  appraisalValue: number | null;
  valorSubasta: number | null;
  soldDate: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
}

export type OutcomeCounts = Record<AuctionOutcome, number>;

export interface TrendPoint {
  period: string; // 'YYYY-MM'
  counts: OutcomeCounts;
  pctSold: number | null;
  soldPriceMedianCents: number | null;
}

export interface RegistrySummary {
  scope: { periodBasis: string; province: string | null; category: string | null };
  headline: {
    counts: OutcomeCounts;
    registryTotal: number;
    residualIndeterminado: number;
    pctSold: number | null;
    soldPriceMedianCents: number | null;
    discountToAppraisalMedian: number | null;
    discountToValorSubastaMedian: number | null;
  };
  trend: TrendPoint[];
  regions: Array<{
    province: string;
    counts: OutcomeCounts;
    total: number;
    pctSold: number | null;
    soldPriceMedianCents: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// The four registry buckets, in the order they're always shown (positive →
// terminal). INDETERMINADO is never a registry row (residual only).
// ---------------------------------------------------------------------------

export const REGISTRY_OUTCOME_ORDER = [
  'VENDIDA',
  'DESIERTA',
  'CANCELADA',
  'FINALIZADA_SIN_RESULTADO',
] as const;

export type RegistryOutcome = (typeof REGISTRY_OUTCOME_ORDER)[number];

/**
 * Honest public labels. VENDIDA reads "Adjudicada" as the bucket name, and the
 * price is ALWAYS "puja máxima" (highest bid) — never "precio de venta
 * confirmado" (BOE publishes the winning bid, not a legal sale). CANCELADA
 * carries the "estado según último dato" freshness caveat (our status may lag
 * BOE — see auction-outcome.ts STALE_SUSPENDED_DAYS note).
 */
export const OUTCOME_META: Record<
  RegistryOutcome,
  { es: string; en: string; blurbEs: string; blurbEn: string }
> = {
  VENDIDA: {
    es: 'Adjudicada',
    en: 'Awarded',
    blurbEs: 'Recibió al menos una puja; se muestra la puja máxima registrada en el BOE.',
    blurbEn: 'Received at least one bid; the highest bid recorded in the BOE is shown.',
  },
  DESIERTA: {
    es: 'Desierta',
    en: 'No bids',
    blurbEs: 'Concluyó sin ninguna puja.',
    blurbEn: 'Concluded without any bid.',
  },
  CANCELADA: {
    es: 'Cancelada',
    en: 'Cancelled',
    blurbEs: 'Cancelada o suspendida sin reanudarse. Estado según nuestro último dato del BOE.',
    blurbEn: 'Cancelled or suspended and never resumed. Status per our latest BOE record.',
  },
  FINALIZADA_SIN_RESULTADO: {
    es: 'Finalizada sin resultado',
    en: 'Finalised, result withheld',
    blurbEs: 'Finalizada por la autoridad sin publicarse el resultado.',
    blurbEn: 'Finalised by the authority with no published result.',
  },
};

export const PUJA_MAXIMA_LABEL: Record<Locale, string> = {
  es: 'Puja máxima',
  en: 'Highest bid',
};

/**
 * URL slug per registry outcome. Inlined (NOT imported from auction-outcome)
 * so this module — imported by the client archive island — never pulls
 * @prisma/client into the browser bundle. Kept in lockstep with the canonical
 * `OUTCOME_SLUG` (auction-outcome.ts) by a runtime guard in registro-read.ts
 * (server-only), so a drift fails loud on the server without shipping Prisma
 * to the client.
 */
export const OUTCOME_TO_SLUG: Record<RegistryOutcome, string> = {
  VENDIDA: 'adjudicadas',
  DESIERTA: 'desiertas',
  CANCELADA: 'canceladas',
  FINALIZADA_SIN_RESULTADO: 'finalizadas-sin-resultado',
};

/** Resolve a /resultados outcome URL slug → bucket (only the 4 registry ones). */
export function registryOutcomeFromSlug(slug: string): RegistryOutcome | null {
  const hit = (REGISTRY_OUTCOME_ORDER as readonly string[]).find(
    (o) => OUTCOME_TO_SLUG[o as RegistryOutcome] === slug,
  );
  return (hit as RegistryOutcome) ?? null;
}

// ---------------------------------------------------------------------------
// Data-viz colours — VALIDATED against the dataviz skill palette in BOTH modes
// (all six checks PASS: lightness band, chroma floor, adjacent-CVD ΔE ≥ 8,
// normal-vision ΔE ≥ 15, contrast ≥ 3:1). Each outcome carries a light + dark
// step. Charts also ship direct labels, so the CVD floor is honoured with
// secondary encoding.
// ---------------------------------------------------------------------------

export const OUTCOME_VIZ: Record<RegistryOutcome, { light: string; dark: string; cssVar: string }> = {
  VENDIDA: { light: '#008300', dark: '#008300', cssVar: '--o-vendida' },
  DESIERTA: { light: '#2a78d6', dark: '#3987e5', cssVar: '--o-desierta' },
  CANCELADA: { light: '#e34948', dark: '#e66767', cssVar: '--o-cancelada' },
  FINALIZADA_SIN_RESULTADO: { light: '#4a3aa7', dark: '#9085e9', cssVar: '--o-finalizada' },
};

/**
 * Scoped `<style>` text that maps the outcome CSS vars for a viz wrapper class,
 * theme-aware: light default, dark under both `prefers-color-scheme: dark` and
 * the site's `.dark` class variant. Rendered once per chart wrapper (SSR-safe;
 * no client JS). `scope` is the wrapper's class selector (e.g. '.reg-viz-abc').
 */
export function outcomeVizStyle(scope: string): string {
  const light = REGISTRY_OUTCOME_ORDER.map((o) => `${OUTCOME_VIZ[o].cssVar}:${OUTCOME_VIZ[o].light}`).join(';');
  const dark = REGISTRY_OUTCOME_ORDER.map((o) => `${OUTCOME_VIZ[o].cssVar}:${OUTCOME_VIZ[o].dark}`).join(';');
  return (
    `${scope}{${light}}` +
    `@media (prefers-color-scheme:dark){:root:not(.light) ${scope}{${dark}}}` +
    `.dark ${scope}{${dark}}`
  );
}

// ---------------------------------------------------------------------------
// Bilingual copy for the registry pages. Small, typed, one place.
// ---------------------------------------------------------------------------

export interface ResultadosCopy {
  brandSuffix: string;
  // landing
  landingH1: string;
  landingLead: (n: string) => string;
  overviewHeading: string;
  archiveHeading: string;
  byProvinceHeading: string;
  byOutcomeHeading: string;
  // stat tiles
  statTotal: string;
  statSold: string;
  statNoBids: string;
  statCancelled: string;
  statMedianBid: string;
  statMedianDiscount: string;
  discountVsAppraisal: string;
  // charts
  chartOutcomeTitle: string;
  chartVolumeTitle: string;
  chartVolumeSub: string;
  chartSoldRateTitle: string;
  chartSoldRateSub: string;
  chartWindowNote: string;
  // filters
  filterOutcome: string;
  filterCategory: string;
  filterProvince: string;
  filterAll: string;
  filterSort: string;
  sortRecent: string;
  sortPriceDesc: string;
  sortPriceAsc: string;
  // rows / list
  rowResultLabel: string;
  loadMore: string;
  loading: string;
  empty: string;
  errorLoading: string;
  resultsCount: (n: string) => string;
  page: string;
  // region pages
  regionH1: (region: string) => string;
  regionLead: (n: string, region: string) => string;
  outcomeRegionH1: (outcome: string, region: string) => string;
  outcomeNationalH1: (outcome: string) => string;
  townsHeading: (province: string) => string;
  otherProvincesHeading: string;
  backToRegistry: string;
  viewProvinceResults: (province: string) => string;
  seeResultsForCounty: (region: string) => string;
  crumbHome: string;
  crumbRegistry: string;
  updated: (date: string) => string;
  concludedNoun: string;
}

const ES: ResultadosCopy = {
  brandSuffix: 'SubastasActivas',
  landingH1: 'Resultados de subastas del BOE',
  landingLead: (n) =>
    `Registro de ${n} subastas ya concluidas, clasificadas por resultado: adjudicadas (con su puja máxima), desiertas, canceladas y finalizadas sin resultado. Datos del Boletín Oficial del Estado.`,
  overviewHeading: 'Panorama general',
  archiveHeading: 'Explorar el registro',
  byProvinceHeading: 'Resultados por provincia',
  byOutcomeHeading: 'Explorar por resultado',
  statTotal: 'Subastas concluidas',
  statSold: 'Adjudicadas',
  statNoBids: 'Desiertas',
  statCancelled: 'Canceladas',
  statMedianBid: 'Puja máxima mediana',
  statMedianDiscount: 'Descuento mediano',
  discountVsAppraisal: 'sobre la tasación',
  chartOutcomeTitle: 'Distribución por resultado',
  chartVolumeTitle: 'Volumen mensual',
  chartVolumeSub: 'Subastas concluidas por mes, según resultado',
  chartSoldRateTitle: 'Tasa de adjudicación',
  chartSoldRateSub: '% de subastas adjudicadas cada mes',
  chartWindowNote: 'Últimos 24 meses',
  filterOutcome: 'Resultado',
  filterCategory: 'Categoría',
  filterProvince: 'Provincia',
  filterAll: 'Todas',
  filterSort: 'Ordenar',
  sortRecent: 'Más recientes',
  sortPriceDesc: 'Puja: mayor a menor',
  sortPriceAsc: 'Puja: menor a mayor',
  rowResultLabel: 'Resultado',
  loadMore: 'Cargar más',
  loading: 'Cargando…',
  empty: 'No hay subastas concluidas que coincidan con estos filtros.',
  errorLoading: 'No se pudieron cargar los resultados. Inténtalo de nuevo.',
  resultsCount: (n) => `${n} resultados`,
  page: 'Página',
  regionH1: (region) => `Resultados de subastas en ${region}`,
  regionLead: (n, region) =>
    `${n} subastas concluidas en ${region}, clasificadas por resultado. Cada resultado enlaza con el detalle de la subasta.`,
  outcomeRegionH1: (outcome, region) => `Subastas ${outcome} en ${region}`,
  outcomeNationalH1: (outcome) => `Subastas ${outcome} en España`,
  townsHeading: (province) => `Por municipio en ${province}`,
  otherProvincesHeading: 'Otras provincias',
  backToRegistry: 'Ver todo el registro de resultados',
  viewProvinceResults: (province) => `Ver resultados en ${province}`,
  seeResultsForCounty: (region) => `Resultados en ${region}`,
  crumbHome: 'Inicio',
  crumbRegistry: 'Resultados',
  updated: (date) => `Actualizado el ${date}.`,
  concludedNoun: 'subastas concluidas',
};

const EN: ResultadosCopy = {
  brandSuffix: 'SubastasActivas',
  landingH1: 'BOE auction results',
  landingLead: (n) =>
    `A registry of ${n} concluded auctions, classified by outcome: awarded (with the highest bid), no-bids, cancelled and finalised without a result. Data from Spain's Official State Gazette (BOE).`,
  overviewHeading: 'Overview',
  archiveHeading: 'Browse the registry',
  byProvinceHeading: 'Results by province',
  byOutcomeHeading: 'Browse by outcome',
  statTotal: 'Concluded auctions',
  statSold: 'Awarded',
  statNoBids: 'No bids',
  statCancelled: 'Cancelled',
  statMedianBid: 'Median highest bid',
  statMedianDiscount: 'Median discount',
  discountVsAppraisal: 'vs appraisal',
  chartOutcomeTitle: 'Outcome breakdown',
  chartVolumeTitle: 'Monthly volume',
  chartVolumeSub: 'Concluded auctions per month, by outcome',
  chartSoldRateTitle: 'Award rate',
  chartSoldRateSub: '% of auctions awarded each month',
  chartWindowNote: 'Last 24 months',
  filterOutcome: 'Outcome',
  filterCategory: 'Category',
  filterProvince: 'Province',
  filterAll: 'All',
  filterSort: 'Sort',
  sortRecent: 'Most recent',
  sortPriceDesc: 'Bid: high to low',
  sortPriceAsc: 'Bid: low to high',
  rowResultLabel: 'Outcome',
  loadMore: 'Load more',
  loading: 'Loading…',
  empty: 'No concluded auctions match these filters.',
  errorLoading: 'Could not load results. Please try again.',
  resultsCount: (n) => `${n} results`,
  page: 'Page',
  regionH1: (region) => `Auction results in ${region}`,
  regionLead: (n, region) =>
    `${n} concluded auctions in ${region}, classified by outcome. Each result links to the auction detail page.`,
  outcomeRegionH1: (outcome, region) => `${outcome} auctions in ${region}`,
  outcomeNationalH1: (outcome) => `${outcome} auctions in Spain`,
  townsHeading: (province) => `By municipality in ${province}`,
  otherProvincesHeading: 'Other provinces',
  backToRegistry: 'View the full results registry',
  viewProvinceResults: (province) => `View results in ${province}`,
  seeResultsForCounty: (region) => `Results in ${region}`,
  crumbHome: 'Home',
  crumbRegistry: 'Results',
  updated: (date) => `Updated ${date}.`,
  concludedNoun: 'concluded auctions',
};

export function getResultadosCopy(locale: Locale): ResultadosCopy {
  return locale === 'en' ? EN : ES;
}

// ---------------------------------------------------------------------------
// Serializable copy slice for the CLIENT archive island.
//
// `RegistryArchiveClient` is the only 'use client' component on /resultados, so
// nothing with a function value may cross into it (React forbids passing
// functions to Client Components — it 500s at SSR render, which `tsc`/`next
// build` do NOT catch). `ResultadosCopy` carries ~10 function-valued members
// (landingLead, regionH1, outcomeRegionH1, updated, resultsCount, …), so we
// hand the client ONLY this plain-string subset. Server components
// (RegistroCharts / StatTiles / RegistryNav / ResultadoRow) keep the full copy.
// ---------------------------------------------------------------------------

export interface ArchiveCopy {
  filterOutcome: string;
  filterCategory: string;
  filterProvince: string;
  filterAll: string;
  filterSort: string;
  sortRecent: string;
  sortPriceDesc: string;
  sortPriceAsc: string;
  loadMore: string;
  loading: string;
  empty: string;
  errorLoading: string;
  /** The trailing noun of the "{n} resultados" count line (the number is
   *  formatted client-side because it changes as filters/pages load). */
  resultsLabel: string;
}

/** Plain-string slice of the copy dict for the client archive island — no
 *  functions, no non-serializable values cross the server→client boundary. */
export function pickArchiveCopy(copy: ResultadosCopy): ArchiveCopy {
  return {
    filterOutcome: copy.filterOutcome,
    filterCategory: copy.filterCategory,
    filterProvince: copy.filterProvince,
    filterAll: copy.filterAll,
    filterSort: copy.filterSort,
    sortRecent: copy.sortRecent,
    sortPriceDesc: copy.sortPriceDesc,
    sortPriceAsc: copy.sortPriceAsc,
    loadMore: copy.loadMore,
    loading: copy.loading,
    empty: copy.empty,
    errorLoading: copy.errorLoading,
    // Derive the count noun from the single source of truth (resultsCount is
    // `${n} resultados` / `${n} results`, so the empty-arg call yields the
    // trailing word). Keeps ES/EN parity with zero duplication.
    resultsLabel: copy.resultsCount('').trim(),
  };
}

// ---------------------------------------------------------------------------
// Filter option builders (shared by the landing + region archives).
// ---------------------------------------------------------------------------

export interface FilterOption {
  value: string;
  label: string;
}

export function buildOutcomeOptions(locale: Locale): FilterOption[] {
  return REGISTRY_OUTCOME_ORDER.map((o) => ({
    value: o,
    label: locale === 'en' ? OUTCOME_META[o].en : OUTCOME_META[o].es,
  }));
}

/** Category filter options — value is the exact DB label, label is the plural. */
export function buildCategoryOptions(): FilterOption[] {
  return (Object.keys(CATEGORY_SLUG_TO_DB_LABEL) as CategorySlug[]).map((slug) => ({
    value: CATEGORY_SLUG_TO_DB_LABEL[slug],
    label: CATEGORY_LABEL_PLURAL[slug].replace(/^\w/, (c) => c.toUpperCase()),
  }));
}
