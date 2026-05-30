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
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getPool, hasDatabaseUrl } from './db/pool.js';
import { DEFAULT_TENANT_ID } from './db/studioMigrations.js';

export const siteBuilderRouter = Router();

// ──────────────────────────────────────────────────────────────────────────
// Asset storage — filesystem-backed under a volume. In the dnkpartner
// Coolify deploy STUDIO_DATA_DIR is mounted to a persistent volume so
// uploads survive container restarts. Falls back to `./data` for dev.
// Per-tenant subdirs avoid cross-tenant blob collisions.
// ──────────────────────────────────────────────────────────────────────────
const STUDIO_DATA_DIR =
  process.env.STUDIO_DATA_DIR || path.resolve(process.cwd(), 'data');
const ASSETS_ROOT = path.join(STUDIO_DATA_DIR, 'site-assets');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const MAX_ASSET_BYTES = 10 * 1024 * 1024; // 10 MB

function extFromMime(m: string): string {
  switch (m) {
    case 'image/jpeg': return '.jpg';
    case 'image/png':  return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif':  return '.gif';
    case 'image/svg+xml': return '.svg';
    default: return '';
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ASSET_BYTES, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`unsupported mime: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

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

// ---------- Assets (image uploads for GrapesJS Asset Manager) ----------

// POST /assets/upload — multipart image upload. GrapesJS sends one or more
// files under the `files` field (configured client-side via assetManager
// uploadName: 'files'). We persist each to disk, insert a metadata row, and
// return the GrapesJS-expected shape: { data: [{ src, name, type }] }.
//
// Storage layout: STUDIO_DATA_DIR/site-assets/<tenant_id>/<asset_id><ext>.
// Public URL: /api/site-builder/assets/<asset_id> (no extension needed —
// content-type comes from the DB row; we set the right header on serve).
siteBuilderRouter.post(
  '/assets/upload',
  upload.array('files', 20),
  async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'no files uploaded (field name must be "files")' });
    }
    const tenantId = DEFAULT_TENANT_ID;
    const tenantDir = path.join(ASSETS_ROOT, tenantId);
    try {
      await fs.promises.mkdir(tenantDir, { recursive: true });
    } catch (err) {
      console.error('[SiteBuilder] mkdir failed:', err);
      return res.status(500).json({ error: 'storage unavailable' });
    }

    const pool = getPool();
    const data: Array<{ src: string; name: string; type: string }> = [];

    for (const file of files) {
      const id = crypto.randomUUID();
      const ext = extFromMime(file.mimetype);
      const safeName = (file.originalname || 'upload').replace(/[^\w.\-]+/g, '_').slice(0, 120);
      const storagePath = path.join(tenantDir, `${id}${ext}`);
      try {
        await fs.promises.writeFile(storagePath, file.buffer);
        await pool.query(
          `INSERT INTO studio_asset (id, tenant_id, filename, mime, byte_size, storage_path)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, tenantId, safeName, file.mimetype, file.size, storagePath]
        );
        // src is the API path — works in dev (vite proxy → :3001) and prod
        // (main.tsx fetch shim prepends /studio, and the public asset GET below
        // is registered under /api/site-builder so it's served by the studio
        // container in both environments).
        data.push({
          src: `/api/site-builder/assets/${id}`,
          name: safeName,
          type: 'image',
        });
      } catch (err) {
        console.error('[SiteBuilder] asset write failed:', err);
        // Best-effort cleanup so we don't leak bytes for failed rows.
        await fs.promises.unlink(storagePath).catch(() => {});
        return res.status(500).json({ error: 'failed to store asset' });
      }
    }

    res.status(201).json({ data });
  }
);

// Multer error surface — turns the file-too-large / wrong-mime throws into
// clean JSON 4xx instead of the default Express error page.
siteBuilderRouter.use(
  (err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `upload rejected: ${err.code}` });
    }
    if (err && typeof err.message === 'string' && err.message.startsWith('unsupported mime')) {
      return res.status(415).json({ error: err.message });
    }
    next(err);
  }
);

// GET /assets/:assetId — stream the stored asset bytes with its original
// mime type. No tenant scoping in the URL (the asset id is a UUID + the
// row carries the owner) — the editor needs stable URLs that survive
// embeds inside saved page HTML.
siteBuilderRouter.get('/assets/:assetId', async (req: Request, res: Response) => {
  const { assetId } = req.params;
  if (!isUuid(assetId)) return res.status(400).json({ error: 'invalid assetId' });
  try {
    const { rows } = await getPool().query(
      `SELECT mime, filename, storage_path
       FROM studio_asset
       WHERE id = $1`,
      [assetId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'asset not found' });
    const { mime, filename, storage_path } = rows[0] as {
      mime: string; filename: string; storage_path: string;
    };
    if (!fs.existsSync(storage_path)) {
      console.error('[SiteBuilder] asset row exists but file missing:', storage_path);
      return res.status(410).json({ error: 'asset bytes gone' });
    }
    res.set('Content-Type', mime);
    // Long cache — asset bytes are immutable per-id.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(storage_path).pipe(res);
  } catch (err) {
    console.error('[SiteBuilder] asset serve error:', err);
    res.status(500).json({ error: 'Failed to serve asset' });
  }
});

// ---------- Publish ----------

