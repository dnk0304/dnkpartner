/**
 * src/lib/seo/concluded-indexable.ts — SINGLE SOURCE OF TRUTH for "which
 * CONCLUDED auction-detail pages we make indexable + list in the sitemap".
 *
 * Background (wave142 → this wave): concluded auction pages were `noindex,follow`
 * and excluded from every sitemap (07 §1.7) — correct while they were thin
 * (no outcome, just an expired listing). Wave142 added REAL sale-result data
 * (saleResult / soldPrice / soldDate / resultCheckedAt), which turns a concluded
 * property/vehicle page into a genuinely valuable sold-price comp (high
 * long-tail SEO intent). So we now index the SUBSET that carries real content.
 *
 * THE PREDICATE (Dennis-locked scope). A concluded row is indexable iff ALL:
 *   1. status ∈ concluded terminal set (CONCLUIDA_PORTAL / FINALIZADA_AUTORIDAD /
 *      legacy FINISHED). CANCELADA/CANCELLED are EXCLUDED — a cancelled auction
 *      never produced a sale outcome.
 *   2. category ∈ SEO_CONCLUDED_INDEXABLE_CATEGORIES (12 property+vehicle labels).
 *      Jewelry / machinery / art / furniture / electronics stay noindex.
 *   3. resultCheckedAt IS NOT NULL — the result-check pass actually ran.
 *   4. saleResult ∈ (ADJUDICADA, DESIERTA) — an actual, resolved outcome.
 *      SIN_RESULTADO (undetermined at attempt-cap) is thin → stays noindex.
 *
 * ⚠️ CRITICAL INVARIANT: the sitemap membership query (`concludedIndexableWhere`)
 * and the detail-page robots gate (`isConcludedIndexable`) MUST express the
 * IDENTICAL predicate. A URL that is in the sitemap but renders `noindex` is a
 * self-inflicted GSC error ("Submitted URL marked noindex"). Both are defined
 * here, side by side, so they can never drift. If you change one, change both.
 *
 * NOTE (content sufficiency): the predicate guarantees an outcome EXISTS in the
 * DB. It does NOT itself guarantee the public SSR teaser RENDERS the sold price
 * / outcome — that is a separate rendering concern (AuctionTeaser). If the
 * teaser does not surface soldPrice/saleResult/soldDate, an ADJUDICADA page is
 * still borderline-thin for Google. Keep the two in lockstep operationally.
 */

import { AuctionStatus, SaleResult, Prisma } from '@prisma/client';

/**
 * The 12 property + vehicle DB `Auction.category` labels that become indexable
 * once concluded-with-outcome. VERBATIM DB labels (see slugs.ts
 * CATEGORY_SLUG_TO_DB_LABEL) — a typo here silently drops a whole category.
 *   Properties (8): Viviendas, Otros inmuebles, Garajes, Naves industriales,
 *                   Fincas rústicas, Terrenos, Locales, Trasteros
 *   Vehicles  (4): Turismos, Motocicletas, Vehículos Industriales, Barcos
 * EXCLUDED: Maquinaria, Joyas, Arte (+ any off-taxonomy label).
 */
export const SEO_CONCLUDED_INDEXABLE_CATEGORIES: readonly string[] = [
  'Viviendas',
  'Otros inmuebles',
  'Garajes',
  'Naves industriales',
  'Fincas rústicas',
  'Terrenos',
  'Locales',
  'Trasteros',
  'Turismos',
  'Motocicletas',
  'Vehículos Industriales',
  'Barcos',
] as const;

/**
 * Concluded terminal statuses that can carry a real sale outcome. CANCELADA /
 * CANCELLED are deliberately absent (cancelled ≠ sold/deserted). Legacy
 * FINISHED kept — older rows still carry it.
 */
export const SEO_CONCLUDED_STATUSES: readonly AuctionStatus[] = [
  AuctionStatus.CONCLUIDA_PORTAL,
  AuctionStatus.FINALIZADA_AUTORIDAD,
  AuctionStatus.FINISHED,
] as const;

/** Resolved sale outcomes that mean "this page has real content". */
export const SEO_INDEXABLE_SALE_RESULTS: readonly SaleResult[] = [
  SaleResult.ADJUDICADA,
  SaleResult.DESIERTA,
] as const;

const CATEGORY_SET = new Set<string>(SEO_CONCLUDED_INDEXABLE_CATEGORIES);
const STATUS_SET = new Set<string>(SEO_CONCLUDED_STATUSES);
const RESULT_SET = new Set<string>(SEO_INDEXABLE_SALE_RESULTS);

/** Minimal row shape the in-memory predicate needs (detail-page gate). */
export interface ConcludedIndexableRow {
  status: string | null | undefined;
  category: string | null | undefined;
  saleResult: SaleResult | string | null | undefined;
  resultCheckedAt: Date | null | undefined;
}

/**
 * In-memory predicate — used by the detail-page robots gate. Compares against
 * string Sets so it accepts either the raw enum value or its string form.
 */
export function isConcludedIndexable(row: ConcludedIndexableRow): boolean {
  return (
    row.status != null &&
    STATUS_SET.has(row.status) &&
    row.category != null &&
    CATEGORY_SET.has(row.category) &&
    row.resultCheckedAt != null &&
    row.saleResult != null &&
    RESULT_SET.has(row.saleResult as string)
  );
}

/**
 * Prisma WHERE fragment — the SAME predicate, materialized for the sitemap
 * membership query. resultCheckedAt is nullable (DateTime?) so `{ not: null }`
 * is valid here (do NOT apply `{ not: null }` to a non-nullable scalar — it
 * throws PrismaClientValidationError at runtime).
 */
export function concludedIndexableWhere(): Prisma.AuctionWhereInput {
  return {
    status: { in: [...SEO_CONCLUDED_STATUSES] },
    category: { in: [...SEO_CONCLUDED_INDEXABLE_CATEGORIES] },
    resultCheckedAt: { not: null },
    saleResult: { in: [...SEO_INDEXABLE_SALE_RESULTS] },
  };
}
