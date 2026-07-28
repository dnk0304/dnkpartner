/**
 * src/lib/registro/registry-total.ts — THE SINGLE AUTHORITATIVE "total auctions
 * we have" count.
 *
 * Dennis (2026-07-28): "the total counter [must] be synchronized everywhere on
 * our pages. That should show the total auctions that we have, even if status on
 * many are unknown. If it's in our registry, it should count."
 *
 * The number is exactly `COUNT(*) FROM Auction WHERE inScope = true`:
 *   - INCLUDES INDETERMINADO / unknown-outcome rows (CONCLUIDA_PORTAL with a
 *     null saleResult) — they ARE in our registry, so they count.
 *   - INCLUDES rows with an empty / junk province — a missing province is a
 *     data-completeness gap, not a reason to drop the row from the grand total.
 *   - EXCLUDES only `inScope = false` (soft-hidden junk: movable / rights /
 *     empty-shell rows). Those are deliberately not part of the catalog.
 *
 * This is DELIBERATELY decoupled from Σ(per-province rows). The province grid's
 * per-row badges can only ever show province-assigned auctions (inherent to a
 * province grid); the HEADLINE total is the true full count and will legitimately
 * exceed the visible rows' sum while province-less rows exist / the province
 * backfill is pending. That is expected and correct — the total is the total.
 *
 * Every surface that shows a "total auctions we track" counter reads THIS value
 * (via /api/auctions/counts `totals.registryTotal` or /api/auctions/stats
 * `totalInScope`) so the number is identical everywhere. Per-outcome archive
 * totals (/resultados `registryTotal` = Σ resolved-outcome buckets) are a
 * DIFFERENT, correctly-scoped metric and intentionally NOT unified here.
 */
import { queryOne } from '@/lib/db';
import { IN_SCOPE_GUARD_SQL } from '@/lib/auction-status';

/**
 * The canonical SQL for the authoritative total. Exported so a unit test can
 * assert its shape (it must filter on inScope and NOTHING else — no status,
 * saleResult, outcome, or province predicate — otherwise unknown-status /
 * province-less rows would silently drop out of the grand total).
 *
 * A single `COUNT(*)` on the `@@index([inScope])` partial-ish index is cheap
 * (Postgres index-only-ish scan); memoized below so repeated page loads within
 * the TTL never re-hit the DB.
 */
export const REGISTRY_TOTAL_SQL = `SELECT COUNT(*) AS n FROM Auction WHERE ${IN_SCOPE_GUARD_SQL}`;

interface CountRow {
  n: number | string | bigint;
}

// In-process memo. The grand total moves only when the scraper ingests new rows
// or the scope flag flips — a few minutes of staleness on a headline counter is
// invisible to users and saves a COUNT on every home/stats request.
const TTL_MS = 5 * 60 * 1000;
let _cache: { value: number; expiresAt: number } | null = null;

/**
 * The authoritative "total auctions in our registry" = COUNT(*) WHERE
 * inScope = true. Memoized ~5 min. Returns 0 on any DB error (callers treat it
 * as "unavailable" and fall back to their existing derived total so a counter
 * never blanks).
 */
export async function getRegistryTotalCount(now: number = Date.now()): Promise<number> {
  if (_cache && _cache.expiresAt > now) return _cache.value;
  const row = await queryOne<CountRow>(REGISTRY_TOTAL_SQL, []);
  const value = Number(row?.n ?? 0) || 0;
  _cache = { value, expiresAt: now + TTL_MS };
  return value;
}

/** Test-only: drop the memo so a test can exercise the fetch path deterministically. */
export function __resetRegistryTotalCache(): void {
  _cache = null;
}
