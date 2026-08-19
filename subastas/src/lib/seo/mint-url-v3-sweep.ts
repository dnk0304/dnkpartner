/**
 * URL-v3 MINT SWEEP — mints a v3 url for every auction that does not have one.
 *
 * ─── WHY A SWEEP AND NOT AN IN-FLOW HOOK ────────────────────────────────────
 * The dispatch asked for "mint in the same flow as the auction is created".
 * Auctions are NOT created by this app: every source (BOE, SEGSOCIAL, PLABI,
 * plus the older standalone scrapers) writes through the PYTHON adapter
 * (`scraper/database/adapter.py::_upsert_auction_postgres`). A literal in-flow
 * hook there would mean a SECOND implementation of the slug rules, in Python —
 * which is precisely the batch-vs-ingest drift the dispatch forbids, and the
 * worst possible place for it, because a slug is permanent and a drifted one
 * cannot be redeployed away.
 *
 * So the flow is: Python commits the Auction row -> the scheduler immediately
 * pings `POST /api/mint/url-v3/run` -> this sweep mints it with the SAME
 * TypeScript function the 192,589-row batch used. Same code path, one
 * implementation, and it additionally covers every legacy scraper that never
 * went through the adapter at all — which an adapter-level hook would miss.
 *
 * It is also CONVERGENT rather than best-effort: a mint that fails (bad data, a
 * transient DB error, a genuine url collision) is simply still unminted, so the
 * next pass retries it. An in-flow hook that threw would either lose the
 * auction or lose the mint silently.
 *
 * ─── SAFETY ─────────────────────────────────────────────────────────────────
 * An unminted row is SAFE: `resolveAuctionPath` falls back to the legacy url,
 * which serves 200. So this sweep may refuse as often as it likes. What it must
 * never do is store a WRONG permanent url — hence every gate throws
 * (`MintGateError`) and the DB's own CHECK/UNIQUE constraints are the final
 * enforcement layer, never bypassed and never worked around by truncation.
 */
import { query, execute } from '@/lib/db';
import {
  mintAuctionUrlV3, MintGateError, type MintRowInput, type MintedUrlRow,
} from '@/lib/seo/mint-url-v3';
import { TOWN_RESOLVER_VERSION } from '@/lib/geo/resolve-town';

/**
 * The active auction states — minted FIRST because an active auction on a legacy
 * URL is the user-visible pain, and the concluded backlog is orders of magnitude
 * larger. Used only for candidate ORDER BY; never as a filter.
 */
const ACTIVE_STATUSES = ['PROXIMA_APERTURA', 'CELEBRANDOSE', 'SUSPENDIDA'];

/**
 * The frozen geo-quarantine snapshot. Quarantined rows never vote and never
 * mint (`resolve-town` header: "isolation is only worth something if the mint
 * respects it"). Table name is a hardcoded constant — never user input — so
 * interpolating it is safe; it is guarded by `to_regclass` because a fresh dev
 * or CI database does not have it.
 */
const QUARANTINE_TABLE = 'geo_quarantine_20260803';

/**
 * Rows this sweep has already DECIDED not to mint, with the reason.
 *
 * ⭐ Without this the sweep has no terminal state: the ~1,713 held and ~13,964
 * degraded rows would be recomputed on every pass forever, and "unminted count"
 * could never distinguish "not yet processed" from "deliberately not minted".
 * With it, the backlog converges to 0 and the residue is queryable and
 * explained. Clearing a row here (see `recheck`) re-offers it to the mint —
 * which is exactly how the held rows get released once the upstream `address`
 * defect is fixed, with no second switchover.
 */
const SKIP_TABLE = 'auction_url_v3_skip';

/**
 * ⚠️ FIELD ORDER IS DELIBERATE — the summary comes FIRST and `failures` LAST.
 *
 * JSON.stringify preserves insertion order, and the catch-up runbook's stop
 * condition is `remaining === 0`. In wave185 `remaining` was emitted AFTER a
 * 20-element `failures` array, so every truncated log line and console paste cut
 * it off and the operator could not see the done-signal that the runbook told
 * them to wait for. A number the runbook depends on must be readable in the
 * first line of output.
 */
export type SweepStats = {
  scanned: number;
  minted: number;
  held: number;
  degraded: number;
  /** Gate refusals + DB errors. Non-zero is LOUD: these are reported, never hidden. */
  failed: number;
  /**
   * Auctions still lacking a v3 row AND not skip-listed, after this pass.
   *
   * This is the CANDIDATE POOL, not "unminted rows". Total rows without an
   * `auction_url_v3` row is far larger (~48k) because it includes the
   * deliberately-excluded classes — quarantined, hex-legacy, and everything
   * already skip-listed as held/degraded. Those are never candidates, so they
   * must not appear here or the loop would never terminate.
   */
  remaining: number;
  /** The runbook's stop condition, stated outright so nobody has to derive it. */
  done: boolean;
  dryRun: boolean;
  /** Up to 20 failure reasons. LAST, because it is the only unbounded field. */
  failures: string[];
};

