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
 *   studio_asset  (id, tenant_id -> studio_tenant, mime, byte_size, filename, storage_path, created_at)
 *   studio_video_project (id, tenant_id -> studio_tenant, name, state JSONB, created_at, updated_at)
 *
 * `project_data` holds the GrapesJS `editor.getProjectData()` JSON
 * (components, styles, assets, pages) — the lossless structured model,
 * NOT raw HTML/CSS.
 *
 * Publish pipeline: `studio_page` adds `published_html` / `published_css` /
 * `published_at` so the public render route can serve a frozen snapshot
 * without re-executing the GrapesJS runtime server-side.
 *
 * Assets: actual bytes live on the volume at `STUDIO_DATA_DIR/site-assets/`
 * (filesystem — see siteBuilder.ts). The DB row tracks metadata and ownership.
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

-- Publish snapshot columns (additive; safe on re-run).
ALTER TABLE studio_page ADD COLUMN IF NOT EXISTS published_html TEXT;
ALTER TABLE studio_page ADD COLUMN IF NOT EXISTS published_css  TEXT;
ALTER TABLE studio_page ADD COLUMN IF NOT EXISTS published_at   TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS studio_asset (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES studio_tenant(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,           -- sanitized original filename, for download disposition
  mime          TEXT NOT NULL,
  byte_size     INTEGER NOT NULL,
  storage_path  TEXT NOT NULL,           -- absolute path on the volume
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_asset_tenant_idx ON studio_asset (tenant_id);

CREATE TABLE IF NOT EXISTS studio_video_project (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES studio_tenant(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_video_project_tenant_idx ON studio_video_project (tenant_id);

-- Clip Library (CP1). Read-mostly catalogue of pre-cut comedy clips.
-- Rows are imported from the local yt-nova clips.db export; the 480p preview
-- bytes live on the volume at STUDIO_DATA_DIR/clip-previews/<id>.mp4 and
-- preview_path stores that volume-relative name so a later move to a
-- dedicated host or S3 is a base-URL change only.
-- Not tenant-scoped: the library is shared house content, not tenant data.
CREATE TABLE IF NOT EXISTS studio_library_clip (
  id            TEXT PRIMARY KEY,          -- clip_id, e.g. "4IfRgovQGtk_001"
  comedian      TEXT NOT NULL,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  laugh_score   SMALLINT,                  -- 1..5
  quality       TEXT,                      -- killer|good|usable|skip
  duration      DOUBLE PRECISION NOT NULL, -- seconds, t_out - t_in
  source_file   TEXT NOT NULL,             -- source video id in footage/
  t_in          DOUBLE PRECISION NOT NULL,
  t_out         DOUBLE PRECISION NOT NULL,
  preview_path  TEXT NOT NULL,             -- relative: "clip-previews/<id>.mp4"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (t_out > t_in),
  CHECK (laugh_score IS NULL OR laugh_score BETWEEN 1 AND 5)
);
-- Facet-filter support (CP2: comedian/tag/laugh_score/quality/duration).
CREATE INDEX IF NOT EXISTS studio_library_clip_comedian_idx    ON studio_library_clip (comedian);
CREATE INDEX IF NOT EXISTS studio_library_clip_quality_idx     ON studio_library_clip (quality);
CREATE INDEX IF NOT EXISTS studio_library_clip_laugh_idx       ON studio_library_clip (laugh_score);
CREATE INDEX IF NOT EXISTS studio_library_clip_duration_idx    ON studio_library_clip (duration);
CREATE INDEX IF NOT EXISTS studio_library_clip_tags_gin        ON studio_library_clip USING GIN (tags);
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
