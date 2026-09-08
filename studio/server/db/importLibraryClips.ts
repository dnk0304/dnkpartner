/**
 * Clip Library CP1 — import clip metadata into `studio_library_clip`.
 *
 * Re-runnable: every row is an UPSERT keyed on clip id, so re-running after a
 * fresh yt-nova export syncs new/changed clips without touching anything else.
 * Nothing is deleted unless --prune is passed (removes rows absent from the
 * export — use only when the export is known complete).
 *
 * Input is the JSON produced by yt-nova/tools/export_clips_json.py.
 *
 *   npx tsx server/db/importLibraryClips.ts <library_clips.json> [--prune] [--dry-run]
 *
 * Requires DATABASE_URL. Run it inside the studio container so the DB host
 * resolves (see CLIP_LIBRARY_STORAGE.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getPool, hasDatabaseUrl } from './pool.js';
import { runStudioMigrations } from './studioMigrations.js';

interface ClipRow {
  id: string;
  comedian: string;
  tags: string[];
  laugh_score: number | null;
  quality: string | null;
  duration: number;
  source_file: string;
  t_in: number;
  t_out: number;
  preview_path: string;
}

const UPSERT = `
INSERT INTO studio_library_clip
  (id, comedian, tags, laugh_score, quality, duration, source_file, t_in, t_out, preview_path)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT (id) DO UPDATE SET
  comedian     = EXCLUDED.comedian,
  tags         = EXCLUDED.tags,
  laugh_score  = EXCLUDED.laugh_score,
  quality      = EXCLUDED.quality,
  duration     = EXCLUDED.duration,
  source_file  = EXCLUDED.source_file,
  t_in         = EXCLUDED.t_in,
  t_out        = EXCLUDED.t_out,
  preview_path = EXCLUDED.preview_path,
  updated_at   = now();
`;

function parse(file: string): ClipRow[] {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { clips?: unknown };
  if (!Array.isArray(doc.clips)) {
    throw new Error(`${file}: expected a top-level "clips" array`);
  }
  return doc.clips.map((raw, i) => {
    const c = raw as Partial<ClipRow>;
    if (!c.id || !c.comedian || !c.preview_path) {
      throw new Error(`clips[${i}]: missing id/comedian/preview_path`);
    }
    if (!(Number(c.t_out) > Number(c.t_in))) {
      throw new Error(`clips[${i}] (${c.id}): t_out must exceed t_in`);
    }
    const score = c.laugh_score == null ? null : Number(c.laugh_score);
    if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) {
      throw new Error(`clips[${i}] (${c.id}): laugh_score out of range`);
    }
    return {
      id: String(c.id),
      comedian: String(c.comedian),
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
      laugh_score: score,
      quality: c.quality == null ? null : String(c.quality),
      duration: Number(c.duration),
      source_file: String(c.source_file),
      t_in: Number(c.t_in),
      t_out: Number(c.t_out),
      preview_path: String(c.preview_path),
    };
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prune = args.includes('--prune');
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: importLibraryClips.ts <library_clips.json> [--prune] [--dry-run]');
    process.exit(2);
  }
  if (!hasDatabaseUrl()) {
    console.error('[clip-library] DATABASE_URL is not set.');
    process.exit(2);
  }

  const clips = parse(path.resolve(file));
  console.log(`[clip-library] parsed ${clips.length} clips from ${file}`);
  if (dryRun) {
    console.log('[clip-library] --dry-run: nothing written.');
    return;
  }

  await runStudioMigrations();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const c of clips) {
      await client.query(UPSERT, [
        c.id, c.comedian, c.tags, c.laugh_score, c.quality,
        c.duration, c.source_file, c.t_in, c.t_out, c.preview_path,
      ]);
    }
    let pruned = 0;
    if (prune) {
      const res = await client.query(
        'DELETE FROM studio_library_clip WHERE id <> ALL($1::text[])',
        [clips.map((c) => c.id)]
      );
      pruned = res.rowCount ?? 0;
    }
    const { rows } = await client.query('SELECT count(*)::int AS n FROM studio_library_clip');
    await client.query('COMMIT');
    console.log(
      `[clip-library] upserted=${clips.length} pruned=${pruned} table_total=${rows[0].n}`
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[clip-library] import failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await getPool().end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
