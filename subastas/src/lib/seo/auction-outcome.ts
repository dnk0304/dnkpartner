/**
 * src/lib/seo/auction-outcome.ts — THE CANONICAL AUCTION-OUTCOME TAXONOMY.
 *
 * This is the single source of truth for "how did a finished auction end?".
 * Every registry surface (the /resultados archive, the outcome stats rollup,
 * the sold-price comps, and — via concluded-indexable.ts — the SEO index gate
 * and sitemap membership) derives its outcome semantics from THIS file. If the
 * definition of "sold" / "cancelled" / "deserted" ever needs to change, it
 * changes HERE and nowhere else.
 *
 * ── Two-axis reality ──────────────────────────────────────────────────────
 * A BOE auction row carries two independent facts:
 *   • `status`     — how it left the live pool (CONCLUIDA_PORTAL, CANCELADA,
 *                    SUSPENDIDA, FINALIZADA_AUTORIDAD, still-active, …).
 *   • `saleResult` — did it actually sell (ADJUDICADA / DESIERTA /
 *                    SIN_RESULTADO / NULL-until-checked).
 * The outcome is a projection of BOTH axes onto ONE of five public buckets.
 *
 * ── Precedence (locked) ───────────────────────────────────────────────────
 * A resolved SALE OUTCOME is the strongest signal and wins over status:
 *   1. saleResult = ADJUDICADA          → VENDIDA
 *   2. saleResult = DESIERTA            → DESIERTA
 * Only when the sale axis is unresolved (SIN_RESULTADO / NULL) does status
 * decide:
 *   3. status = CANCELADA/CANCELLED     → CANCELADA (withdrawn / stopped)
 *   4. status = SUSPENDIDA/SUSPENDED    → stale-suspended? CANCELADA : INDETERMINADO
 *   5. status = FINALIZADA_AUTORIDAD    → FINALIZADA_SIN_RESULTADO (authority-wiped)
 *   6. everything else (active pool, CONCLUIDA_PORTAL/FINISHED with no result,
 *      legacy rows)                     → INDETERMINADO (excluded from the
 *                                         registry + headline stats; residual)
 *
 * ── Label rule (locked in the sold-price spike) ───────────────────────────
 * VENDIDA carries `soldPrice` = the PUJA MÁXIMA (highest bid) in cents. The
 * public label is ALWAYS "puja máxima / highest bid", NEVER "precio de venta
 * confirmado" — BOE never publishes a legal adjudication amount. That labelling
 * is a rendering concern (AuctionTeaser); this module only classifies.
 */

import { SaleResult } from '@prisma/client';

// ---------------------------------------------------------------------------
// The five buckets
// ---------------------------------------------------------------------------

export type AuctionOutcome =
  | 'VENDIDA' // sold / adjudicada — a winning bid was captured
  | 'DESIERTA' // no bids — "sin puja"
  | 'CANCELADA' // cancelled / withdrawn / suspended-and-never-restarted
  | 'FINALIZADA_SIN_RESULTADO' // concluded by the authority, outcome not published
  | 'INDETERMINADO'; // thin / not-yet-checked / still-active — excluded from registry

export const AUCTION_OUTCOMES: readonly AuctionOutcome[] = [
  'VENDIDA',
  'DESIERTA',
  'CANCELADA',
  'FINALIZADA_SIN_RESULTADO',
  'INDETERMINADO',
] as const;

/**
 * Outcomes that constitute a REAL, publishable registry entry. INDETERMINADO
 * is excluded (thin / unresolved). Used by the registry list default and the
 * headline-stats scope; INDETERMINADO is reported only as a residual count.
 */
export const REGISTRY_OUTCOMES: readonly AuctionOutcome[] = [
  'VENDIDA',
  'DESIERTA',
  'CANCELADA',
  'FINALIZADA_SIN_RESULTADO',
] as const;

