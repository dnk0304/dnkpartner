/**
 * ETL: live SQLite (data/database/prod.db) -> Postgres (DATABASE_URL).
 *
 * Wave 1 Forge — runs ONCE to migrate the 229k-row asset onto the new
 * Hetzner/Coolify Postgres. Idempotent (ON CONFLICT DO UPDATE on boeId).
 *
 * Pre-flight:
 *   1. Postgres schema must already be migrated (`prisma migrate deploy`).
 *   2. SQLite DB file expected at SQLITE_PATH below (override via env).
 *   3. Set DATABASE_URL to the PG instance (tunnel for dev:
 *      postgres://dnksubastas:…@localhost:15432/dnksubastas).
 *
 * What it does:
 *   - User (1 row): one-shot insert
 *   - Auction (229k rows): paginated 1000 rows / txn, ON CONFLICT(boeId).
 *     Clamps year-0023-ish endsAt -> NULL.
 *   - Reports row-count parity at the end + 5-row field-by-field spot check.
 *
 * Intentionally skips: Favorite, Alert, Notification, Subscription, Session,
 * Account, VerificationToken, PasswordResetToken, PushSubscription — all
 * EMPTY in live SQLite (inspector confirmed).
 *
 * Usage (from C:\Users\D\Desktop\dnksubastas):
 *   $env:DATABASE_URL='postgres://…@localhost:15432/dnksubastas'
 *   npx tsx scripts/etl-sqlite-to-pg.ts
 */

import path from 'path';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
// pg-copy-streams ships with pg; works via dynamic require to avoid type fuss.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const copyFrom: any = require('pg-copy-streams').from;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pipeline } = require('node:stream/promises');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Readable } = require('node:stream');

const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data', 'database', 'prod.db');
const PG_URL = process.env.DATABASE_URL;
const BATCH_SIZE = Number(process.env.ETL_BATCH ?? 1000);

if (!PG_URL) {
  console.error('DATABASE_URL not set. Aborting.');
  process.exit(1);
}

// Columns we move (mirrors the live SQLite Auction schema).
const AUCTION_COLUMNS = [
  'id', 'boeId', 'title', 'category', 'province', 'municipality', 'status',
  'appraisalValue', 'currentBid', 'minimumBid', 'depositAmount', 'claimedAmount',
  'finalBid', 'bidIncrement',
  'courtName', 'procedureNumber', 'boeLink', 'auctionId', 'lotNumber', 'boeAnnouncement',
  'publishedAt', 'endsAt', 'endDateTime',
  'latitude', 'longitude', 'address',
  'propertyType', 'lotDescription', 'propertyDescription',
  'charges', 'chargesDetail', 'possessionStatus', 'visitable',
  'cadastralRef', 'cadastralData', 'registryId', 'registryInfo', 'contactInfo',
  'pdfUrl', 'imageUrl',
  'source', 'courtReference', 'edictUrl', 'originalSource', 'transitionedAt',
  'viewCount', 'favoriteCount',
  'createdAt', 'updatedAt',
  'mapUrl', 'streetViewUrl', 'placeUrl', 'directionsUrl', 'auctionType',
] as const;

// User columns that exist in BOTH SQLite (live) and PG (new). `phone` exists
// only in the new PG schema — defaults to NULL for migrated rows.
const USER_COLUMNS = [
  'id', 'email', 'password', 'name', 'emailVerified', 'image', 'tier',
  'trialStartDate', 'trialEndDate', 'hasUsedTrial', 'createdAt',
] as const;

function quoteIdent(name: string): string {
  return `"${name}"`;
}

/** Clamp obviously-broken dates (year < 1900 or > 2100) to null. */
function sanitizeDate(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  // Year 0023 etc. — the audit flagged 3 rows.
  if (/^00\d\d-/.test(s)) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 1900 || year > 2100) return null;
  return d.toISOString();
}

/** SQLite integers (0/1) -> JS booleans for PG boolean columns. */
function toBool(value: any): boolean {
  return value === 1 || value === true || value === '1' || value === 'true';
}

