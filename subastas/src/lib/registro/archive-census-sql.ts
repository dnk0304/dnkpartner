/**
 * archive-census-sql — the ONE definition of the archive rollup: the outcome
 * projection and the (province, municipio, tipo, año, trimestre, outcome) census
 * that sizes and fills the v4 archive tree.
 *
 * ---------------------------------------------------------------------------
 * WHY IT MOVED HERE (Forge, 2026-08-13, v4 P3)
 *
 * It used to live in `scripts/archive-rollup-sql.ts`, which was already the fix
 * for Ken's T2 ticket ("the CSV's outcome column is a hand-written SQL CASE
 * duplicating outcomeWhere()"). P3 needs the same census at REQUEST time — the
 * sitemap has to advertise the tree the routes actually serve — and an app
 * module cannot import from `scripts/`. Copying it would re-open T2 with a third
 * copy, so the definition moved into `src/` and the script now imports it. The
 * script keeps its filename, its CLI and its `--verify` proof; what it no longer
 * keeps is a private copy of the SQL.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ `AT TIME ZONE 'UTC'` IS LOAD-BEARING — DO NOT DROP IT
 *
 * `archive-node-read.ts:26-38` records why the year bucketing was done in JS
 * rather than SQL: bare `EXTRACT(YEAR FROM …)` resolves in the SESSION time
 * zone, while `archiveYearOf()` uses `getUTCFullYear()`. If those disagree, a
 * row near a year boundary is COUNTED in one year and RENDERED in another —
 * a node whose totals promise 10 pages but whose page 10 comes back empty, and
 * (worse, for P3) a sitemap advertising a node the route then 404s.
 *
 * Because this census now feeds a SERVED sitemap and not just an offline report,
 * "differs by a handful of boundary rows, which is fine for a planning artifact"
 * is no longer acceptable. `<ts> AT TIME ZONE 'UTC'` converts the timestamptz to
 * a UTC wall-clock timestamp BEFORE extraction, which makes the SQL bucket
 * bit-identical to `getUTCFullYear()` / `getUTCMonth()`. That equivalence is
 * asserted, not assumed — `scripts/verify-v4-sitemap.ts` re-buckets every cell
 * in JS and fails on a single disagreement.
 *
 * ⚠️ The COALESCEs are `''`/0, NOT defaults: an absent province or auctionType
 * must stay absent so the location-free shelf and the excluded-row census can
 * see it. An earlier version defaulted auctionType to 'JUDICIAL' and silently
 * hid exactly the residue the census is asked to count.
 */

import { STALE_SUSPENDED_DAYS } from '@/lib/seo/auction-outcome';

/**
 * The outcome projection, in ONE place.
 *
 * Ordered WHENs, and the order IS the precedence rule from `auctionOutcome()`:
 * a resolved sale wins over status, so by the time control reaches the third
 * branch `saleResult` is necessarily NULL or SIN_RESULTADO and the `NOT_SOLD`
 * predicate `outcomeWhere()` writes explicitly is implied rather than repeated.
 * The suspended branch is `staleSuspendedWhere()` verbatim: suspended, with
 * resumption absent or past, untouched for STALE_SUSPENDED_DAYS — which is
 * interpolated from the taxonomy constant, so raising the window cannot leave a
 * stale 60 behind in a query.
 *
 * `$1` is the "as of" instant, supplied once so every row is classified against
 * the same clock (a rollup that drifts mid-scan double-counts the boundary).
 */
export const ARCHIVE_ROLLUP_OUTCOME_CASE = `CASE
      WHEN a."saleResult" = 'ADJUDICADA' THEN 'VENDIDA'
      WHEN a."saleResult" = 'DESIERTA'   THEN 'DESIERTA'
      WHEN a.status IN ('CANCELADA','CANCELLED') THEN 'CANCELADA'
      WHEN a.status IN ('SUSPENDIDA','SUSPENDED')
       AND (a."resumeAt" IS NULL OR a."resumeAt" < $1)
       AND a."updatedAt" < $1 - interval '${STALE_SUSPENDED_DAYS} days'
                                                 THEN 'CANCELADA'
      WHEN a.status = 'FINALIZADA_AUTORIDAD'      THEN 'FINALIZADA_SIN_RESULTADO'
      ELSE 'INDETERMINADO'
    END`;

/**
 * The rollup SELECT — the body shared by the COPY export (the committed CSV that
 * sized P0) and the request-time census that fills the sitemap.
 *
 * `$1` = the classification instant. One instant, both callers.
 */
export const ARCHIVE_ROLLUP_SELECT = `WITH base AS (
    SELECT COALESCE(a.province,'')                AS province,
           COALESCE(a."municipality",'')          AS municipality,
           COALESCE(a."auctionType",'')           AS auction_type,
           COALESCE(EXTRACT(YEAR    FROM (COALESCE(a."endsAt", a."publishedAt") AT TIME ZONE 'UTC'))::int, 0) AS yr,
           COALESCE(EXTRACT(QUARTER FROM (COALESCE(a."endsAt", a."publishedAt") AT TIME ZONE 'UTC'))::int, 0) AS qtr,
           ${ARCHIVE_ROLLUP_OUTCOME_CASE} AS outcome
    FROM "Auction" a )
  SELECT province, municipality, auction_type, yr, qtr, outcome, count(*)::int AS n
  FROM base WHERE outcome <> 'INDETERMINADO' GROUP BY 1,2,3,4,5,6`;

/** The read-only prod rollup as a `COPY … TO STDOUT` CSV export. */
export function archiveRollupQuery(): string {
  return `COPY (\n  ${ARCHIVE_ROLLUP_SELECT}\n) TO STDOUT WITH CSV HEADER;`;
}

/** One row of the rollup, as `$queryRawUnsafe` returns it. */
export type ArchiveRollupRow = {
  province: string;
  municipality: string;
  auction_type: string;
  yr: number;
  qtr: number;
  outcome: string;
  n: number;
};
