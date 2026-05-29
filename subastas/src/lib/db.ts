/**
 * Postgres-backed implementation of the legacy `query/queryOne/execute` API.
 *
 * Was: better-sqlite3, opening data/database/prod.db, using `?` placeholders.
 * Now: pg.Pool against DATABASE_URL, with `?` placeholders auto-translated
 *      to PG's `$1, $2, …` and the handful of SQLite-only functions used in
 *      this codebase rewritten on the fly.
 *
 * Migrated as part of Wave 1 (Forge). The reason it was NOT replaced by a
 * full Prisma Client port for the legacy raw-SQL routes is that those routes
 * use complex cursor pagination + dynamic IN-clauses + filtered count caching
 * that a literal `findMany` port would not preserve. The adapter keeps the
 * call sites intact; new code should import from `@/lib/prisma` instead.
 */
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

const globalForDb = globalThis as unknown as {
  __subastasPgPool?: Pool;
};

const DATABASE_URL = process.env.DATABASE_URL;

function buildPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Set it to a Postgres connection string before importing @/lib/db.'
    );
  }

  const config: PoolConfig = {
    connectionString: DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };

  return new Pool(config);
}

// Reuse one pool per process (Next dev reloads modules many times — keep one
// pool on globalThis so we don't exhaust connections).
function getPool(): Pool {
  if (!globalForDb.__subastasPgPool) {
    globalForDb.__subastasPgPool = buildPool();
    globalForDb.__subastasPgPool.on('error', (err) => {
      console.error('[db] pg pool error:', err);
    });
  }
  return globalForDb.__subastasPgPool;
}

/**
 * Identifiers (table + column names) Prisma creates in mixed case. SQLite
 * is case-insensitive on unquoted identifiers; Postgres downcases them. We
 * auto-wrap each of these in double quotes anywhere they appear in raw SQL
 * (outside string literals), so the existing routes don't need to be rewritten
 * by hand.
 *
 * Only mixed-case (not all-lowercase) identifiers go here; all-lowercase ones
 * are already correct in PG without quoting.
 */
const PG_IDENTIFIERS = [
  // Tables (PascalCase by Prisma convention)
  'Auction',
  'User',
  'Alert',
  'Subscription',
  'Account',
  'Session',
  'VerificationToken',
  'PasswordResetToken',
  'Favorite',
  'Notification',
  'PushSubscription',
  'AuctionStatusHistory',
  'AuctionBidHistory',
  'EventOutbox',
  // Mixed-case column names that appear in raw SQL
  'userId',
  'auctionId',
  'alertId',
  'boeId',
  'boeLink',
  'edictUrl',
  'pdfUrl',
  'imageUrl',
  'mapUrl',
  'streetViewUrl',
  'placeUrl',
  'directionsUrl',
  'auctionType',
  'propertyType',
  'propertyDescription',
  'lotDescription',
  'lotNumber',
  'boeAnnouncement',
  'courtName',
  'courtReference',
  'procedureNumber',
  'cadastralRef',
  'cadastralData',
  'registryId',
  'registryInfo',
  'contactInfo',
  'possessionStatus',
  'chargesDetail',
  'originalSource',
  'transitionedAt',
  'publishedAt',
  'endsAt',
  'endDateTime',
  'createdAt',
  'updatedAt',
  'sentAt',
  'changedAt',
  'seenAt',
  'deliveredAt',
  'processedAt',
  'lastVerifiedAt',
  'resumeAt',
  'suspensionReason',
  'failureReason',
  'deliveryAttempts',
  'dedupeKey',
  'eventType',
  'bidType',
  'fromStatus',
  'toStatus',
  'detectedBy',
  'currentBid',
  'finalBid',
  'minimumBid',
  'depositAmount',
  'claimedAmount',
  'bidIncrement',
  'appraisalValue',
  'maxPrice',
  'minPrice',
  'notificationType',
  'emailEnabled',
  'smsEnabled',
  'notifyOnGoLive',
  'notifyOnBid',
  'notifyOnStatus',
  'notifyOnSuspension',
  'notifyOnResume',
  'notifyOnFinish',
  'quietHoursStart',
  'quietHoursEnd',
  'viewCount',
  'favoriteCount',
  'sessionToken',
  'providerAccountId',
  'refresh_token', // already snake (no need to quote) — kept here for clarity
  'access_token',
  'expires_at',
  'token_type',
  'session_state',
  'id_token',
  'emailVerified',
  'hasUsedTrial',
  'trialStartDate',
  'trialEndDate',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'stripePriceId',
  'currentPeriodStart',
  'currentPeriodEnd',
  'cancelAtPeriodEnd',
  'p256dh', // lowercase, but disambiguates from p256dh keyword — included for safety
  'expiresAt',
] as const;