async function main() {
  console.log('=== Wave 1 ETL: SQLite -> Postgres ===');
  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(`PG:     ${PG_URL?.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`Batch:  ${BATCH_SIZE}`);

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pool = new Pool({ connectionString: PG_URL, max: 4 });

  // ------------------------- counts before -------------------------
  const sourceUserCount = (sqlite.prepare('SELECT COUNT(*) AS c FROM User').get() as any).c as number;
  const sourceAuctionCount = (sqlite.prepare('SELECT COUNT(*) AS c FROM Auction').get() as any).c as number;
  console.log(`Source row counts -> User: ${sourceUserCount}, Auction: ${sourceAuctionCount}`);

  // ------------------------- ETL: User -------------------------
  console.log('\n--- ETL: User ---');
  const users = sqlite.prepare(`SELECT ${USER_COLUMNS.join(', ')} FROM "User"`).all() as any[];

  if (users.length > 0) {
    const pgClient = await pool.connect();
    try {
      await pgClient.query('BEGIN');
      for (const u of users) {
        const cols = USER_COLUMNS.map(quoteIdent).join(', ');
        const placeholders = USER_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
        const updates = USER_COLUMNS
          .filter((c) => c !== 'id')
          .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
          .join(', ');
        const sql = `INSERT INTO "User" (${cols}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updates}`;
        const values = USER_COLUMNS.map((c) => {
          const v = u[c];
          if (c === 'hasUsedTrial') return toBool(v);
          if (c === 'emailVerified' || c === 'trialStartDate' || c === 'trialEndDate' || c === 'createdAt') {
            return sanitizeDate(v);
          }
          return v ?? null;
        });
        await pgClient.query(sql, values);
      }
      await pgClient.query('COMMIT');
    } catch (e) {
      await pgClient.query('ROLLBACK');
      throw e;
    } finally {
      pgClient.release();
    }
    console.log(`User: ${users.length} rows upserted.`);
  }

  // ------------------------- ETL: Auction (COPY FROM, fast path) -------------
  console.log('\n--- ETL: Auction (COPY FROM, fast path) ---');

  const DATE_COLS = new Set(['publishedAt', 'endsAt', 'endDateTime', 'transitionedAt', 'createdAt', 'updatedAt']);

  // COPY needs an empty target table or a staging table. We can't COPY into a
  // table with conflicts. Strategy: TRUNCATE the destination Auction first
  // (it was just created empty by the migration; this ETL is the initial
  // load — re-runs also work because we TRUNCATE), then COPY in.
  await pool.query('TRUNCATE TABLE "Auction" RESTART IDENTITY CASCADE');
  console.log('Truncated destination "Auction" (initial load).');

  const copyCols = AUCTION_COLUMNS.map(quoteIdent).join(', ');

  // Format a value for PG text COPY: TAB-separated, \N for null,
  // backslash-escape problematic chars per PG docs.
  function copyEscape(v: any): string {
    if (v === null || v === undefined) return '\\N';
    let s = typeof v === 'string' ? v : String(v);
    s = s
      .replace(/\\/g, '\\\\')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\0/g, '');
    return s;
  }

  const pgClient = await pool.connect();
  let processed = 0;
  let clampedDates = 0;
  const startedAt = Date.now();

  try {
    const copyStream = pgClient.query(
      copyFrom(`COPY "Auction" (${copyCols}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`)
    );

    // Async generator that streams SQLite rows formatted as PG COPY text.
    async function* genRows() {
      const stmt = sqlite.prepare(`SELECT ${AUCTION_COLUMNS.join(', ')} FROM Auction ORDER BY id`);
      for (const row of stmt.iterate() as any) {
        const parts = AUCTION_COLUMNS.map((c) => {
          let v: any = row[c];
          if (DATE_COLS.has(c)) {
            const sanitized = sanitizeDate(v);
            if (v !== null && v !== undefined && v !== '' && sanitized === null) clampedDates++;
            v = sanitized;
          }
          return copyEscape(v);
        });
        processed++;
        if (processed % 10_000 === 0) {
          const elapsed = (Date.now() - startedAt) / 1000;
          const rate = Math.round(processed / Math.max(elapsed, 0.001));
          process.stdout.write(`\r  ${processed.toLocaleString()} rows  |  ${rate.toLocaleString()} rows/s  |  ${elapsed.toFixed(1)}s`);
        }
        yield parts.join('\t') + '\n';
      }
    }

    await pipeline(Readable.from(genRows(), { encoding: 'utf-8' }), copyStream);
    process.stdout.write('\n');
    console.log(`Auction: ${processed} rows copied.`);
    console.log(`Date clamps: ${clampedDates} rows had endsAt/dates set to NULL.`);
  } catch (e) {
    console.error('COPY failed:', e);
    throw e;
  } finally {
    pgClient.release();
  }

  // ------------------------- verify -------------------------
  console.log('\n--- Verification ---');
  const destUserCount = Number(((await pool.query('SELECT COUNT(*)::int AS c FROM "User"')).rows[0] as any).c);
  const destAuctionCount = Number(((await pool.query('SELECT COUNT(*)::int AS c FROM "Auction"')).rows[0] as any).c);

  console.log(`User:     source=${sourceUserCount}    dest=${destUserCount}    ${sourceUserCount === destUserCount ? 'MATCH' : 'MISMATCH'}`);
  console.log(`Auction:  source=${sourceAuctionCount} dest=${destAuctionCount} ${sourceAuctionCount === destAuctionCount ? 'MATCH' : 'MISMATCH'}`);

  // Spot-check: pick 20 random boeIds from SQLite, compare key fields to PG.
  console.log('\nSpot-check (20 random rows, key fields):');
  const sample = sqlite.prepare(
    `SELECT boeId, title, status, appraisalValue, province, publishedAt, currentBid
     FROM Auction ORDER BY RANDOM() LIMIT 20`
  ).all() as any[];

  let mismatches = 0;
  for (const src of sample) {
    const dst = (await pool.query(
      `SELECT "boeId", title, status::text, "appraisalValue", province, "publishedAt", "currentBid"
       FROM "Auction" WHERE "boeId" = $1`,
      [src.boeId]
    )).rows[0] as any;

    if (!dst) {
      mismatches++;
      console.log(`  MISSING in PG: ${src.boeId}`);
      continue;
    }

    const cmp = [
      ['title', src.title, dst.title],
      ['status', src.status, dst.status],
      ['province', src.province, dst.province],
      ['appraisalValue', src.appraisalValue, dst.appraisalValue !== null ? Number(dst.appraisalValue) : null],
      ['currentBid', src.currentBid, dst.currentBid !== null ? Number(dst.currentBid) : null],
    ];
    const diffs = cmp.filter(([, a, b]) => {
      if (a === null || a === undefined) return b !== null && b !== undefined;
      if (b === null || b === undefined) return true;
      return String(a) !== String(b);
    });
    if (diffs.length > 0) {
      mismatches++;
      console.log(`  DIFF ${src.boeId}: ${diffs.map(([f, a, b]) => `${f}=${a}|${b}`).join(', ')}`);
    } else {
      console.log(`  OK ${src.boeId}`);
    }
  }
  console.log(`Spot-check: ${20 - mismatches}/20 matched.`);

  // Index sanity check
  const idx = (await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'Auction' ORDER BY indexname`)).rows;
  console.log(`\nAuction indexes (${idx.length}):`);
  for (const row of idx as any[]) console.log(`  - ${row.indexname}`);

  await pool.end();
  sqlite.close();

  console.log('\n=== ETL complete ===');
  if (sourceAuctionCount !== destAuctionCount || mismatches > 0) {
    console.error('Counts or spot-check did not fully match. Investigate above.');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('ETL failed:', err);
  process.exit(1);
});
