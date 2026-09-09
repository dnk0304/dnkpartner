/**
 * Clip Library read API (CP2).
 *
 * Serves the `studio_library_clip` catalogue (CP1 substrate) plus the 480p
 * preview bytes that live on the persistent bind mount. Read-only: nothing
 * here writes to Postgres or to the volume.
 *
 * Routes (mounted at `/api/library`, and additionally at `/studio/api/library`
 * — see the mount note in index.ts):
 *   GET /clips             → filtered + sorted + paginated catalogue
 *   GET /facets            → facet counts for the sidebar (drill-down aware)
 *   GET /clips/:id/preview → Range-capable mp4 stream
 *   GET /clips/:id/poster.jpg → pre-generated still frame (CP2c)
 *   GET /health            → {count, files, posters, dir} for the post-deploy check
 *
 * PREVIEW / POSTER DIRECTORIES — read `CLIP_PREVIEWS_DIR` and
 * `CLIP_POSTERS_DIR` (set to /app/data/clip-previews and /app/data/clip-posters
 * in the container). Do NOT derive either from STUDIO_DATA_DIR: that variable is
 * /app/data/sitebuilder, a per-feature directory, so
 * path.join(STUDIO_DATA_DIR, 'clip-previews') resolves to
 * /app/data/sitebuilder/clip-previews and misses the mount entirely.
 * (CLIP_LIBRARY_STORAGE.md and the studioMigrations.ts comment said otherwise;
 * both are corrected in this commit.)
 *
 * Not tenant-scoped: the library is shared house content, matching the CP1 DDL.
 */
import { Router, Request, Response } from 'express';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getPool, hasDatabaseUrl } from './db/pool.js';

export const clipLibraryRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Preview directory
// ─────────────────────────────────────────────────────────────────────────────
export function clipPreviewsDir(): string {
  const fromEnv = process.env.CLIP_PREVIEWS_DIR;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim());
  // Local dev fallback — mirrors the container layout under the repo.
  return path.resolve(process.cwd(), 'data', 'clip-previews');
}

/**
 * Poster directory — its OWN env var, for the same reason as the previews dir:
 * deriving it from STUDIO_DATA_DIR would resolve to
 * /app/data/sitebuilder/clip-posters and miss the bind mount.
 */
export function clipPostersDir(): string {
  const fromEnv = process.env.CLIP_POSTERS_DIR;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim());
  return path.resolve(process.cwd(), 'data', 'clip-posters');
}

// Clip ids are corpus-generated: "<youtube_id>_r001". Anything outside this
// alphabet is rejected before it can reach the filesystem.
const CLIP_ID_RE = /^[A-Za-z0-9_-]+$/;

// ─────────────────────────────────────────────────────────────────────────────
// Query parsing — every value is coerced here and only ever reaches SQL as a
// bound parameter. No user input is interpolated into a statement.
// ─────────────────────────────────────────────────────────────────────────────

/** Express gives `string | string[] | undefined` (or ParsedQs) — normalise to string[]. */
function toStringArray(raw: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== 'string') return;
    // Accept both repeated params (?tag=a&tag=b) and comma lists (?tag=a,b).
    for (const part of v.split(',')) {
      const t = part.trim();
      if (t) out.push(t);
    }
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else push(raw);
  return out;
}

