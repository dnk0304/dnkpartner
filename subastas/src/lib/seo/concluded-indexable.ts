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
import {
  auctionOutcome,
  isSeoIndexableOutcome,
  SALE_RESULTS_FOR_INDEXABLE_OUTCOME,
} from '@/lib/seo/auction-outcome';

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

/**
 * Resolved sale outcomes that mean "this page has real content". DERIVED from
 * the canonical taxonomy (auction-outcome.ts) — VENDIDA ⟸ ADJUDICADA,
 * DESIERTA ⟸ DESIERTA — so the SEO index set can never fork from the outcome
 * definition. Re-exported (not re-typed) for callers that reference it.
 */
export const SEO_INDEXABLE_SALE_RESULTS = SALE_RESULTS_FOR_INDEXABLE_OUTCOME;

const CATEGORY_SET = new Set<string>(SEO_CONCLUDED_INDEXABLE_CATEGORIES);
const STATUS_SET = new Set<string>(SEO_CONCLUDED_STATUSES);

/**
 * RECENCY FLOOR (wave-seoslug, Ken/Dennis 2026-08-03). A concluded auction that
 * ended long ago is a stale sold-comp with near-zero crawl value; emitting ~200k
 * of them (soldDate 2016–2021) into the sitemap with their REAL ancient lastmod
 * is exactly what made Googlebot read the auction corpus as decade-old junk and
 * skip it (the live symptom on sitemap/10.xml: uniform 2016-10-05 lastmod).
 *
 * We gate on `endsAt` (the auction's actual end date — 100% populated, unlike
 * soldDate which is null on DESIERTA rows) rather than soldDate, so the floor is
 * robust across both outcomes. A concluded page older than the window drops out
 * of BOTH the sitemap AND the detail-page index gate (the CRITICAL INVARIANT
 * holds — one predicate, both places). 24 months keeps genuinely-useful recent
 * comps; tune via this single constant.
 */
const SEO_CONCLUDED_MAX_AGE_MONTHS_DEFAULT = 24;

/**
 * ⭐ THE FLOOR IS NOW OPERATOR-CONTROLLED (Forge, 2026-08-12).
 *
 * Dennis ruled "index the WHOLE site, ancient auctions included" on 2026-08-03;
 * the hardcoded 24 has been doing the opposite ever since. Ken's ruling is that
 * closing that gap is a PHASED ROLLOUT he owns, not a code change shipped blind:
 * once a URL is in a sitemap, pulling it back out is a de-index signal, so the
 * widening goes 24mo → 60mo → off, measuring GSC between steps.
 *
 * This constant is therefore now read from the environment, so the ramp is a
 * config change on a running container rather than a rebuild per step:
 *
 *   SEO_CONCLUDED_MAX_AGE_MONTHS unset  → 24 (TODAY'S BEHAVIOUR — no-op default)
 *   SEO_CONCLUDED_MAX_AGE_MONTHS=60     → step 2 of the ramp
 *   SEO_CONCLUDED_MAX_AGE_MONTHS=0      → floor DISABLED, whole corpus eligible
 *
 * ⚠️ THE FLOOR AND THE CHILD COUNT MUST MOVE TOGETHER. Widening the floor
 * without also raising `PUBLISHED_CONCLUDED_CHILDREN` (sitemap-config.ts) does
 * almost nothing: the extra rows qualify, but only the freshest
 * `CHILD_SITEMAP_SIZE * PUBLISHED_CONCLUDED_CHILDREN` of them are actually
 * published. Measured 2026-08-03: floor off = 171,483 rows = 9 children.
 * Raising the floor alone is safe-but-inert; raising children alone publishes
 * EMPTY children, which is actively harmful (see sitemap-config.ts). Set both.
 *
 * Invalid / negative / non-numeric values fall back to the default rather than
 * throwing — a malformed env var must not take the sitemap down, and the
 * conservative default is the safe direction to fail in.
 */
export const SEO_CONCLUDED_MAX_AGE_MONTHS = ((): number => {
  const raw = process.env.SEO_CONCLUDED_MAX_AGE_MONTHS;
  if (raw == null || raw.trim() === '') return SEO_CONCLUDED_MAX_AGE_MONTHS_DEFAULT;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return SEO_CONCLUDED_MAX_AGE_MONTHS_DEFAULT;
  return n;
})();