// Pre-built map: identifier -> /\b<ident>\b/g (word boundaries)
const IDENTIFIER_REGEXES: Array<{ regex: RegExp; quoted: string }> = PG_IDENTIFIERS
  // longer first so substrings don't shadow (e.g. `Auction` before `id`)
  .slice()
  .sort((a, b) => b.length - a.length)
  .map((ident) => ({
    // Lookbehind: disallow word chars (mid-word match) and `"` (already quoted),
    // but ALLOW `.` because `tableAlias.columnName` is a primary case we must quote.
    // Lookahead: disallow word chars and `"` (already quoted).
    regex: new RegExp(`(?<![\\w"])${escapeRegex(ident)}(?![\\w"])`, 'g'),
    quoted: `"${ident}"`,
  }));

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Quote `AS aliasName` / `as aliasName` when the alias has any uppercase
 * letter (so PG doesn't downcase it on output). Skips already-quoted aliases.
 */
// SQL type names that follow `CAST(x AS …)` — must NOT be treated as aliases.
const SQL_TYPE_KEYWORDS = new Set([
  'INTEGER', 'BIGINT', 'SMALLINT', 'INT', 'INT4', 'INT8', 'INT2',
  'FLOAT', 'REAL', 'DOUBLE', 'NUMERIC', 'DECIMAL',
  'TEXT', 'VARCHAR', 'CHAR', 'CHARACTER',
  'BOOLEAN', 'BOOL',
  'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIMETZ', 'INTERVAL',
  'JSON', 'JSONB', 'UUID', 'BYTEA',
]);

function quoteAliasesOutsideStrings(sql: string): string {
  return splitOnStrings(sql)
    .map((part) => {
      if (part.isString) return part.text;
      return part.text.replace(/\b(AS|as)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, (_m, kw, name) => {
        if (name.startsWith('"')) return _m;
        if (SQL_TYPE_KEYWORDS.has(name.toUpperCase())) return _m;
        if (/[A-Z]/.test(name)) return `${kw} "${name}"`;
        return _m;
      });
    })
    .join('');
}

/**
 * Apply the identifier-quoting regexes only to segments OUTSIDE single-quoted
 * string literals. SQL allows '' as an escape for a literal single quote, which
 * we honor.
 */
function quoteIdentifiersOutsideStrings(sql: string): string {
  return splitOnStrings(sql)
    .map((p) => {
      if (p.isString) return p.text;
      let s = p.text;
      for (const { regex, quoted } of IDENTIFIER_REGEXES) {
        s = s.replace(regex, quoted);
      }
      return s;
    })
    .join('');
}

/**
 * Split a SQL string into alternating outside-string / inside-string segments,
 * honoring `''` as an escaped single quote. The opening quote stays with the
 * "outside" segment that precedes it; the closing quote stays with the "inside"
 * segment. (Regex replacement on the inside segments is a no-op anyway since
 * we never touch them.)
 */
function splitOnStrings(sql: string): Array<{ text: string; isString: boolean }> {
  const parts: Array<{ text: string; isString: boolean }> = [];
  let buf = '';
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (inString && sql[i + 1] === "'") {
        // Escaped quote: stay inside the string.
        buf += "''";
        i++;
        continue;
      }
      buf += ch;
      parts.push({ text: buf, isString: inString });
      buf = '';
      inString = !inString;
      continue;
    }
    buf += ch;
  }
  if (buf.length > 0) {
    parts.push({ text: buf, isString: inString });
  }
  return parts;
}

/**
 * Translate a SQL string written for SQLite to PG-compatible SQL.
 *
 * 1. SQLite helper functions:
 *      - `datetime('now')`        -> `NOW()`
 *      - `strftime('%Y', expr)`   -> `EXTRACT(YEAR FROM expr)::int`
 * 2. Wrap Prisma's mixed-case table/column names in double quotes so PG
 *    matches them case-sensitively.
 * 3. `?` -> `$1, $2, …` in order. `?` inside string literals is preserved.
 *
 * Steps 1–2 are applied to the WHOLE string (it's almost always safe; the
 * regexes use word boundaries and skip already-quoted identifiers). Step 3 is
 * a hand-written scanner that respects string literals.
 *
 * If a SQLite-only function not in the list above appears in a new route,
 * PG will throw a clear "function … does not exist" error — add it here.
 */
