/**
 * Video editor project persistence (autosave).
 *
 * Replaces the previous "download JSON / upload JSON" round-trip that the
 * VideoEditor used for save/load. Projects live in `studio_video_project`
 * (see db/studioMigrations.ts).
 *
 * Routes (mounted at `/api/video-projects`):
 *   GET    /                → list projects (default tenant), newest first
 *   POST   /                → create empty project {name}
 *   GET    /:id             → load { id, name, state, updated_at }
 *   PUT    /:id             → upsert state (debounced autosave from client)
 *   DELETE /:id             → delete project
 *
 * Tenancy: scoped to DEFAULT_TENANT_ID for now (multi-tenant is the SHAPE,
 * matches site-builder).
 */
import { Router, Request, Response } from 'express';
import { getPool, hasDatabaseUrl } from './db/pool.js';
import { DEFAULT_TENANT_ID } from './db/studioMigrations.js';

export const videoProjectsRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);

videoProjectsRouter.use((_req, res, next) => {
  if (!hasDatabaseUrl()) {
    return res.status(503).json({
      error: 'Video project persistence unavailable: DATABASE_URL is not configured.',
    });
  }
  next();
});

// GET / — list projects for current tenant.
videoProjectsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, updated_at
       FROM studio_video_project
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [DEFAULT_TENANT_ID]
    );
    res.json(rows);
  } catch (err) {
    console.error('[VideoProjects] list error:', err);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// POST / — create empty project. Body: { name, state? }
videoProjectsRouter.post('/', async (req: Request, res: Response) => {
  const { name, state } = (req.body ?? {}) as { name?: string; state?: unknown };
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (state != null && typeof state !== 'object') {
    return res.status(400).json({ error: 'state must be an object' });
  }
  try {
    const { rows } = await getPool().query(
      `INSERT INTO studio_video_project (tenant_id, name, state)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, name, state, updated_at`,
      [DEFAULT_TENANT_ID, name.trim(), JSON.stringify(state ?? {})]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[VideoProjects] create error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET /:id — load full project.
videoProjectsRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, state, updated_at
       FROM studio_video_project
       WHERE id = $1 AND tenant_id = $2`,
      [id, DEFAULT_TENANT_ID]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'project not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[VideoProjects] load error:', err);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

// PUT /:id — debounced autosave. Body: { state, name? }
videoProjectsRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'invalid id' });
  const { state, name } = (req.body ?? {}) as { state?: unknown; name?: string };
  if (state == null || typeof state !== 'object') {
    return res.status(400).json({ error: 'state (object) is required' });
  }
  try {
    const { rows, rowCount } = await getPool().query(
      `UPDATE studio_video_project
       SET state = $1::jsonb,
           name = COALESCE($2, name),
           updated_at = now()
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, name, updated_at`,
      [JSON.stringify(state), name && typeof name === 'string' ? name.trim() : null, id, DEFAULT_TENANT_ID]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'project not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[VideoProjects] save error:', err);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// DELETE /:id
videoProjectsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rowCount } = await getPool().query(
      `DELETE FROM studio_video_project WHERE id = $1 AND tenant_id = $2`,
      [id, DEFAULT_TENANT_ID]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'project not found' });
    res.status(204).end();
  } catch (err) {
    console.error('[VideoProjects] delete error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});
