/**
 * Studio Postgres connection pool.
 *
 * Shares dnkpartner's Postgres via DATABASE_URL. Studio-owned tables are
 * namespaced `studio_*` to avoid collision with dnkpartner's auth schema.
 *
 * Lazy: the pool is only created when first requested, so the server still
 * boots in environments without DATABASE_URL (the site-builder routes will
 * 503 in that case, everything else keeps working).
 */
import pg from 'pg';

const { Pool } = pg;
type Pool = pg.Pool;

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      '[studio/db] DATABASE_URL is not set. Site builder persistence requires a Postgres connection string.'
    );
  }
  _pool = new Pool({
    connectionString: url,
    // dnkpartner runs managed Postgres; allow SSL but don't force cert verification
    // (Coolify-managed PG typically uses self-signed certs on the internal network).
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  _pool.on('error', (err) => {
    console.error('[studio/db] Idle client error:', err);
  });
  return _pool;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
