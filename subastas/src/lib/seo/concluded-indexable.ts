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
 * THE PREDICATE lives in the CONTENT BAR v2 block further down — that block is
 * the specification, this header is only the background. In one line: a
 * concluded row is indexable iff it has a terminal status, a resolved outcome
 * (ADJUDICADA / DESIERTA), a province, a municipality, and at least 2 of the 3
 * structured signals {date, price, text}. There is no category gate (Dennis:
 * index the FULL registry) and no prose word count (that was v1).
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
 * ⚠️ MARKETING NOTE ONLY — THIS LIST NO LONGER GATES ANYTHING (2026-09-17).
 * Dennis ruled the FULL registry is indexed, and `category` is a NON-NULLABLE
 * column measured 100 % filled, so gating or scoring on it was vacuous. Kept
 * because Marketing's policy doc refers to these 12 labels as the high-intent
 * subset, and because catalogue surfaces elsewhere still reason about them.
 *
 * The 12 property + vehicle DB `Auction.category` labels. VERBATIM DB labels (see slugs.ts
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

const STATUS_SET = new Set<string>(SEO_CONCLUDED_STATUSES);
const SALE_RESULT_SET = new Set<string>(SEO_INDEXABLE_SALE_RESULTS.map(String));

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
 * ⭐ CONTENT BAR v2 — STRUCTURED SIGNALS, NOT PROSE LENGTH
 * (Dennis 2026-09-17 "we should index the full registry"; Ken's ruling, same day.)
 *
 * v1 (earlier the same day) gated on `lotDescription + propertyDescription >= 40
 * words`. Measured on prod that single arm noindexed **108,015 of 175,145**
 * concluded-with-outcome rows (62 %) — while every one of those rows already
 * renders a full canonical page (address-derived title, location, outcome,
 * dates, price). A word count over scraped BOE prose is a proxy for "is this a
 * real page", and it was a bad one: BOE writes one-line lot descriptions for
 * perfectly complete auctions.
 *
 * v2 asks the question directly — does the row carry the STRUCTURED FACTS the
 * page is built out of?
 *
 *   REQUIRED (all four):
 *     1. status ∈ SEO_CONCLUDED_STATUSES (CANCELADA excluded — never sold).
 *     2. saleResult ∈ {ADJUDICADA, DESIERTA} — a resolved outcome. This is the
 *        "not a stub" arm: no outcome ⇒ placeholder shell ⇒ noindex.
 *     3. province present.
 *     4. municipality present. Second half of the stub arm — a municipality-less
 *        row renders a placeholder H1.
 *   PLUS at least SEO_CONCLUDED_MIN_DATA_SIGNALS (2) of THREE signals:
 *     S1 date  — endsAt OR soldDate
 *     S2 price — soldPrice OR valorSubasta (the auction's starting value)
 *     S3 text  — lotDescription with >= 1 word, OR an address
 *
 * ⚠️ WHY `category` IS NOT A SIGNAL AND NOT A GATE (Ken, 2026-09-17).
 * `Auction.category` is `String` — NON-NULLABLE, and measured 100.00 % filled on
 * the population (175,148/175,148). Scoring it would have turned "≥ 2 of 4" into
 * "≥ 1 of 3" with nothing visibly failing. Keeping it as a *required* arm would
 * be the same vacuous test wearing a different hat. Dennis ruled the FULL
 * registry gets indexed, so the 12-label allow-list above is now a MARKETING
 * NOTE only (see SEO_CONCLUDED_INDEXABLE_CATEGORIES) — it decides nothing here.
 * Same family as the `boeId` trap v1 already documented.
 *
 * ⚠️ HONEST NOTE ON SIGNAL FILL RATES (measured on prod 2026-09-17, n=175,148).
 * S1 date 100.00 % · S3 text 99.65 % · S2 price 98.23 %. By the rule stated in
 * `scripts/seo/concluded-indexable-census.mjs` (any signal >= 99 % filled is
 * vacuous), S1 and S3 carry almost no information TODAY, so "2 of 3" resolves in
 * practice to "has a price, or has both of the other two". This is written down
 * rather than left to be discovered, and it is NOT a reason to invent a harder
 * bar: Dennis's ruling is that the registry IS the content. The signals stay
 * because they are the arms that would actually fire if the scraper ever started
 * writing shells again. Re-run the census before trusting these numbers.
 *
 * ⭐ HOW THE INVARIANT IS ENFORCED NOW. v1's doctrine was "the WHERE is only a
 * candidate set, because SQL cannot count words". v2's predicate is fully
 * SQL-expressible, so the file goes back to the stronger contract: every arm is
 * declared ONCE below as a `{ test, where }` pair, and BOTH `isConcludedIndexable`
 * and `concludedIndexableWhere` are assembled from that one list by the same
 * combinator. They cannot drift, because there is nothing to keep in sync.
 * (`concluded-content-bar.test.ts` feeds shared fixtures through both and asserts
 * equality.)
 */

/** How many corroborating data signals a concluded page needs. */
export const SEO_CONCLUDED_MIN_DATA_SIGNALS = 2;

/** Minimal row shape the in-memory predicate needs (detail-page gate). */
export interface ConcludedIndexableRow {
  status: string | null | undefined;
  saleResult?: SaleResult | string | null | undefined;
  province?: string | null | undefined;
  municipality?: string | null | undefined;
  /** S1 — date. */
  endsAt: Date | null | undefined;
  soldDate?: Date | null | undefined;
  /** S2 — price. soldPrice is BigInt CENTS; valorSubasta a Float in euros. */
  soldPrice?: bigint | number | null | undefined;
  valorSubasta?: number | null | undefined;
  /** S3 — text. */
  lotDescription?: string | null | undefined;
  address?: string | null | undefined;
  /** Retained for `hasConcludedOutcome` (the teaser's sold-price block). */
  category?: string | null | undefined;
  resultCheckedAt?: Date | null | undefined;
}

/** A string that carries actual content (not null, not blank). */
function filled(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.trim() !== '';
}

/** A real amount. `> 0` — a scraped 0 is a missing value wearing a number. */
function positive(v: bigint | number | null | undefined): boolean {
  if (v == null) return false;
  return typeof v === 'bigint' ? v > BigInt(0) : Number.isFinite(v) && v > 0;
}

/**
 * One arm of the predicate, declared ONCE: the in-memory test and the Prisma
 * fragment that must mean the same thing, side by side on the same line.
 */
interface PredicateArm {
  readonly key: string;
  readonly test: (row: ConcludedIndexableRow) => boolean;
  readonly where: Prisma.AuctionWhereInput;
}

/**
 * Non-empty-string fragment. Both clauses are spelled out rather than relying
 * on SQL's three-valued logic to make `<> ''` also drop NULLs.
 *
 * ⚠️ THE ONE DELIBERATE ASYMMETRY. The in-memory `filled()` TRIMS; Prisma has no
 * `trim()` / `length()` filter, so a whitespace-only value passes the SQL
 * fragment and fails the in-memory test. That is the SAFE direction — the WHERE
 * stays a superset, so `sitemap ⊆ indexable` still holds — and both sitemap call
 * sites re-apply `isConcludedIndexable` in memory. Measured on prod: 0 rows in
 * the population have a whitespace-only province / municipality / lotDescription
 * / address, so the asymmetry is currently empty as well as safe. The census
 * re-counts it every run.
 */
function nonEmpty(
  field: 'province' | 'municipality' | 'lotDescription' | 'address',
): Prisma.AuctionWhereInput {
  // ⚠️ `{ not: null }` is only VALID on a nullable column. `Auction.province` is
  // `String` NOT NULL, and Prisma rejects the filter with "Argument `not` is
  // missing" — an error that surfaced as an EMPTY concluded sitemap child,
  // because buildSitemapEntries swallows query failures into "no entries". tsc,
  // the unit suite and `next build` were all green; only curling /sitemap/N.xml
  // against a real Postgres showed it. Emit the null clause only where the
  // column can actually be null.
  const clauses: Prisma.AuctionWhereInput[] = [{ NOT: { [field]: '' } } as Prisma.AuctionWhereInput];
  if (field !== 'province') clauses.unshift({ [field]: { not: null } } as Prisma.AuctionWhereInput);
  return { AND: clauses };
}

/** REQUIRED arms — all must hold. */
const CONCLUDED_REQUIRED_ARMS: readonly PredicateArm[] = [
  {
    key: 'status',
    test: (r) => r.status != null && STATUS_SET.has(r.status),
    where: { status: { in: [...SEO_CONCLUDED_STATUSES] } },
  },
  {
    key: 'outcome',
    test: (r) => r.saleResult != null && SALE_RESULT_SET.has(String(r.saleResult)),
    where: { saleResult: { in: [...SEO_INDEXABLE_SALE_RESULTS] } },
  },
  { key: 'province', test: (r) => filled(r.province), where: nonEmpty('province') },
  { key: 'municipality', test: (r) => filled(r.municipality), where: nonEmpty('municipality') },
] as const;

/** SIGNAL arms — at least SEO_CONCLUDED_MIN_DATA_SIGNALS must hold. */
const CONCLUDED_SIGNAL_ARMS: readonly PredicateArm[] = [
  {
    key: 'date',
    test: (r) => r.endsAt != null || r.soldDate != null,
    where: { OR: [{ endsAt: { not: null } }, { soldDate: { not: null } }] },
  },
  {
    key: 'price',
    test: (r) => positive(r.soldPrice) || positive(r.valorSubasta),
    where: { OR: [{ soldPrice: { gt: 0 } }, { valorSubasta: { gt: 0 } }] },
  },
  {
    key: 'text',
    test: (r) => filled(r.lotDescription) || filled(r.address),
    where: { OR: [nonEmpty('lotDescription'), nonEmpty('address')] },
  },
] as const;

/** Every arm key, in declaration order — for the census and the tests. */
export const CONCLUDED_REQUIRED_KEYS: readonly string[] = CONCLUDED_REQUIRED_ARMS.map((a) => a.key);
export const CONCLUDED_SIGNAL_KEYS: readonly string[] = CONCLUDED_SIGNAL_ARMS.map((a) => a.key);

/** How many of the three structured signals this row carries. */
export function concludedDataSignals(row: ConcludedIndexableRow): number {
  return CONCLUDED_SIGNAL_ARMS.reduce((n, a) => n + (a.test(row) ? 1 : 0), 0);
}

/** Which arms a row FAILS — drives the census's "by failing arm" table. */
export function concludedFailingArms(row: ConcludedIndexableRow): string[] {
  const failed = CONCLUDED_REQUIRED_ARMS.filter((a) => !a.test(row)).map((a) => a.key);
  if (concludedDataSignals(row) < SEO_CONCLUDED_MIN_DATA_SIGNALS) failed.push('signals');
  return failed;
}

/** All k-sized subsets of `xs`, in index order. */
function combinations<T>(xs: readonly T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (k > xs.length) return [];
  const [head, ...rest] = xs;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

/**
 * "At least k of these arms" as one Prisma fragment: the OR of every k-sized
 * AND-combination. For 2-of-3 that is 3 branches — small and index-friendly.
 * Generated from the SAME arm list the in-memory count walks, so the threshold
 * can move without anyone hand-editing a boolean expression.
 */
function atLeastWhere(arms: readonly PredicateArm[], k: number): Prisma.AuctionWhereInput {
  if (k <= 0) return {};
  return { OR: combinations(arms, k).map((c) => ({ AND: c.map((a) => a.where) })) };
}

/**
 * ⭐ THE CONTENT BAR (v2). True when a concluded row is a real registry entry
 * rather than a placeholder shell. Carries NO recency floor — that is a
 * crawl-budget concern layered on top by `isConcludedIndexable`.
 */
export function hasConcludedContent(row: ConcludedIndexableRow): boolean {
  return (
    CONCLUDED_REQUIRED_ARMS.every((a) => a.test(row)) &&
    concludedDataSignals(row) >= SEO_CONCLUDED_MIN_DATA_SIGNALS
  );
}

/**
 * The recency floor, as a predicate. Split out so the floor-disabled case adds
 * NO constraint at all: the old code kept `endsAt >= epoch`, which still
 * required a non-null `endsAt` and so quietly excluded the 423 rows that carry
 * only a `soldDate` — "floor disabled ⇒ whole corpus eligible" (the doc above)
 * was not actually true. It is now.
 */
function passesRecencyFloor(row: ConcludedIndexableRow, now: Date): boolean {
  if (SEO_CONCLUDED_FLOOR_DISABLED) return true;
  return row.endsAt != null && row.endsAt >= concludedRecencyCutoff(now);
}

function recencyFloorWhere(now: Date): Prisma.AuctionWhereInput {
  if (SEO_CONCLUDED_FLOOR_DISABLED) return {};
  return { endsAt: { gte: concludedRecencyCutoff(now) } };
}

/**
 * In-memory predicate — the detail-page robots gate, and the in-memory half of
 * sitemap membership. Content bar + the operator-controlled recency floor.
 *
 * ⚠️ PROD RUNS WITH `SEO_CONCLUDED_MAX_AGE_MONTHS=0` (verified in the container
 * by Ken 2026-09-17), i.e. the floor is OFF and this equals `hasConcludedContent`.
 * The floor is left in place because widening it is Ken's phased GSC ramp, not a
 * code change — see SEO_CONCLUDED_MAX_AGE_MONTHS above.
 */
export function isConcludedIndexable(row: ConcludedIndexableRow, now: Date = new Date()): boolean {
  return hasConcludedContent(row) && passesRecencyFloor(row, now);
}

/**
 * Content-presence predicate: does this concluded row carry a real, displayable
 * sale outcome? Used by the teaser's sold-price block, which must be a SUPERSET
 * of the index gate — an indexable page whose outcome block is hidden is exactly
 * the thin page this predicate exists to avoid.
 *
 * The category gate was REMOVED here together with the one in the content bar
 * (Dennis's full-registry ruling): keeping it would have made 2,539 indexable
 * off-taxonomy rows render without their outcome block. It remains recency-FREE
 * on purpose — a visitor landing on an old sold page still sees the sold price.
 */
export function hasConcludedOutcome(
  row: Pick<ConcludedIndexableRow, 'status' | 'saleResult' | 'resultCheckedAt'>,
): boolean {
  return (
    row.status != null &&
    STATUS_SET.has(row.status) &&
    row.resultCheckedAt != null &&
    isSeoIndexableOutcome(auctionOutcome({ status: row.status, saleResult: row.saleResult }))
  );
}

/**
 * Prisma WHERE fragment for sitemap membership — assembled from the SAME arm
 * list as `isConcludedIndexable`, so the two express the IDENTICAL predicate
 * (modulo the documented whitespace asymmetry, which leaves the WHERE a
 * superset — the safe direction: a sitemap URL must never render `noindex`).
 *
 * Callers still apply `isConcludedIndexable` in memory to the rows they fetch.
 * Both sitemap call sites do (sitemap-entries.ts, sitemap.xml/route.ts); do not
 * add a third that skips it.
 */
export function concludedIndexableWhere(now: Date = new Date()): Prisma.AuctionWhereInput {
  return {
    AND: [
      ...CONCLUDED_REQUIRED_ARMS.map((a) => a.where),
      atLeastWhere(CONCLUDED_SIGNAL_ARMS, SEO_CONCLUDED_MIN_DATA_SIGNALS),
      recencyFloorWhere(now),
    ],
  };
}

/**
 * The columns `isConcludedIndexable` reads. Every call site selects EXACTLY this
 * so the in-memory filter can never be starved of a field and silently reject
 * rows that actually qualify (a dropped field in a select is a one-way failure —
 * it looks like "fewer rows qualified", not like a bug).
 */
export const CONCLUDED_INDEXABLE_SELECT = {
  status: true,
  saleResult: true,
  province: true,
  municipality: true,
  endsAt: true,
  soldDate: true,
  soldPrice: true,
  valorSubasta: true,
  lotDescription: true,
  address: true,
} as const;
