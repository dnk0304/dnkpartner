/**
 * Site Builder persistence (container-safe, Postgres-backed).
 *
 * Replaces the previous filesystem-backed routes that wrote raw HTML/CSS to
 * hardcoded `C:\Users\D\Desktop` paths — which broke inside the Coolify
 * container deploy at dnkpartner.com/studio/*.
 *
 * Persists the GrapesJS *structured project model* (`editor.getProjectData()`)
 * as JSONB in `studio_page.project_data`. This is lossless across reloads
 * (components, styles, assets, pages — unlike `getHtml()` / `getCss()`,
 * which threw away component metadata on every save).
 *
 * Storage: dnkpartner's existing Postgres, shared via `DATABASE_URL`.
 * Studio-owned tables are namespaced `studio_*`. See `db/studioMigrations.ts`.
 *
 * Routes (mounted at `/api/site-builder`):
 *   GET    /sites                              → list sites (default tenant)
 *   POST   /sites                              → create empty site {name, slug?}
 *   GET    /sites/:siteId/pages                → list pages for a site
 *   POST   /sites/:siteId/pages                → create empty page {name, path}
 *   GET    /sites/:siteId/pages/:pageId        → load { project_data } — GrapesJS storageManager urlLoad
 *   POST   /sites/:siteId/pages/:pageId        → upsert project_data         — GrapesJS storageManager urlStore
 *
 * Auth: relies on the existing dnkpartner `/studio/*` login gate. Single
 * default tenant for now (multi-tenant is the SHAPE, not yet wired per-user).
 *
 * Legacy filesystem routes (`/load`, `/save`, `/export`, `/projects`) are
 * REMOVED — they were the container-breaking bug. The frontend (Pixel)
 * switches to the new endpoints + GrapesJS remote storageManager.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { getPool, hasDatabaseUrl } from './db/pool.js';
import { DEFAULT_TENANT_ID } from './db/studioMigrations.js';

export const siteBuilderRouter = Router();

// UUID v4/v7 sanity check — prevents SQL errors leaking through as 500s.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Slug helper — kebab-case, ascii-only. Stable across saves of the same name.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled';
}

// Fail fast (503) if DATABASE_URL isn't configured — clearer than a 500.
function requireDb(_req: Request, res: Response, next: NextFunction) {
  if (!hasDatabaseUrl()) {
    return res.status(503).json({
      error: 'Site builder persistence unavailable: DATABASE_URL is not configured on the server.',
    });
  }
  next();
}
siteBuilderRouter.use(requireDb);

// ---------- Sites ----------

// GET /sites — list sites for the default tenant.
siteBuilderRouter.get('/sites', async (_req: Request, res: Response) => {
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, slug, created_at, updated_at
       FROM studio_site
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [DEFAULT_TENANT_ID]
    );
    res.json(rows);
  } catch (err) {
    console.error('[SiteBuilder] list sites error:', err);
    res.status(500).json({ error: 'Failed to list sites' });
  }
});

// POST /sites — create an empty site.  Body: { name, slug? }
siteBuilderRouter.post('/sites', async (req: Request, res: Response) => {
  try {
    const { name, slug } = (req.body ?? {}) as { name?: string; slug?: string };
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }
    const finalSlug = slug && typeof slug === 'string' ? slugify(slug) : slugify(name);
    const { rows } = await getPool().query(
      `INSERT INTO studio_site (tenant_id, name, slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, slug) DO UPDATE SET updated_at = now()
       RETURNING id, name, slug, created_at, updated_at`,
      [DEFAULT_TENANT_ID, name.trim(), finalSlug]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[SiteBuilder] create site error:', err);
    res.status(500).json({ error: 'Failed to create site' });
  }
});

// ---------- Pages ----------

// GET /sites/:siteId/pages — list pages for a site.
siteBuilderRouter.get('/sites/:siteId/pages', async (req: Request, res: Response) => {
  const { siteId } = req.params;
  if (!isUuid(siteId)) return res.status(400).json({ error: 'invalid siteId' });
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, path, updated_at
       FROM studio_page
       WHERE site_id = $1
       ORDER BY path ASC`,
      [siteId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[SiteBuilder] list pages error:', err);
    res.status(500).json({ error: 'Failed to list pages' });
  }
});

// POST /sites/:siteId/pages — create an empty page. Body: { name, path }
siteBuilderRouter.post('/sites/:siteId/pages', async (req: Request, res: Response) => {
  const { siteId } = req.params;
  if (!isUuid(siteId)) return res.status(400).json({ error: 'invalid siteId' });
  const { name, path: pagePath } = (req.body ?? {}) as { name?: string; path?: string };
  if (!name || !pagePath) {
    return res.status(400).json({ error: 'name and path are required' });
  }
  try {
    const { rows } = await getPool().query(
      `INSERT INTO studio_page (site_id, name, path, project_data)
       VALUES ($1, $2, $3, '{}'::jsonb)
       ON CONFLICT (site_id, path) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
       RETURNING id, name, path, updated_at`,
      [siteId, name, pagePath]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err?.code === '23503') {
      // FK violation — site doesn't exist.
      return res.status(404).json({ error: 'site not found' });
    }
    console.error('[SiteBuilder] create page error:', err);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

// GET /sites/:siteId/pages/:pageId — load page's GrapesJS project data.
// This is the URL GrapesJS storageManager `urlLoad` hits.
//
// GrapesJS expects the response body to be the project data JSON directly
// (it stores whatever it gets back). We return `project_data` as the raw
// body so storageManager round-trips cleanly.
siteBuilderRouter.get('/sites/:siteId/pages/:pageId', async (req: Request, res: Response) => {
  const { siteId, pageId } = req.params;
  if (!isUuid(siteId) || !isUuid(pageId)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  try {
    const { rows } = await getPool().query(
      `SELECT project_data
       FROM studio_page
       WHERE id = $1 AND site_id = $2`,
      [pageId, siteId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'page not found' });
    }
    res.json(rows[0].project_data);
  } catch (err) {
    console.error('[SiteBuilder] load page error:', err);
    res.status(500).json({ error: 'Failed to load page' });
  }
});

// POST /sites/:siteId/pages/:pageId — upsert page's GrapesJS project data.
// This is the URL GrapesJS storageManager `urlStore` hits.
//
// storageManager POSTs the project data JSON as the request body. We store
// the entire body verbatim into `project_data` JSONB. No HTML parsing, no
// CSS extraction, no lossy round-trip.
siteBuilderRouter.post('/sites/:siteId/pages/:pageId', async (req: Request, res: Response) => {
  const { siteId, pageId } = req.params;
  if (!isUuid(siteId) || !isUuid(pageId)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const projectData = req.body;
  if (projectData == null || typeof projectData !== 'object') {
    return res.status(400).json({ error: 'request body must be the GrapesJS project data JSON object' });
  }
  try {
    const { rowCount } = await getPool().query(
      `UPDATE studio_page
       SET project_data = $1::jsonb,
           updated_at = now()
       WHERE id = $2 AND site_id = $3`,
      [JSON.stringify(projectData), pageId, siteId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'page not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[SiteBuilder] save page error:', err);
    res.status(500).json({ error: 'Failed to save page' });
  }
});