function translateSql(sql: string): string {
  // 1. SQLite -> PG function rewrites.
  // - datetime('now')                   -> NOW()
  // - datetime('now', '-30 days')       -> NOW() - INTERVAL '30 days'
  // - datetime(expr) (single arg)       -> expr   (PG cols are already timestamps)
  // - strftime('%Y', expr)              -> EXTRACT(YEAR FROM expr)::int
  let translated = sql
    .replace(
      /datetime\(\s*'now'\s*,\s*'([+-]?\d+)\s+(days?|hours?|minutes?|seconds?|months?|years?|weeks?)'\s*\)/gi,
      (_m, n, unit) => {
        const num = parseInt(n, 10);
        const op = num < 0 ? '-' : '+';
        const pgUnit = unit.replace(/s?$/, 's');
        return `NOW() ${op} INTERVAL '${Math.abs(num)} ${pgUnit}'`;
      }
    )
    .replace(/datetime\(\s*'now'\s*\)/gi, 'NOW()')
    .replace(/strftime\(\s*'%Y'\s*,\s*([^)]+)\)/gi, 'EXTRACT(YEAR FROM $1)::int')
    .replace(/\bdatetime\(\s*(COALESCE\([^)]*\)|[\w."]+)\s*\)/gi, '$1');

  // 2. Auto-quote mixed-case identifiers. We split on string literals so we
  // never substitute inside one.
  translated = quoteIdentifiersOutsideStrings(translated);

  // 2b. Auto-quote camelCase output aliases (`AS aliasName` / `as aliasName`).
  // PG downcases unquoted aliases — the legacy code reads them as `row.aliasName`,
  // so without quotes the value comes back on `row.aliasname` and reads as undefined.
  // We only touch aliases that contain at least one uppercase letter (so we don't
  // touch all-lowercase aliases like `as count`, `as has_coords`).
  translated = quoteAliasesOutsideStrings(translated);

  // Walk the string and replace each `?` not inside a quoted literal with $N.
  let out = '';
  let i = 0;
  let n = 1;
  let inSingle = false;
  let inDouble = false;
  while (i < translated.length) {
    const ch = translated[i];
    if (ch === "'" && !inDouble) {
      // Toggle. SQLite/PG both escape single quote as ''
      inSingle = !inSingle;
      out += ch;
      i++;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      i++;
      continue;
    }
    if (ch === '?' && !inSingle && !inDouble) {
      out += '$' + n;
      n++;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Returned by `execute` — mirrors the better-sqlite3 RunResult shape used by callers. */
export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

async function runQuery<T extends QueryResultRow>(sql: string, params: unknown[]): Promise<QueryResult<T>> {
  const pgSql = translateSql(sql);
  const pool = getPool();
  try {
    return await pool.query<T>(pgSql, params as any[]);
  } catch (error) {
    console.error('[db] Postgres query error:', error);
    console.error('[db] SQL (original):', sql);
    if (sql !== pgSql) console.error('[db] SQL (translated):', pgSql);
    console.error('[db] Params:', params);
    throw error;
  }
}

/**
 * The original API was synchronous (better-sqlite3 is sync). We expose async
 * functions now. All callers `await` their DB calls already (Next route
 * handlers are async), so this is a near-drop-in replacement.
 *
 * If a legacy caller relied on sync semantics (no `await`), TypeScript will
 * flag it because the return type changed from `T[]` to `Promise<T[]>`.
 */
export async function query<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await runQuery<T>(sql, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = any>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const result = await runQuery<T>(sql, params);
  return result.rows[0];
}

export async function execute(sql: string, params: unknown[] = []): Promise<RunResult> {
  const result = await runQuery<QueryResultRow>(sql, params);
  return {
    changes: result.rowCount ?? 0,
    // PG does not return a rowid for INSERTs without RETURNING. Callers in
    // this codebase don't rely on this value (they generate IDs application-side),
    // but we keep the field so the shape matches.
    lastInsertRowid: 0,
  };
}

/** Exposed for migrations / scripts that want raw pool access. */
export function getDbPool(): Pool {
  return getPool();
}

/** TEST-ONLY: exposed so we can unit-test the SQL translator without standing up a real PG. Do not use in production code. */
export const __translateSqlForTest = translateSql;

/** Test-only / shutdown helper. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__subastasPgPool) {
    await globalForDb.__subastasPgPool.end();
    globalForDb.__subastasPgPool = undefined;
  }
}

/**
 * Back-compat shim: the legacy module exported a `db` object with `.prepare`,
 * `.pragma`, etc. Only `alerts-schema.ts` used these directly, and that module
 * is being deleted in this same wave. We expose a deliberately-broken proxy so
 * any forgotten caller fails loudly with a meaningful error instead of silently
 * doing nothing.
 */
export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      throw new Error(
        `[db] Direct better-sqlite3 access (db.${String(prop)}) is no longer supported. ` +
          'Use query / queryOne / execute (raw SQL) or @/lib/prisma (Prisma Client) instead.'
      );
    },
  }
) as never;
