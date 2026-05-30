/**
 * Studio schema bootstrap.
 *
 * Idempotent CREATE TABLE IF NOT EXISTS, run once at server startup.
 * Matches dnkstudio house style (no migration framework — Express + tsx).
 *
 * Tables are namespaced `studio_*` so they coexist safely with dnkpartner's
 * existing tables in the shared Postgres.
 *
 * Schema (minimal multi-tenant shape, P0):
 *   studio_tenant (id, name, created_at)
 *   studio_site   (id, tenant_id -> studio_tenant, name, slug, created_at, updated_at)
 *   studio_page   (id, site_id -> studio_site, name, path, project_data JSONB, updated_at)
 *
 * `project_data` holds the GrapesJS `editor.getProjectData()` JSON
 * (components, styles, assets, pages) — the lossless structured model,
 * NOT raw HTML/CSS.
 */
import { getPool, hasDatabaseUrl } from './pool.js';

export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const DDL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS studio_tenant (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_site (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES studio_tenant(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS studio_site_tenant_idx ON studio_site (tenant_id);

CREATE TABLE IF NOT EXISTS studio_page (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES studio_site(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  path          TEXT NOT NULL,
  project_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, path)
);
CREATE INDEX IF NOT EXISTS studio_page_site_idx ON studio_page (site_id);
`;

const SEED_DEFAULT_TENANT = `
INSERT INTO studio_tenant (id, name)
VALUES ($1, 'default')
ON CONFLICT (id) DO NOTHING;
`;

let _ran = false;

/**
 * Run migrations once. Safe to call multiple times — no-op after first success.
 * Logs and swallows errors if DATABASE_URL is missing, so server still boots.
 */
export async function runStudioMigrations(): Promise<void> {
  if (_ran) return;
  if (!hasDatabaseUrl()) {
    console.warn(
      '[studio/db] DATABASE_URL not set — skipping studio migrations. Site builder persistence will be unavailable.'
    );
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(DDL);
    await client.query(SEED_DEFAULT_TENANT, [DEFAULT_TENANT_ID]);
    await client.query('COMMIT');
    _ran = true;
    console.log('[studio/db] ✅ Studio schema ready (studio_tenant, studio_site, studio_page).');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[studio/db] ❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}