/**
 * Outcomes that make a concluded DETAIL page indexable for SEO. Strictly a
 * subset of REGISTRY_OUTCOMES — only a resolved sale outcome (sold or deserted)
 * carries enough content to index. CANCELADA / FINALIZADA_SIN_RESULTADO are
 * registry-visible but NOT indexed (thin, and CANCELADA has a data-freshness
 * caveat — see concluded-indexable.ts + the Ghost re-check flag).
 * concluded-indexable.ts derives its predicate from THIS set.
 */
export const SEO_INDEXABLE_OUTCOMES: readonly AuctionOutcome[] = [
  'VENDIDA',
  'DESIERTA',
] as const;

const SEO_INDEXABLE_OUTCOME_SET = new Set<string>(SEO_INDEXABLE_OUTCOMES);

/** True iff this outcome makes a concluded detail page indexable. */
export function isSeoIndexableOutcome(outcome: AuctionOutcome): boolean {
  return SEO_INDEXABLE_OUTCOME_SET.has(outcome);
}

/**
 * The `saleResult` enum values that resolve to an SEO-indexable outcome
 * (VENDIDA ⟸ ADJUDICADA, DESIERTA ⟸ DESIERTA). Exported so the Prisma WHERE
 * fragment in concluded-indexable.ts materializes the SAME predicate without
 * re-typing the literal — the two can never drift.
 */
export const SALE_RESULTS_FOR_INDEXABLE_OUTCOME: readonly SaleResult[] = [
  SaleResult.ADJUDICADA,
  SaleResult.DESIERTA,
] as const;

// ---------------------------------------------------------------------------
// Status groupings (string-based — accept raw enum value or its string form)
// ---------------------------------------------------------------------------

/** Cancelled/withdrawn terminal statuses (BOE-accurate + legacy). */
const CANCELLED_STATUSES = new Set<string>(['CANCELADA', 'CANCELLED']);
/** Suspended statuses (BOE-accurate + legacy) — candidates for stale→CANCELADA. */
const SUSPENDED_STATUSES = new Set<string>(['SUSPENDIDA', 'SUSPENDED']);
/** Authority-concluded, outcome-may-be-wiped status. */
const AUTHORITY_FINALIZED_STATUSES = new Set<string>(['FINALIZADA_AUTORIDAD']);

// ---------------------------------------------------------------------------
// Stale-suspended detection — the hard part
// ---------------------------------------------------------------------------

/**
 * Staleness threshold (days) for the "suspended & never restarted" → CANCELADA
 * mapping. A SUSPENDIDA row whose planned resumption is in the past (or absent)
 * AND that our scraper has not touched for this long is treated as an auction
 * that was due to resume and didn't.
 *
 * ⚠️ DATA-FRESHNESS CAVEAT: the daily scraper runs a rolling ~5-day
 * celebration-date window and does NOT revisit out-of-window SUSPENDIDA rows
 * (2026-06-04 suspended-resume scope note). So a row still marked SUSPENDIDA in
 * our DB may actually have resumed + concluded on BOE — our status is stale.
 * This makes stale→CANCELADA prone to FALSE POSITIVES. The threshold is
 * deliberately conservative (60d) and the public label must carry an "estado
 * según último dato" honesty caveat. A Ghost re-check pass should harden the
 * bucket before any cancelled page gets SEO weight (SEO_INDEXABLE_OUTCOMES
 * already excludes CANCELADA, so no cancelled page is indexed today).
 */
export const STALE_SUSPENDED_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimal row shape the taxonomy reads. Accepts Date | string | null for
 * timestamps so it works with Prisma rows, raw-SQL rows, and API DTOs. */