// POST /sites/:siteId/publish — freeze the site's homepage (or a chosen page)
// into an HTML/CSS snapshot rendered by the GrapesJS runtime client-side, and
// expose it at a public route.
//
// We accept a body of { pageId?, html, css, title? }: the client (which has
// the live GrapesJS instance) renders HTML/CSS and POSTs them. Server stores
// the snapshot on the studio_page row. If `pageId` is omitted we publish the
// site's first page (lowest path lexicographically).
//
// Public render route: GET /api/site-builder/public/:siteSlug[:pagePath...].
// In production this resolves to dnkpartner.com/studio/api/site-builder/public/<slug>
// (the next.config.ts /studio/* rewrite forwards it to this container). For a
// cleaner URL Ken can layer a Next.js rewrite later; this is the canonical
// served path for now.
siteBuilderRouter.post('/sites/:siteId/publish', async (req: Request, res: Response) => {
  const { siteId } = req.params;
  if (!isUuid(siteId)) return res.status(400).json({ error: 'invalid siteId' });
  const { pageId, html, css } = (req.body ?? {}) as {
    pageId?: string; html?: string; css?: string;
  };
  if (typeof html !== 'string' || html.length === 0) {
    return res.status(400).json({ error: 'html is required' });
  }
  if (css != null && typeof css !== 'string') {
    return res.status(400).json({ error: 'css must be a string' });
  }
  if (pageId != null && !isUuid(pageId)) {
    return res.status(400).json({ error: 'invalid pageId' });
  }

  const pool = getPool();
  try {
    // Confirm site ownership scope (tenant) — defense against publishing
    // through someone else's siteId once multi-tenant lands.
    const siteRow = await pool.query(
      `SELECT id, slug FROM studio_site WHERE id = $1 AND tenant_id = $2`,
      [siteId, DEFAULT_TENANT_ID]
    );
    if (siteRow.rowCount === 0) return res.status(404).json({ error: 'site not found' });
    const { slug: siteSlug } = siteRow.rows[0] as { slug: string };

    // Resolve which page to publish.
    let targetPageId = pageId;
    if (!targetPageId) {
      const firstPage = await pool.query(
        `SELECT id FROM studio_page WHERE site_id = $1 ORDER BY path ASC LIMIT 1`,
        [siteId]
      );
      if (firstPage.rowCount === 0) return res.status(404).json({ error: 'no pages to publish' });
      targetPageId = firstPage.rows[0].id as string;
    }

    const update = await pool.query(
      `UPDATE studio_page
       SET published_html = $1,
           published_css  = $2,
           published_at   = now(),
           updated_at     = now()
       WHERE id = $3 AND site_id = $4
       RETURNING path, published_at`,
      [html, css ?? '', targetPageId, siteId]
    );
    if (update.rowCount === 0) return res.status(404).json({ error: 'page not found' });

    const { path: pagePath, published_at } = update.rows[0] as {
      path: string; published_at: Date;
    };
    // Public URL — same-origin under /studio in prod, root in dev.
    const publicPath = `/api/site-builder/public/${siteSlug}${pagePath === '/' ? '' : pagePath}`;
    res.json({
      success: true,
      publishedAt: published_at,
      publicPath,
    });
  } catch (err) {
    console.error('[SiteBuilder] publish error:', err);
    res.status(500).json({ error: 'Failed to publish' });
  }
});

// GET /public/:siteSlug{/*rest}  — serve the published HTML+CSS snapshot as
// a stand-alone page (no editor chrome). Path after the slug maps to the
// page's `path` column (default '/' for site root).
//
// Express 5 syntax: `{/*rest}` = optional wildcard segment, populated as a
// string[] of path segments (or undefined when empty).
siteBuilderRouter.get(
  '/public/:siteSlug{/*rest}',
  async (req: Request, res: Response) => {
    const siteSlug = req.params.siteSlug as string;
    const restParam = (req.params as Record<string, unknown>).rest;
    const restSegments = Array.isArray(restParam)
      ? (restParam as string[])
      : typeof restParam === 'string' && restParam.length > 0
        ? [restParam]
        : [];
    const pagePath = restSegments.length > 0 ? `/${restSegments.join('/')}` : '/';

    try {
      const { rows } = await getPool().query(
        `SELECT p.published_html, p.published_css, s.name AS site_name
         FROM studio_page p
         JOIN studio_site s ON s.id = p.site_id
         WHERE s.tenant_id = $1
           AND s.slug = $2
           AND p.path = $3
           AND p.published_at IS NOT NULL`,
        [DEFAULT_TENANT_ID, siteSlug, pagePath]
      );
      if (rows.length === 0) {
        res.status(404).type('text/html').send(
          '<!doctype html><meta charset="utf-8"><title>Not published</title>' +
          '<body style="font:14px system-ui;padding:40px;color:#444">' +
          '<h1>Page not published yet</h1>' +
          '<p>Open the editor and hit <b>Publish</b>.</p></body>'
        );
        return;
      }
      const { published_html, published_css, site_name } = rows[0] as {
        published_html: string; published_css: string; site_name: string;
      };
      const safeTitle = String(site_name).replace(/</g, '&lt;');
      // Same minimal doc shape the client-side preview already uses, so
      // published output matches what the owner sees when they hit Preview.
      const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${safeTitle}</title>
<style>${published_css || ''}</style>
</head>
<body>${published_html}</body>
</html>`;
      res.set('Cache-Control', 'public, max-age=60');
      res.type('text/html').send(doc);
    } catch (err) {
      console.error('[SiteBuilder] public render error:', err);
      res.status(500).type('text/plain').send('Render error');
    }
  }
);
