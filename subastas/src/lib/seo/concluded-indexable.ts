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

/**
 * ⭐ CONTENT BAR (Dennis 2026-09-17, codifying Marketing's policy doc).
 *
 * RULING: "we should also index finished auctions, those are pages we have
 * filled with all the info about the auctions and redirect links to the official
 * one. Keep noindex only for genuinely empty/placeholder records."
 *
 * This REPLACES the wave142 outcome gate (`resultCheckedAt` + saleResult ∈
 * {ADJUDICADA, DESIERTA}) as the indexability rule. That gate asked "did the
 * result-check pass resolve a sale outcome?" — a question about our own pipeline,
 * not about whether the page has anything on it. A concluded auction with a full
 * property description, an address, a valuation and the BOE link is a useful page
 * whether or not we ever determined who bought it; a SIN_RESULTADO row was being
 * noindexed for a reason the visitor cannot see.
 *
 * "Genuinely empty/placeholder" is now DEFINED, not implied — Marketing's bar:
 *
 *   1. A real description: >= SEO_CONCLUDED_MIN_DESCRIPTION_WORDS words across
 *      the prose we store (lotDescription + propertyDescription combined).
 *      This is the load-bearing filter — a shell row has no prose.
 *   2. A location: a non-empty `municipality`. Province alone is too coarse to
 *      make a distinct page; a municipality-less row renders a placeholder H1.
 *   3. At least SEO_CONCLUDED_MIN_DATA_SIGNALS of the corroborating signals
 *      below.
 *
 * ⚠️ WHY `boeId` IS NOT ONE OF THE SIGNALS. `Auction.boeId` is `String @unique`
 * — NON-NULLABLE. Every row has one. Including it as the "court/BOE reference"
 * signal would make that signal unconditionally true and quietly turn a
 * "2 of 4" bar into a "1 of 3" bar. The BOE reference signal therefore reads
 * ONLY the nullable court columns. (The official-source LINK Dennis refers to is
 * built from boeId and is present on every page regardless — it is not evidence
 * of content, so it must not score as such.)
 *
 * ⚠️ HONEST NOTE ON `endsAt`. On concluded rows endsAt is near-universally
 * populated (concluded-indexable's own recency floor relies on exactly that).
 * So in practice this bar resolves to: 40-word description + municipality +
 * endsAt + ONE of {price, cadastralRef, court reference}. That is stated here
 * rather than left for someone to discover, and it is still a real bar: the
 * word count is what actually excludes placeholder rows.
 */
export const SEO_CONCLUDED_MIN_DESCRIPTION_WORDS = 40;

/** How many corroborating data signals a concluded page needs. */
export const SEO_CONCLUDED_MIN_DATA_SIGNALS = 2;

/** Minimal row shape the in-memory predicate needs (detail-page gate). */
export interface ConcludedIndexableRow {
  status: string | null | undefined;
  category: string | null | undefined;
  /** Location component of the content bar. */
  municipality?: string | null | undefined;
  /** Prose components — combined for the word count. */
  lotDescription?: string | null | undefined;
  propertyDescription?: string | null | undefined;
  /** Corroborating signals. */
  appraisalValue?: number | null | undefined;
  valorSubasta?: number | null | undefined;
  cadastralRef?: string | null | undefined;
  courtName?: string | null | undefined;
  courtReference?: string | null | undefined;
  /** Retained for `hasConcludedOutcome` (the teaser's sold-price block). */
  saleResult?: SaleResult | string | null | undefined;
  resultCheckedAt?: Date | null | undefined;
  /** Auction end date — recency floor input AND one of the data signals. */
  endsAt: Date | null | undefined;
}

/** A string that carries actual content (not null, not blank). */
function filled(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.trim() !== '';
}

/**
 * Word count across the stored prose. Whitespace-split on the trimmed join —
 * deliberately crude, because the input is scraped BOE prose and any smarter
 * tokenizer would just be a second thing to keep in sync.
 */
export function concludedDescriptionWords(row: ConcludedIndexableRow): number {
  const prose = [row.lotDescription, row.propertyDescription]
    .filter(filled)
    .join(' ')
    .trim();
  return prose === '' ? 0 : prose.split(/\s+/).length;
}

/**
 * How many corroborating data signals this row carries. See the content-bar
 * doc above for why `boeId` is deliberately absent from this list.
 */