function toNumber(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function toInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = toNumber(raw);
  if (n === undefined) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

const QUALITIES = new Set(['killer', 'good', 'usable', 'skip']);

/** Whitelisted sort keys — the ORDER BY fragment is never built from user text. */
const SORTS: Record<string, string> = {
  laugh_desc: 'laugh_score DESC NULLS LAST, id ASC',
  duration_asc: 'duration ASC, id ASC',
  duration_desc: 'duration DESC, id ASC',
  newest: 'created_at DESC, id ASC',
};
const DEFAULT_SORT = 'laugh_desc';

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

/** Which facet dimensions a filter can constrain — used for drill-down. */
type FacetKey = 'comedian' | 'tag' | 'quality' | 'laugh' | 'duration';

interface Filters {
  comedian: string[];
  tag: string[];
  quality: string[];
  laughMin?: number;
  durMin?: number;
  durMax?: number;
  q?: string;
}

function parseFilters(query: Record<string, unknown>): Filters {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  return {
    comedian: toStringArray(query.comedian),
    tag: toStringArray(query.tag),
    // Ignore unknown quality values rather than 400 — an unknown value simply
    // matches nothing, and silently dropping it keeps stale bookmarks working.
    quality: toStringArray(query.quality).filter((v) => QUALITIES.has(v)),
    laughMin: toNumber(query.laugh_min),
    durMin: toNumber(query.dur_min),
    durMax: toNumber(query.dur_max),
    q: q || undefined,
  };
}

/**
 * Build a parameterised WHERE clause.
 *
 * `exclude` drops one dimension so a facet can count its own options against
 * the OTHER active filters — otherwise selecting "comedian = X" would collapse
 * the comedian facet to a single row and multi-select would be undiscoverable.
 *
 * Multi-value dimensions are OR within a facet (standard faceted search) and
 * AND across facets.
 */
function buildWhere(
  f: Filters,
  exclude?: FacetKey
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const bind = (v: unknown) => `$${params.push(v)}`;

  if (exclude !== 'comedian' && f.comedian.length) {
    clauses.push(`comedian = ANY(${bind(f.comedian)}::text[])`);
  }
  if (exclude !== 'quality' && f.quality.length) {
    clauses.push(`quality = ANY(${bind(f.quality)}::text[])`);
  }
  if (exclude !== 'tag' && f.tag.length) {
    // Overlap: match a clip carrying ANY of the selected tags. Uses the GIN index.
    clauses.push(`tags && ${bind(f.tag)}::text[]`);
  }
  if (exclude !== 'laugh' && f.laughMin !== undefined) {
    clauses.push(`laugh_score >= ${bind(f.laughMin)}`);
  }
  if (exclude !== 'duration' && f.durMin !== undefined) {
    clauses.push(`duration >= ${bind(f.durMin)}`);
  }
  if (exclude !== 'duration' && f.durMax !== undefined) {
    clauses.push(`duration <= ${bind(f.durMax)}`);
  }
  if (f.q) {
    // Free-text across the clip id and its tags. `%` / `_` in the needle are
    // escaped so a user's literal wildcard can't widen the match.
    const needle = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const p = bind(needle);
    clauses.push(`(id ILIKE ${p} ESCAPE '\\' OR array_to_string(tags, ' ') ILIKE ${p} ESCAPE '\\')`);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

// DB-backed routes 503 without a connection string, matching videoProjects.ts.
// /health and /clips/:id/preview deliberately stay outside this guard: the
// preview bytes and the file census are useful even with no database.
function requireDb(_req: Request, res: Response, next: () => void) {
  if (!hasDatabaseUrl()) {
    return res.status(503).json({
      error: 'Clip library unavailable: DATABASE_URL is not configured.',
    });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /clips
// ─────────────────────────────────────────────────────────────────────────────
clipLibraryRouter.get('/clips', requireDb, async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, unknown>;
    const filters = parseFilters(query);
    const { sql: where, params } = buildWhere(filters);

    const sortKey = typeof query.sort === 'string' && query.sort in SORTS
      ? query.sort
      : DEFAULT_SORT;
    const orderBy = SORTS[sortKey];

    const limit = toInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const page = toInt(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const offset = (page - 1) * limit;

    const pool = getPool();

    const countSql = `SELECT count(*)::int AS total FROM studio_library_clip ${where}`;
    const itemsSql = `
      SELECT id, comedian, tags, laugh_score, quality, duration,
             source_file, t_in, t_out, preview_path, created_at
      FROM studio_library_clip
      ${where}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countRes, itemsRes] = await Promise.all([
      pool.query(countSql, params),
      pool.query(itemsSql, [...params, limit, offset]),
    ]);

    res.json({
      items: itemsRes.rows,
      total: countRes.rows[0]?.total ?? 0,
      page,
      limit,
      sort: sortKey,
    });
  } catch (err) {
    console.error('[ClipLibrary] /clips error:', err);
    res.status(500).json({ error: 'Failed to list clips' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /facets
// ─────────────────────────────────────────────────────────────────────────────
const DURATION_BUCKETS = `
  CASE
    WHEN duration < 10 THEN '0-10'
    WHEN duration < 20 THEN '10-20'
    WHEN duration < 40 THEN '20-40'
    ELSE '40+'
  END`;

clipLibraryRouter.get('/facets', requireDb, async (req: Request, res: Response) => {
  try {
    const filters = parseFilters(req.query as Record<string, unknown>);
    const pool = getPool();

    // Each facet counts against the other active filters (drill-down), so the
    // sidebar keeps showing the alternatives you could still add.
    const forFacet = (k: FacetKey) => buildWhere(filters, k);
    const cComedian = forFacet('comedian');
    const cQuality = forFacet('quality');
    const cLaugh = forFacet('laugh');
    const cTag = forFacet('tag');
    const cDuration = forFacet('duration');
    const cTotal = buildWhere(filters);

    const [comedians, qualities, laughs, tags, durations, total] = await Promise.all([
      pool.query(
        `SELECT comedian AS value, count(*)::int AS count
         FROM studio_library_clip ${cComedian.sql}
         GROUP BY comedian ORDER BY count DESC, value ASC`,
        cComedian.params
      ),
      pool.query(
        `SELECT quality AS value, count(*)::int AS count
         FROM studio_library_clip ${cQuality.sql}
         GROUP BY quality ORDER BY count DESC, value ASC`,
        cQuality.params
      ),
      pool.query(
        `SELECT laugh_score AS value, count(*)::int AS count
         FROM studio_library_clip ${cLaugh.sql}
         GROUP BY laugh_score ORDER BY value DESC NULLS LAST`,
        cLaugh.params
      ),
      pool.query(
        `SELECT tag AS value, count(*)::int AS count
         FROM studio_library_clip, unnest(tags) AS tag
         ${cTag.sql}
         GROUP BY tag ORDER BY count DESC, value ASC LIMIT 100`,
        cTag.params
      ),
      pool.query(
        `SELECT ${DURATION_BUCKETS} AS value, count(*)::int AS count
         FROM studio_library_clip ${cDuration.sql}
         GROUP BY 1
         ORDER BY min(duration)`,
        cDuration.params
      ),
      pool.query(
        `SELECT count(*)::int AS total FROM studio_library_clip ${cTotal.sql}`,
        cTotal.params
      ),
    ]);

    res.json({
      comedian: comedians.rows,
      quality: qualities.rows,
      laugh_score: laughs.rows,
      tag: tags.rows,
      duration: durations.rows,
      total: total.rows[0]?.total ?? 0,
    });
  } catch (err) {
    console.error('[ClipLibrary] /facets error:', err);
    res.status(500).json({ error: 'Failed to build facets' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /clips/:id/preview — Range-capable mp4 stream
// ─────────────────────────────────────────────────────────────────────────────
clipLibraryRouter.get('/clips/:id/preview', (req: Request, res: Response) => {
  // Express 5 types req.params loosely; validate before anything else.
  const rawId = req.params.id;
  if (typeof rawId !== 'string' || !CLIP_ID_RE.test(rawId)) {
    return res.status(400).json({ error: 'Invalid clip id' });
  }
  // Redundant given the regex (no '/', '\' or '.' can pass) but kept as a
  // second, independent barrier against path traversal.
  const safe = path.basename(rawId);
  if (safe !== rawId) {
    return res.status(400).json({ error: 'Invalid clip id' });
  }

  const dir = clipPreviewsDir();
  const file = path.join(dir, `${safe}.mp4`);

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      return res.status(404).json({ error: 'Preview not found' });
    }

    const size = stat.size;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    // Private: previews sit behind the dnkpartner auth gate, so they must not
    // be cached by any shared proxy on the way back to the browser.
    res.setHeader('Cache-Control', 'private, max-age=86400');

    const range = req.headers.range;
    let start = 0;
    let end = size - 1;
    let status = 200;

    if (typeof range === 'string') {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!m || (m[1] === '' && m[2] === '')) {
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.status(416).json({ error: 'Malformed Range header' });
      }
      if (m[1] === '') {
        // Suffix range: last N bytes.
        const suffix = Number(m[2]);
        if (suffix <= 0) {
          res.setHeader('Content-Range', `bytes */${size}`);
          return res.status(416).json({ error: 'Unsatisfiable Range' });
        }
        start = Math.max(0, size - suffix);
      } else {
        start = Number(m[1]);
        if (m[2] !== '') end = Math.min(Number(m[2]), size - 1);
      }
      if (start > end || start >= size) {
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.status(416).json({ error: 'Unsatisfiable Range' });
      }
      status = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }

    res.setHeader('Content-Length', String(end - start + 1));
    res.status(status);

    if (req.method === 'HEAD') return res.end();

    // Stream — never readFileSync; a single 480p preview is a few MB but the
    // corpus is ~5 GiB and a grid can open dozens of these at once.
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', (streamErr) => {
      console.error('[ClipLibrary] preview stream error:', streamErr);
      if (!res.headersSent) res.status(500).json({ error: 'Preview read failed' });
      else res.destroy();
    });
    // Client navigated away / seeked — stop reading.
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /clips/:id/poster.jpg — pre-generated still frame (CP2c)
//
// The grid paints one of these per tile instead of mounting a <video>, so this
// is the hottest route in the library. The bytes are produced ahead of time by
// tools/generate_clip_posters.py; the lazy path below exists only to self-heal
// a single missing file, never as the primary source.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * On-the-fly poster generation. This is a FALLBACK — in production every
 * poster is pre-generated. ffmpeg is not guaranteed to exist in the app
 * container, so every failure mode here must surface as a 404, never a 500.
 */
function generatePosterOnce(mp4: string, dest: string): Promise<void> {
  const tmp = `${dest}.${process.pid}.tmp`;
  return new Promise((resolve, reject) => {
    execFile(
      process.env.FFMPEG_BIN || 'ffmpeg',
      [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-ss', '1.0',
        '-i', mp4,
        '-frames:v', '1',
        '-vf', 'scale=480:-2',
        '-q:v', '4',
        '-f', 'image2', '-y', tmp,
      ],
      { timeout: 20_000 },
      (err) => {
        if (err) {
          fs.promises.unlink(tmp).catch(() => {});
          return reject(err);
        }
        fs.promises
          .stat(tmp)
          .then((st) => {
            if (st.size === 0) throw new Error('empty poster');
            return fs.promises.rename(tmp, dest);
          })
          .then(resolve)
          .catch((e) => {
            fs.promises.unlink(tmp).catch(() => {});
            reject(e);
          });
      }
    );
  });
}

// Coalesce a burst of requests for the same missing poster into one ffmpeg run.
const posterInFlight = new Map<string, Promise<void>>();

clipLibraryRouter.get('/clips/:id/poster.jpg', async (req: Request, res: Response) => {
  const rawId = req.params.id;
  if (typeof rawId !== 'string' || !CLIP_ID_RE.test(rawId)) {
    return res.status(400).json({ error: 'Invalid clip id' });
  }
  const safe = path.basename(rawId);
  if (safe !== rawId) {
    return res.status(400).json({ error: 'Invalid clip id' });
  }

  const file = path.join(clipPostersDir(), `${safe}.jpg`);

  const send = (size: number) => {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(size));
    // Posters are immutable per clip and sit behind the dnkpartner auth gate:
    // private (no shared proxy) but cacheable in the browser for a week.
    res.setHeader('Cache-Control', 'private, max-age=604800');
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', (streamErr) => {
      console.error('[ClipLibrary] poster stream error:', streamErr);
      if (!res.headersSent) res.status(500).json({ error: 'Poster read failed' });
      else res.destroy();
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  };

  try {
    const stat = await fs.promises.stat(file);
    if (stat.isFile() && stat.size > 0) return send(stat.size);
  } catch {
    // Fall through to the self-heal path.
  }

  // Self-heal: only if the source mp4 actually exists.
  const mp4 = path.join(clipPreviewsDir(), `${safe}.mp4`);
  try {
    const src = await fs.promises.stat(mp4);
    if (!src.isFile()) return res.status(404).json({ error: 'Poster not found' });
  } catch {
    return res.status(404).json({ error: 'Poster not found' });
  }

  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    let job = posterInFlight.get(safe);
    if (!job) {
      job = generatePosterOnce(mp4, file).finally(() => posterInFlight.delete(safe));
      posterInFlight.set(safe, job);
    }
    await job;
    const stat = await fs.promises.stat(file);
    return send(stat.size);
  } catch (err) {
    // Missing ffmpeg, read-only mount, decode failure — all are a missing
    // poster from the client's point of view. Never 500 the tile grid.
    console.warn(
      '[ClipLibrary] poster self-heal failed for %s: %s',
      safe,
      err instanceof Error ? err.message : String(err)
    );
    return res.status(404).json({ error: 'Poster not found' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health — Ken's post-deploy check: rows vs files on the mount.
// ─────────────────────────────────────────────────────────────────────────────
clipLibraryRouter.get('/health', async (_req: Request, res: Response) => {
  const dir = clipPreviewsDir();
  const postersDir = clipPostersDir();

  let files: number | null = null;
  let dirError: string | undefined;
  try {
    const entries = await fs.promises.readdir(dir);
    files = entries.filter((f) => f.endsWith('.mp4')).length;
  } catch (err) {
    dirError = err instanceof Error ? err.message : String(err);
  }

  // Posters are a separate mount and can legitimately lag the previews (the
  // generator runs out of band), so a missing/empty poster dir must not flip
  // `ok` — Ken asserts `posters === files` explicitly instead.
  let posters: number | null = null;
  let postersDirError: string | undefined;
  try {
    const entries = await fs.promises.readdir(postersDir);
    posters = entries.filter((f) => f.endsWith('.jpg')).length;
  } catch (err) {
    postersDirError = err instanceof Error ? err.message : String(err);
  }

  let count: number | null = null;
  let dbError: string | undefined;
  if (hasDatabaseUrl()) {
    try {
      const { rows } = await getPool().query(
        'SELECT count(*)::int AS count FROM studio_library_clip'
      );
      count = rows[0]?.count ?? 0;
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  } else {
    dbError = 'DATABASE_URL is not configured';
  }

  const ok = count !== null && files !== null;
  res.status(ok ? 200 : 503).json({
    count, files, posters, dir, postersDir, ok, dirError, postersDirError, dbError,
  });
});