export interface OutcomeRow {
  status: string | null | undefined;
  saleResult: SaleResult | string | null | undefined;
  resumeAt?: Date | string | null | undefined;
  updatedAt?: Date | string | null | undefined;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * True when a SUSPENDIDA/SUSPENDED row should be read as "stopped, never
 * restarted" (→ CANCELADA). Requires ALL:
 *   • status is a suspended status,
 *   • planned resumption (`resumeAt`) is in the PAST or absent (a future
 *     resumeAt means it's still pending resumption → not an outcome),
 *   • the row has been untouched (`updatedAt`) for >= STALE_SUSPENDED_DAYS.
 * `now` is injectable for deterministic tests.
 */
export function isStaleSuspended(row: OutcomeRow, now: Date = new Date()): boolean {
  if (row.status == null || !SUSPENDED_STATUSES.has(row.status)) return false;

  const resumeAt = toDate(row.resumeAt);
  // A future resumption is still pending — NOT stale.
  if (resumeAt != null && resumeAt.getTime() > now.getTime()) return false;

  const updatedAt = toDate(row.updatedAt);
  // No freshness signal → cannot assert staleness → be conservative (not stale).
  if (updatedAt == null) return false;

  return now.getTime() - updatedAt.getTime() >= STALE_SUSPENDED_DAYS * DAY_MS;
}

// ---------------------------------------------------------------------------
// The classifier
// ---------------------------------------------------------------------------

/**
 * Classify a finished (or in-progress) auction row into its canonical outcome.
 * Pure. Precedence documented at the top of this file: a resolved sale outcome
 * (ADJUDICADA/DESIERTA) wins over status; otherwise status decides.
 *
 * `now` is injectable so the stale-suspended window is deterministic in tests
 * and so a batch rollup can pin a single "as of" instant across all rows.
 */
export function auctionOutcome(row: OutcomeRow, now: Date = new Date()): AuctionOutcome {
  const saleResult = row.saleResult ?? null;

  // 1–2. Resolved sale outcome wins over everything (a sale is a sale even if
  //       the status field is stale).
  if (saleResult === SaleResult.ADJUDICADA) return 'VENDIDA';
  if (saleResult === SaleResult.DESIERTA) return 'DESIERTA';

  // 3–6. Sale axis unresolved (SIN_RESULTADO / NULL) → status decides.
  const status = row.status ?? null;

  if (status != null && CANCELLED_STATUSES.has(status)) return 'CANCELADA';

  if (status != null && SUSPENDED_STATUSES.has(status)) {
    return isStaleSuspended(row, now) ? 'CANCELADA' : 'INDETERMINADO';
  }

  if (status != null && AUTHORITY_FINALIZED_STATUSES.has(status)) {
    return 'FINALIZADA_SIN_RESULTADO';
  }

  // CONCLUIDA_PORTAL / FINISHED with no resolved result, still-active states,
  // and legacy rows all fall through to the residual bucket.
  return 'INDETERMINADO';
}

/** True when the row belongs in the registry (any bucket except INDETERMINADO). */
export function isRegistryOutcome(outcome: AuctionOutcome): boolean {
  return outcome !== 'INDETERMINADO';
}

/** Spanish display label per bucket (UI convenience — single source). */
export const OUTCOME_LABEL_ES: Record<AuctionOutcome, string> = {
  VENDIDA: 'Adjudicada',
  DESIERTA: 'Desierta',
  CANCELADA: 'Cancelada',
  FINALIZADA_SIN_RESULTADO: 'Finalizada sin resultado',
  INDETERMINADO: 'Sin determinar',
};

/** URL slug per bucket (for /resultados/{outcome}/... programmatic pages). */
export const OUTCOME_SLUG: Record<AuctionOutcome, string> = {
  VENDIDA: 'adjudicadas',
  DESIERTA: 'desiertas',
  CANCELADA: 'canceladas',
  FINALIZADA_SIN_RESULTADO: 'finalizadas-sin-resultado',
  INDETERMINADO: 'sin-determinar',
};

const SLUG_TO_OUTCOME: Record<string, AuctionOutcome> = Object.fromEntries(
  (Object.entries(OUTCOME_SLUG) as [AuctionOutcome, string][]).map(([k, v]) => [v, k]),
) as Record<string, AuctionOutcome>;

/** Resolve a URL slug back to its outcome bucket, or null if unknown. */
export function outcomeFromSlug(slug: string | null | undefined): AuctionOutcome | null {
  if (!slug) return null;
  return SLUG_TO_OUTCOME[slug] ?? null;
}