export function concludedDataSignals(row: ConcludedIndexableRow): number {
  let n = 0;
  // Price — any real valuation. `> 0` because a scraped 0 is a missing value
  // wearing a number, and `!= null` alone would score it.
  if ((row.appraisalValue ?? 0) > 0 || (row.valorSubasta ?? 0) > 0) n += 1;
  if (filled(row.cadastralRef)) n += 1;
  // Court reference — NULLABLE columns only (never boeId; see above).
  if (filled(row.courtReference) || filled(row.courtName)) n += 1;
  if (row.endsAt != null) n += 1;
  return n;
}

/**
 * ⭐ THE CONTENT BAR. True when a concluded row is a real page rather than a
 * placeholder shell. Status/category scope + description + location + signals.
 * Carries NO recency floor — that is a crawl-budget concern layered on top by
 * `isConcludedIndexable`.
 */
export function hasConcludedContent(row: ConcludedIndexableRow): boolean {
  return (
    row.status != null &&
    STATUS_SET.has(row.status) &&
    row.category != null &&
    CATEGORY_SET.has(row.category) &&
    filled(row.municipality) &&
    concludedDescriptionWords(row) >= SEO_CONCLUDED_MIN_DESCRIPTION_WORDS &&
    concludedDataSignals(row) >= SEO_CONCLUDED_MIN_DATA_SIGNALS
  );
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
    // ⭐ CONTENT BAR, not the old sale-outcome gate (Dennis 2026-09-17).
    hasConcludedContent(row) &&
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
 * Prisma WHERE fragment — the CANDIDATE query for sitemap membership.
 *
 * ⚠️ THE INVARIANT, RESTATED PRECISELY (changed 2026-09-17 — read this).
 *
 * The old doctrine was "this WHERE and the in-memory gate express the IDENTICAL
 * predicate". That is no longer achievable and pretending otherwise would be the
 * bug: the content bar counts WORDS across two prose columns, and Prisma cannot
 * express a string length — there is no `length()` filter. The invariant that
 * actually matters is not equality, it is DIRECTION:
 *
 *     sitemap membership  ⊆  the page index gate
 *
 * A sitemap URL that renders `noindex` is a self-inflicted GSC error
 * ("Submitted URL marked noindex"). A page that is indexable but absent from the
 * sitemap is merely undiscovered — worse for traffic, harmless for trust. Subset
 * is the safe direction, so this WHERE is the CANDIDATE set and callers MUST
 * apply `isConcludedIndexable` in memory to the rows they fetch. Both sitemap
 * call sites do (sitemap-entries.ts, sitemap.xml/route.ts); do not add a third
 * that skips it.
 *
 * Everything expressible in SQL is enforced here so the in-memory pass has as
 * little to reject as possible and the children stay close to full:
 *   - status / category scope
 *   - a non-empty municipality (the location half of the bar)
 *   - the recency floor
 *
 * The outcome gate (`resultCheckedAt` + saleResult) is GONE — it was the wave142
 * rule Dennis's 2026-09-17 ruling replaced. `SEO_INDEXABLE_SALE_RESULTS` stays
 * exported because `hasConcludedOutcome` (the teaser's sold-price block) still
 * uses that taxonomy; it simply no longer decides indexability.
 */
export function concludedIndexableWhere(now: Date = new Date()): Prisma.AuctionWhereInput {
  return {
    status: { in: [...SEO_CONCLUDED_STATUSES] },
    category: { in: [...SEO_CONCLUDED_INDEXABLE_CATEGORIES] },
    // Location half of the content bar. Both clauses are spelled out rather than
    // relying on SQL's three-valued logic to make `<> ''` also drop NULLs.
    AND: [{ municipality: { not: null } }, { NOT: { municipality: '' } }],
    // Recency floor — drop stale sold-comps (see SEO_CONCLUDED_MAX_AGE_MONTHS).
    endsAt: { gte: concludedRecencyCutoff(now) },
  };
}

/**
 * The columns `isConcludedIndexable` reads. Every sitemap call site selects
 * EXACTLY this so the in-memory filter can never be starved of a field and
 * silently reject rows that actually qualify (a dropped field in a select is a
 * one-way failure — it looks like "fewer rows qualified", not like a bug).
 */
export const CONCLUDED_INDEXABLE_SELECT = {
  status: true,
  category: true,
  municipality: true,
  lotDescription: true,
  propertyDescription: true,
  appraisalValue: true,
  valorSubasta: true,
  cadastralRef: true,
  courtName: true,
  courtReference: true,
  endsAt: true,
} as const;
