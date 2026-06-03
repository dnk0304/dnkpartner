/**
 * src/lib/auction-status.ts — SINGLE SOURCE OF TRUTH for "what is an active
 * auction" across every surface (list, counts, map, recent/carousel).
 *
 * Forge 2026-06-03 (unified active predicate wave). Before this lib, every
 * route file declared its OWN status set + clock rule:
 *   - /api/auctions LIST + counts/teaserCounts: ACTIVE/CELEBRANDOSE/SUSPENDED/
 *     SUSPENDIDA, NO clock guard → 542 rows
 *   - /api/auctions/recent (carousel): CELEBRANDOSE/ACTIVE/PROXIMA_APERTURA/
 *     PRE_AUCTION (SUSPENDIDA dropped 2026-06-02 as a local crowding patch)
 *     WITH a `endsAt IS NULL OR endsAt > NOW()` clock guard → 443 rows
 *   - /api/auctions/map: 4-set + PRE_AUCTION/PROXIMA_APERTURA + coords gate
 *     → 202 rows (coord-gated)
 * A SUSPENDIDA row was "active" in the list but invisible in the carousel.
 * A stale CELEBRANDOSE row whose clock had run out was "active" in 3 of 4.
 *
 * Resolution (Ken locked, 2026-06-03):
 *   1. SUSPENDIDA STAYS in the canonical active set. The carousel's 2026-06-02
 *      removal was a local patch for a Madrid-crowding symptom; the real fix
 *      is the round-robin / quality-score variety wave already shipped.
 *   2. The carousel keeps a SEPARATE LIVE_NOW_DB_STATUSES = [ACTIVE,
 *      CELEBRANDOSE] for `when=active` ("celebrándose right now") — that's
 *      legitimately a different question ("live this second" vs "active
 *      listing"), so it gets a distinct name and is NOT folded into "active".
 *   3. The clock guard (endsAt-based, null-safe) is applied to the canonical
 *      active set on EVERY surface. A CELEBRANDOSE row whose endsAt passed
 *      is not active — it's awaiting the scheduler sweep.
 *   4. The legacy → canonical status fold (DB_TO_FRONTEND_STATUS) lives here
 *      so every route stops re-declaring it.
 *
 * Surfaces wiring this lib:
 *   - src/app/api/auctions/route.ts          (list + teaserCounts + masking)
 *   - src/app/api/auctions/counts/route.ts   (grouped counts)
 *   - src/app/api/auctions/map/route.ts      (map markers — + coords gate)
 *   - src/app/api/auctions/recent/route.ts   (carousel — + variety scoring)
 *
 * Decision: every helper here is PURE. No I/O. No DB calls. Predicates are
 * exported in BOTH raw-SQL form (for the legacy raw-SQL routes) AND Prisma
 * `where` form (for the recent carousel which uses Prisma). Same predicate,
 * two materializations.
 */

// ─── Canonical status sets ────────────────────────────────────────────────

/**
 * The canonical "active auction" set used by list / counts / map / carousel
 * fallback. Mixes the BOE-accurate values (CELEBRANDOSE, SUSPENDIDA) with the
 * legacy values still present on older rows (ACTIVE, SUSPENDED) so both
 * generations coexist while the data backfill catches up.
 *
 * SUSPENDIDA is IN here intentionally — see file header.
 */
export const ACTIVE_DB_STATUSES = [
  'ACTIVE',
  'CELEBRANDOSE',
  'SUSPENDED',
  'SUSPENDIDA',
] as const;

/**
 * "Live right now" — a strict subset of ACTIVE_DB_STATUSES. Used by the
 * carousel's `when=active` bucket which asks "what is happening this second",
 * NOT "what listings are currently active". Suspended auctions are NOT live.
 * Do not use this for the listing/counts/map "active" question.
 */
export const LIVE_NOW_DB_STATUSES = ['ACTIVE', 'CELEBRANDOSE'] as const;

/**
 * Pre-auction / upcoming — auctions scheduled to open but not yet open.
 * The map's "default" set includes these (buyers want to see upcoming pins);
 * the carousel's `when=proximas` bucket uses just this set.
 */
export const PRE_AUCTION_DB_STATUSES = [
  'PRE_AUCTION',
  'PROXIMA_APERTURA',
] as const;

/**
 * Terminal states — auction is over. Used by list `?status=finished` and the
 * tier-masking "always show finished to everyone" branch.
 */
export const FINISHED_DB_STATUSES = [
  'FINISHED',
  'CONCLUIDA_PORTAL',
  'FINALIZADA_AUTORIDAD',
  'CANCELLED',
  'CANCELADA',
] as const;