async function tableExists(name: string): Promise<boolean> {
  const rows = await query<{ reg: string | null }>('SELECT to_regclass(?) AS reg', [name]);
  return Boolean(rows[0]?.reg);
}

/** Ensure the skip ledger exists. Idempotent; safe to call on every sweep. */
async function ensureSkipTable(): Promise<void> {
  await execute(`CREATE TABLE IF NOT EXISTS "${SKIP_TABLE}" (
      "auction_id" TEXT PRIMARY KEY,
      "boe_id"     TEXT NOT NULL,
      "reason"     TEXT NOT NULL,
      "detail"     TEXT,
      "decided_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Self-migrating column. A degrade decision records the resolver fingerprint
  // that produced it; a NULL means "decided before versioning" — treated as
  // stale, so the row is re-offered. `held:` rows leave this NULL deliberately:
  // they are not gazetteer-gated and never expire with a resolver bump.
  await execute(
    `ALTER TABLE "${SKIP_TABLE}" ADD COLUMN IF NOT EXISTS "resolver_version" TEXT`,
  );
}

/**
 * A skip row is BINDING (excludes its auction from the candidate pool) only when:
 *   • it is a `held:` decision (descriptor-cap, not gazetteer-gated — terminal), OR
 *   • it is a `degraded:` decision stamped with the CURRENT resolver fingerprint.
 * A degrade stamped with an OLD or NULL fingerprint is STALE and re-offered, so a
 * resolver/gazetteer upgrade recovers every row it can now resolve, automatically.
 * The current fingerprint is bound as a parameter, never interpolated.
 */
const BINDING_SKIP = `NOT EXISTS (
      SELECT 1 FROM "${SKIP_TABLE}" s WHERE s.auction_id = a.id
        AND ( s.reason LIKE 'held:%'
           OR (s.reason LIKE 'degraded:%' AND s.resolver_version = ?) ) )`;

/**
 * The candidate query: every auction with no v3 url, no skip decision, that is
 * not hex-legacy and not quarantined.
 *
 * ⚠️ `boeId LIKE '0x%'` — hex-legacy rows (12,346) were DELIBERATELY never
 * minted and keep their old shape (Ken's ruling 2). This is the same exclusion
 * the batch export applied; it is written here rather than assumed because the
 * sweep is the only thing that will ever add rows to this table again.
 */
async function selectCandidates(limit: number): Promise<MintRowInput[]> {
  const hasQuarantine = await tableExists(QUARANTINE_TABLE);
  const quarantineClause = hasQuarantine
    ? `AND NOT EXISTS (SELECT 1 FROM "${QUARANTINE_TABLE}" q WHERE q.id = a.id)`
    : '';
  const activeList = ACTIVE_STATUSES.map((s) => `'${s}'`).join(',');
  return query<MintRowInput>(
    `SELECT a.id, a."boeId" AS "boeId", a.category, a.province,
            a.municipality, a."postalCode" AS "postalCode", a.address
       FROM "Auction" a
       LEFT JOIN auction_url_v3 v ON v.auction_id = a.id
      WHERE v.auction_id IS NULL
        AND ${BINDING_SKIP}
        AND a."boeId" NOT LIKE '0x%'
        ${quarantineClause}
      ORDER BY (a.status IN (${activeList})) DESC, a."createdAt" DESC
      LIMIT ?`,
    [TOWN_RESOLVER_VERSION, limit],
  );
}

async function countRemaining(): Promise<number> {
  const hasQuarantine = await tableExists(QUARANTINE_TABLE);
  const quarantineClause = hasQuarantine
    ? `AND NOT EXISTS (SELECT 1 FROM "${QUARANTINE_TABLE}" q WHERE q.id = a.id)`
    : '';
  const rows = await query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM "Auction" a
       LEFT JOIN auction_url_v3 v ON v.auction_id = a.id
      WHERE v.auction_id IS NULL AND ${BINDING_SKIP}
        AND a."boeId" NOT LIKE '0x%' ${quarantineClause}`,
    [TOWN_RESOLVER_VERSION],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Insert one minted row.
 *
 * ⭐ THE CONFLICT TARGET IS `auction_id`, DELIBERATELY — and nothing else.
 * A repeat upsert of the SAME auction is a no-op (idempotent re-ingest). But a
 * DIFFERENT auction that produces an ALREADY-TAKEN url must raise
 * `auction_url_v3_url_key` and fail this row LOUDLY. `ON CONFLICT DO NOTHING`
 * without a target, or targeting `url`, would swallow exactly the collision the
 * UNIQUE index exists to catch and leave one auction silently unreachable.
 *
 * The `length(url) <= 200`, `url LIKE '/subastas/%'` and `town_source` CHECKs
 * are likewise left to fire. Nothing here trims a url to make an insert succeed.
 */
async function insertMinted(row: MintedUrlRow): Promise<void> {
  await execute(
    `INSERT INTO auction_url_v3
       (auction_id, boe_id, url, province_slug, town_slug, town_source, ine,
        ref_tail, descriptor, descriptor_full, truncated, guard_signals)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (auction_id) DO NOTHING`,
    [
      row.auctionId, row.boeId, row.url, row.provinceSlug, row.townSlug, row.townSource,
      row.ine, row.refTail, row.descriptor, row.descriptorFull, row.truncated, row.guardSignals,
    ],
  );
}

async function recordSkip(
  auctionId: string, boeId: string, reason: string, detail: string | null,
  resolverVersion: string | null,
): Promise<void> {
  // DO UPDATE (not DO NOTHING): a row re-offered after a resolver bump and still
  // degrading must have its stamp refreshed to the CURRENT version, otherwise it
  // stays stale-flagged and is re-processed on every pass forever. Refreshing it
  // is what lets the backlog re-converge after an upgrade.
  await execute(
    `INSERT INTO "${SKIP_TABLE}" (auction_id, boe_id, reason, detail, resolver_version)
     VALUES (?,?,?,?,?)
     ON CONFLICT (auction_id) DO UPDATE
        SET reason = EXCLUDED.reason,
            detail = EXCLUDED.detail,
            resolver_version = EXCLUDED.resolver_version,
            decided_at = now()`,
    [auctionId, boeId, reason, detail, resolverVersion],
  );
}

/**
 * Run one sweep pass.
 *
 * `limit` bounds the work per call so the catch-up of a large backlog and the
 * every-few-minutes incremental pass are the SAME code with a different bound —
 * there is no separate "backfill script" to drift from the live path.
 */
export async function sweepMintUrlV3(
  opts: { limit?: number; dryRun?: boolean } = {},
): Promise<SweepStats> {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
  const dryRun = opts.dryRun ?? false;

  await ensureSkipTable();
  const candidates = await selectCandidates(limit);

  const stats: SweepStats = {
    scanned: candidates.length,
    minted: 0, held: 0, degraded: 0, failed: 0,
    remaining: 0, done: false, dryRun, failures: [],
  };

  for (const c of candidates) {
    try {
      const outcome = mintAuctionUrlV3(c);
      if (outcome.status === 'degraded') {
        stats.degraded += 1;
        // Stamp the resolver fingerprint so a future upgrade re-offers this row.
        if (!dryRun) {
          await recordSkip(c.id, c.boeId, `degraded:${outcome.reason}`, null, TOWN_RESOLVER_VERSION);
        }
        continue;
      }
      if (outcome.status === 'held') {
        stats.held += 1;
        // held is descriptor-cap, not gazetteer-gated → NULL version = terminal.
        if (!dryRun) await recordSkip(c.id, c.boeId, 'held:identifying-detail-lost', outcome.row.url, null);
        continue;
      }
      if (!dryRun) {
        await insertMinted(outcome.row);
        // A stale degrade-skip that now mints must not linger claiming "degraded".
        await execute(`DELETE FROM "${SKIP_TABLE}" WHERE auction_id = ?`, [outcome.row.auctionId]);
      }
      stats.minted += 1;
    } catch (err) {
      // LOUD, and NEVER "fixed" by shortening the url. The row stays unminted
      // and keeps serving its legacy url, which is the safe state; the next
      // pass will retry it once the underlying data or collision is resolved.
      stats.failed += 1;
      const why = err instanceof MintGateError
        ? err.message
        : `${c.boeId}: ${(err as Error).message}`;
      if (stats.failures.length < 20) stats.failures.push(why);
      console.error('[url-v3-mint-sweep] refused to mint', why);
    }
  }

  stats.remaining = await countRemaining();
  // `done` is deliberately NOT `remaining === 0` alone: a pass that refused
  // every row leaves remaining > 0 forever, and a pass that scanned nothing is
  // also done. Stating it explicitly stops the runbook looping on a stuck pool.
  stats.done = stats.remaining === 0;
  return stats;
}

/**
 * Clear skip decisions so those rows are re-offered to the mint. This is the
 * mechanism for releasing the held rows once the upstream `address` defect is
 * fixed — no second switchover, because the resolver reads the table live.
 */
export async function recheckSkipped(reasonPrefix: string): Promise<number> {
  await ensureSkipTable();
  const res = await execute(
    `DELETE FROM "${SKIP_TABLE}" WHERE reason LIKE ?`,
    [`${reasonPrefix}%`],
  );
  return res.changes ?? 0;
}
