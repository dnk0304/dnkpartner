/**
 * Expert-prompt loader + verdict parser for the Product Factory.
 *
 * The 24 expert system prompts are VENDORED assets at lib/factory/experts/
 * stage-N/<slug>.md — a synced copy of the source-of-truth role files in the
 * dnk-product-factory repo. They are loaded from disk at runtime (NOT inlined)
 * so they stay editable; re-sync on prompt changes.
 *
 * Path resolution: resolve from this module's own location, not process.cwd().
 * Next.js standalone output keeps server modules under .next/server/... and the
 * cwd is the app root, so a cwd-relative path breaks in prod. Resolving from
 * import.meta.url-derived __dirname is the robust choice (see agent-memory
 * patterns_oneoff_db_scripts — "resolve by SCRIPT location not cwd").
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { VerdictValue } from './types';

/**
 * Resolve the vendored experts directory. The dnkpartner app deploys via
 * `next start` from the repo root, so process.cwd() is the app root and
 * lib/factory/experts ships with the source tree — this is the primary path.
 * next.config.ts also adds outputFileTracingIncludes for this dir so the
 * prompts survive a standalone build if that mode is ever enabled.
 */
const CWD_DIR = join(process.cwd(), 'lib', 'factory', 'experts');

// Loaded prompts are immutable per process — cache to avoid re-reading on
// every gate (a full run loads each of 24 prompts at least twice).
const _cache = new Map<string, string>();

/**
 * Load one expert's system prompt. `stage` is 1..8, `slug` matches the
 * vendored filename (StageExpert.slug). Throws if the file is missing — a
 * missing prompt is a build/sync error we want to fail loudly on, not skip.
 */
export function loadExpertPrompt(stage: number, slug: string): string {
  const key = `${stage}/${slug}`;
  const cached = _cache.get(key);
  if (cached) return cached;

  const path = join(CWD_DIR, `stage-${stage}`, `${slug}.md`);
  if (!existsSync(path)) {
    throw new Error(`Expert prompt not found: ${path} (stage ${stage}, slug "${slug}")`);
  }
  const text = readFileSync(path, 'utf8');
  _cache.set(key, text);
  return text;
}

/**
 * Parse a model's free-text expert output into a VERDICT, when the structured
 * JSON path isn't used. The vendored prompts emit "VERDICT = PASS | FAIL".
 * We bias to FAIL on ambiguity — a gate should never silently pass on an
 * unparseable verdict. (The PersonaRunner uses json_schema, so this is a
 * defensive fallback / helper for any free-text path.)
 */
export function parseVerdictValue(text: string): VerdictValue {
  // Look for an explicit "VERDICT = PASS" / "VERDICT: PASS" / "VERDICT PASS".
  const m = text.match(/VERDICT\s*[:=]?\s*(PASS|FAIL)/i);
  if (m && m[1]) {
    return m[1].toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';
  }
  // No clear verdict marker → treat as FAIL (fail-closed at the gate).
  return 'FAIL';
}