/** True when the recency floor is switched off entirely (whole corpus eligible). */
export const SEO_CONCLUDED_FLOOR_DISABLED = SEO_CONCLUDED_MAX_AGE_MONTHS === 0;

/**
 * The `endsAt >=` cutoff Date for the recency floor. Computed per call.
 *
 * Returns the UNIX epoch when the floor is disabled, so callers keep a single
 * always-Date contract and `endsAt >= cutoff` degrades to "any real endsAt"
 * rather than needing every call site to branch. Rows with a NULL `endsAt` stay
 * excluded either way — that is deliberate and unchanged.
 */
export function concludedRecencyCutoff(now: Date = new Date()): Date {
  if (SEO_CONCLUDED_FLOOR_DISABLED) return new Date(0);
  const d = new Date(now);
  d.setMonth(d.getMonth() - SEO_CONCLUDED_MAX_AGE_MONTHS);
  return d;
}

/** Minimal row shape the in-memory predicate needs (detail-page gate). */
export interface ConcludedIndexableRow {
  status: string | null | undefined;
  category: string | null | undefined;
  saleResult: SaleResult | string | null | undefined;
  resultCheckedAt: Date | null | undefined;
  /** Auction end date — required for the recency floor. */
  endsAt: Date | null | undefined;
}

/**
 * In-memory predicate — used by the detail-page robots gate. A concluded row is
 * indexable iff it is in a concluded terminal status, in the SEO category set,
 * has actually been result-checked, AND its canonical OUTCOME is SEO-indexable
 * (VENDIDA or DESIERTA — see auction-outcome.ts). The outcome membership is the
 * single source of truth for "sold or deserted"; the status/category/checked
 * gates are the orthogonal "is it a concluded page we index" scope. Compares
 * against string Sets so it accepts either the raw enum value or its string
 * form.
 */
export function isConcludedIndexable(row: ConcludedIndexableRow, now: Date = new Date()): boolean {
  return (
    hasConcludedOutcome(row) &&
    // Recency floor — mirrors the `endsAt >= cutoff` in concludedIndexableWhere().
    // Only the CRAWL gate (robots meta + sitemap membership) applies it; content
    // presence (the teaser) uses hasConcludedOutcome and shows old comps freely.
    row.endsAt != null &&
    row.endsAt >= concludedRecencyCutoff(now)
  );
}

/**
 * Content-presence predicate: does this concluded row carry a real, displayable
 * sale outcome? Identical to isConcludedIndexable MINUS the recency floor. Used
 * by the teaser (a user who lands on an old — noindexed — sold page should still
 * see the sold-price block; recency is a crawl-budget concern, not a content
 * one). Do NOT use this for robots/sitemap — those must carry the recency floor.
 */
export function hasConcludedOutcome(
  row: Pick<ConcludedIndexableRow, 'status' | 'category' | 'saleResult' | 'resultCheckedAt'>,
): boolean {
  return (
    row.status != null &&
    STATUS_SET.has(row.status) &&
    row.category != null &&
    CATEGORY_SET.has(row.category) &&
    row.resultCheckedAt != null &&
    isSeoIndexableOutcome(auctionOutcome({ status: row.status, saleResult: row.saleResult }))
  );
}

/**
 * Prisma WHERE fragment — the SAME predicate, materialized for the sitemap
 * membership query. resultCheckedAt is nullable (DateTime?) so `{ not: null }`
 * is valid here (do NOT apply `{ not: null }` to a non-nullable scalar — it
 * throws PrismaClientValidationError at runtime).
 */
export function concludedIndexableWhere(now: Date = new Date()): Prisma.AuctionWhereInput {
  return {
    status: { in: [...SEO_CONCLUDED_STATUSES] },
    category: { in: [...SEO_CONCLUDED_INDEXABLE_CATEGORIES] },
    resultCheckedAt: { not: null },
    saleResult: { in: [...SEO_INDEXABLE_SALE_RESULTS] },
    // Recency floor — drop stale sold-comps (see SEO_CONCLUDED_MAX_AGE_MONTHS).
    endsAt: { gte: concludedRecencyCutoff(now) },
  };
}
