/**
 * URL-v3 STREET-TYPE FULL-WORD RE-MINT (url-street-fullword, 2026-08-24).
 *
 * Re-mints every `auction_url_v3` row whose descriptor leads with an
 * abbreviated Spanish via-type code (`cl-…`, `av-…`, `avda-…`) to its
 * full-word form (`calle-…`, `avenida-…`), and records the OLD url in
 * `auction_url_v3_alias` so it keeps resolving (301). The alias INSERT and the
 * url UPDATE happen in the SAME transaction per row — an old url is never left
 * 404-ing.
 *
 * ⭐ IT RE-USES THE MINT PATH. Each row is recomputed through
 * `mintAuctionUrlV3` (the exact function the batch + ingest use), so the full
 * guard ladder runs — length ceiling, truncation flags, collision handling.
 * There is NO bespoke string-rewrite of the stored url.
 *
 * ── HARD GATE: BACKUP FIRST ─────────────────────────────────────────────────
 * No mutating statement runs until the in-DB snapshot table
 * `auction_url_v3_bak_20260824` exists AND its row count equals the live
 * `auction_url_v3` count. Create it with `--backup`; `--apply` refuses without
 * it.
 *
 * ── USAGE (Ken runs --apply on prod; Forge only dry-runs locally) ───────────
 *   tsx scripts/url-v3-street-fullword-remint.ts               # dry-run report
 *   tsx scripts/url-v3-street-fullword-remint.ts --backup      # create+verify snapshot
 *   tsx scripts/url-v3-street-fullword-remint.ts --apply       # perform re-mint (gated)
 *   tsx scripts/url-v3-street-fullword-remint.ts --apply --limit 500
 *
 * SAFE BY DESIGN: dry-run is the default; only a row whose recompute status is
 * `minted` and whose new url actually differs is touched; a row that would flip
 * to held/degraded, collide, or breach the ceiling is SKIPPED and reported,
 * never force-written.
 */
import type { PoolClient } from 'pg';
import { getDbPool, closeDb } from '@/lib/db';
import { mintAuctionUrlV3, type MintRowInput } from '@/lib/seo/mint-url-v3';
import { VIA_TYPE_EXPANSION, classifyLeadingViaType } from '@/lib/seo/street-type-expand';

const BACKUP_TABLE = 'auction_url_v3_bak_20260824';

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
const DO_BACKUP = argv.has('--backup');
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  ?? (process.argv.includes('--limit') ? `--limit=${process.argv[process.argv.indexOf('--limit') + 1]}` : '');
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : 0; // 0 = no limit

/** Anchored regex matching a descriptor whose LEADING token is an expandable code. */
function candidateRegex(): string {
  // Longest-first so the alternation prefers `avda` over `av` (harmless with the
  // `(-|$)` anchor, but tidy). Codes are our own constants, never user input.
  const codes = Object.keys(VIA_TYPE_EXPANSION).sort((a, b) => b.length - a.length);
  return `^(${codes.join('|')})(-|$)`;
}

type Row = MintRowInput & { old_url: string; old_descriptor: string | null };

async function liveCount(client: PoolClient, table: string): Promise<number> {
  const r = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}"`);
  return Number(r.rows[0]?.n ?? 0);
}

async function tableExists(client: PoolClient, name: string): Promise<boolean> {
  const r = await client.query<{ reg: string | null }>('SELECT to_regclass($1) AS reg', [name]);
  return Boolean(r.rows[0]?.reg);
}

/** Create the snapshot table and verify its row count matches the live table. */
async function createBackup(client: PoolClient): Promise<void> {
  if (await tableExists(client, BACKUP_TABLE)) {
    const bak = await liveCount(client, BACKUP_TABLE);
    const live = await liveCount(client, 'auction_url_v3');
    if (bak !== live) {
      throw new Error(
        `backup ${BACKUP_TABLE} exists with ${bak} rows but live has ${live} — refusing to overwrite; drop it manually if intentional`,
      );
    }
    console.log(`[backup] ${BACKUP_TABLE} already present and row-count-verified (${bak} rows)`);
    return;
  }
  await client.query(`CREATE TABLE "${BACKUP_TABLE}" AS SELECT * FROM auction_url_v3`);
  const bak = await liveCount(client, BACKUP_TABLE);
  const live = await liveCount(client, 'auction_url_v3');
  if (bak !== live) throw new Error(`backup verification FAILED: ${BACKUP_TABLE}=${bak} vs live=${live}`);
  console.log(`[backup] created ${BACKUP_TABLE} and verified ${bak} rows == live ${live}`);
}

/** HARD GATE — refuse to mutate unless a row-count-verified backup exists. */
async function assertBackupGate(client: PoolClient): Promise<void> {
  if (!(await tableExists(client, BACKUP_TABLE))) {
    throw new Error(`HARD GATE: backup table ${BACKUP_TABLE} does not exist — run with --backup first`);
  }
  const bak = await liveCount(client, BACKUP_TABLE);
  const live = await liveCount(client, 'auction_url_v3');
  if (bak !== live) {
    throw new Error(`HARD GATE: backup ${BACKUP_TABLE} has ${bak} rows, live has ${live} — mismatch, refusing to write`);
  }
  console.log(`[gate] backup verified (${bak} == ${live}) — mutations permitted`);
}