/**
 * Active OR upcoming — the carousel's default bucket. Re-includes SUSPENDIDA
 * via ACTIVE_DB_STATUSES (this is the 2026-06-03 unification — carousel no
 * longer forks the active definition).
 */
export const ACTIVE_OR_UPCOMING_DB_STATUSES = [
  ...ACTIVE_DB_STATUSES,
  ...PRE_AUCTION_DB_STATUSES,
] as const;

/** Default map status set: active + pre-auction (buyers want upcoming pins). */
export const MAP_DEFAULT_DB_STATUSES = ACTIVE_OR_UPCOMING_DB_STATUSES;

// ─── Legacy → canonical fold ──────────────────────────────────────────────

/**
 * DB status → frontend status. The legacy January aliases
 * (ACTIVE/SUSPENDED/PRE_AUCTION/FINISHED/CANCELLED) fold into the
 * BOE-accurate values (CELEBRANDOSE/SUSPENDIDA/PROXIMA_APERTURA/...). Single
 * map; every route imports this (previously each route re-declared it,
 * which is how the surfaces drifted in the first place).
 */
export const DB_TO_FRONTEND_STATUS: Record<string, string> = {
  // BOE-accurate
  PROXIMA_APERTURA: 'proxima-apertura',
  CELEBRANDOSE: 'celebrandose',
  SUSPENDIDA: 'suspendida',
  CANCELADA: 'cancelada',
  CONCLUIDA_PORTAL: 'concluida-portal',
  FINALIZADA_AUTORIDAD: 'finalizada-autoridad',
  // Legacy (fold to BOE-accurate)
  PRE_AUCTION: 'proxima-apertura',
  ACTIVE: 'celebrandose',
  FINISHED: 'concluida-portal',
  SUSPENDED: 'suspendida',
  CANCELLED: 'cancelada',
};

/** Fold DB status to canonical frontend status. Unknown → 'celebrandose'. */
export function mapStatus(dbStatus: string | null | undefined): string {
  if (!dbStatus) return 'celebrandose';
  return DB_TO_FRONTEND_STATUS[dbStatus] ?? 'celebrandose';
}

// ─── Predicate helpers ────────────────────────────────────────────────────

const ACTIVE_SET = new Set<string>(ACTIVE_DB_STATUSES);
const PRE_AUCTION_SET = new Set<string>(PRE_AUCTION_DB_STATUSES);
const FINISHED_SET = new Set<string>(FINISHED_DB_STATUSES);
const LIVE_NOW_SET = new Set<string>(LIVE_NOW_DB_STATUSES);

export function isActiveStatus(dbStatus: string | null | undefined): boolean {
  return dbStatus != null && ACTIVE_SET.has(dbStatus);
}
export function isPreAuctionStatus(
  dbStatus: string | null | undefined,
): boolean {
  return dbStatus != null && PRE_AUCTION_SET.has(dbStatus);
}
export function isFinishedStatus(
  dbStatus: string | null | undefined,
): boolean {
  return dbStatus != null && FINISHED_SET.has(dbStatus);
}
export function isLiveNowStatus(
  dbStatus: string | null | undefined,
): boolean {
  return dbStatus != null && LIVE_NOW_SET.has(dbStatus);
}

// ─── Clock guard ──────────────────────────────────────────────────────────

/**
 * The canonical "this auction hasn't ended yet" clock guard, raw-SQL form.
 *
 * Null-safe — a row with no `endsAt` is treated as "still active" (e.g. the
 * BOE hasn't published an end timestamp yet, or it's PROXIMA_APERTURA). A row
 * with a past `endsAt` is treated as "not active" even if its stored status
 * still says CELEBRANDOSE (the scheduler sweep is lagging — that's a
 * separate concern; this guard makes the surfaces agree with reality NOW).
 *
 * Used inline in raw-SQL WHERE clauses. The column name is hardcoded as
 * `endsAt` (auto-quoted by db.ts via its PG_IDENTIFIERS list) since every
 * caller queries the same column.
 *
 * The SQL fragment does NOT consume any `?` placeholders — `NOW()` is
 * server-side. This keeps the param array of each caller untouched.
 */
export const ACTIVE_CLOCK_GUARD_SQL =
  '("endsAt" IS NULL OR "endsAt" > NOW())';

/** Prisma equivalent — accepts an optional `now` for testability. */
export function activeClockGuardPrisma(now: Date = new Date()): {
  OR: Array<
    { endsAt: null } | { endsAt: { gt: Date } }
  >;
} {
  return { OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}

// ─── Backward-compatible re-exports ───────────────────────────────────────

/**
 * The carousel previously declared this name locally. Keep the symbol so
 * downstream tests/grep continue to find it, but point at the canonical lib.
 */
export const ACTIVE_OR_UPCOMING = ACTIVE_OR_UPCOMING_DB_STATUSES;