async function selectCandidates(client: PoolClient): Promise<Row[]> {
  const sql = `
    SELECT a.id, a."boeId" AS "boeId", a.category, a.province, a.municipality,
           a."postalCode" AS "postalCode", a.address,
           v.url AS old_url, v.descriptor AS old_descriptor
      FROM auction_url_v3 v
      JOIN "Auction" a ON a.id = v.auction_id
     WHERE v.descriptor ~ $1
     ORDER BY v.auction_id
     ${LIMIT ? `LIMIT ${LIMIT}` : ''}`;
  const r = await client.query<Row>(sql, [candidateRegex()]);
  return r.rows;
}

type Stats = {
  candidates: number;
  expanded: number;
  ambiguousSkipped: number;
  unchanged: number;
  flippedHeld: number;
  flippedDegraded: number;
  collisions: number;
  ceilingOver: number;
  aliasWritten: number;
  byCode: Record<string, number>;
  ambiguousByCode: Record<string, number>;
  samples: string[];
  errors: string[];
};

/** Re-mint one row inside its own transaction. Returns the applied new url, or null. */
async function remintOne(client: PoolClient, row: Row, stats: Stats): Promise<void> {
  const cls = classifyLeadingViaType(row.old_descriptor ?? '');
  if (cls.action === 'ambiguous-skipped') {
    stats.ambiguousSkipped += 1;
    stats.ambiguousByCode[cls.token] = (stats.ambiguousByCode[cls.token] ?? 0) + 1;
    return;
  }

  const outcome = mintAuctionUrlV3({
    id: row.id, boeId: row.boeId, category: row.category, province: row.province,
    municipality: row.municipality, postalCode: row.postalCode, address: row.address,
  });

  if (outcome.status === 'degraded') { stats.flippedDegraded += 1; stats.errors.push(`degraded ${row.boeId}: ${outcome.reason}`); return; }
  if (outcome.status === 'held') { stats.flippedHeld += 1; stats.errors.push(`held ${row.boeId}: ${outcome.row.url}`); return; }

  const newRow = outcome.row;
  if (newRow.url === row.old_url) { stats.unchanged += 1; return; }
  if (newRow.url.length > 200) { stats.ceilingOver += 1; stats.errors.push(`ceiling ${row.boeId}: ${newRow.url.length}`); return; }

  stats.expanded += 1;
  stats.byCode[cls.token] = (stats.byCode[cls.token] ?? 0) + 1;
  if (stats.samples.length < 15) stats.samples.push(`${row.old_url}  ->  ${newRow.url}`);

  if (!APPLY) return; // dry-run: measured only

  try {
    await client.query('BEGIN');
    // Alias FIRST: record the old url before we overwrite it, so a failure
    // between the two statements can never leave an unaliased overwrite.
    await client.query(
      `INSERT INTO auction_url_v3_alias (old_url, auction_id) VALUES ($1, $2)
         ON CONFLICT (old_url) DO NOTHING`,
      [row.old_url, row.id],
    );
    await client.query(
      `UPDATE auction_url_v3
          SET url = $1, descriptor = $2, descriptor_full = $3, truncated = $4
        WHERE auction_id = $5`,
      [newRow.url, newRow.descriptor, newRow.descriptorFull, newRow.truncated, row.id],
    );
    await client.query('COMMIT');
    stats.aliasWritten += 1;
  } catch (err) {
    await client.query('ROLLBACK');
    const msg = (err as Error).message;
    if (/auction_url_v3_url_key|duplicate key/i.test(msg)) {
      stats.collisions += 1;
      stats.errors.push(`collision ${row.boeId}: ${newRow.url}`);
    } else {
      stats.errors.push(`write-failed ${row.boeId}: ${msg}`);
    }
    stats.expanded -= 1; // it did not actually apply
    stats.byCode[cls.token] -= 1;
  }
}

async function main(): Promise<void> {
  const client = await getDbPool().connect();
  try {
    if (DO_BACKUP) { await createBackup(client); if (!APPLY) return; }
    if (APPLY) await assertBackupGate(client);

    const rows = await selectCandidates(client);
    const stats: Stats = {
      candidates: rows.length, expanded: 0, ambiguousSkipped: 0, unchanged: 0,
      flippedHeld: 0, flippedDegraded: 0, collisions: 0, ceilingOver: 0, aliasWritten: 0,
      byCode: {}, ambiguousByCode: {}, samples: [], errors: [],
    };

    for (const row of rows) await remintOne(client, row, stats);

    console.log(`\n=== url-v3 street-fullword re-mint (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`);
    console.log(JSON.stringify({
      candidates: stats.candidates,
      expanded: stats.expanded,
      aliasWritten: stats.aliasWritten,
      ambiguousSkipped: stats.ambiguousSkipped,
      unchanged: stats.unchanged,
      flippedHeld: stats.flippedHeld,
      flippedDegraded: stats.flippedDegraded,
      collisions: stats.collisions,
      ceilingOver: stats.ceilingOver,
      byCode: stats.byCode,
      ambiguousByCode: stats.ambiguousByCode,
    }, null, 2));
    if (stats.samples.length) console.log('\nsamples:\n  ' + stats.samples.join('\n  '));
    if (stats.errors.length) console.log(`\nflagged (${stats.errors.length}):\n  ` + stats.errors.slice(0, 40).join('\n  '));

    if (APPLY) {
      // Proof: alias row count for THIS run == expanded count applied.
      const aliasN = await liveCount(client, 'auction_url_v3_alias');
      console.log(`\n[proof] auction_url_v3_alias now holds ${aliasN} rows (cumulative).`);
    }
  } finally {
    client.release();
    await closeDb();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
