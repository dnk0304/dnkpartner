#!/usr/bin/env node
/**
 * Unit-suite runner for the repo's exit-code test convention.
 *
 * This repo has NO vitest/jest. Every `*.test.ts` here is a standalone tsx
 * script: plain assertions, `process.exit(failures ? 1 : 0)` at the bottom.
 * That is a real convention, not an accident — but until now nothing ever
 * invoked them as a suite, so a red test could sit red indefinitely.
 *
 * This runner executes them and aggregates exit codes.
 *
 * EXCLUDED ON PURPOSE (these hit a database / external service when run):
 *   - src/lib/seo/auction-url.test.ts   (imports the prisma client)
 *   - prisma/db-target-guard.test.ts    (already wired as `guard:db-target`)
 *
 * Adding a new pure `*.test.ts` under src/ or scripts/ picks it up
 * automatically; add DB-touching ones to EXCLUDE below.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXCLUDE = new Set(
  ['src/lib/seo/auction-url.test.ts', 'prisma/db-target-guard.test.ts'].map((p) =>
    path.join(root, p.split('/').join(path.sep)),
  ),
);

const SEARCH_ROOTS = ['src', 'scripts'];

const TSX_CLI = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
if (!existsSync(TSX_CLI)) {
  console.error(`unit runner: tsx CLI not found at ${TSX_CLI} — run \`npm install\` first`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.test\.tsx?$/.test(entry) && !EXCLUDE.has(full)) out.push(full);
  }
  return out;
}

const files = SEARCH_ROOTS.flatMap((r) => walk(path.join(root, r))).sort();

if (files.length === 0) {
  console.error('unit runner: found no test files — the glob is wrong, refusing to pass vacuously');
  process.exit(1);
}

const only = process.argv[2]; // optional substring filter, e.g. `npm run test:unit -- geo`
const selected = only ? files.filter((f) => f.includes(only.split('/').join(path.sep))) : files;

if (selected.length === 0) {
  console.error(`unit runner: filter "${only}" matched nothing out of ${files.length} test files`);
  process.exit(1);
}

const failed = [];
for (const file of selected) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  // Invoke tsx's CLI through this same node binary. Avoids the Windows
  // `.cmd`-needs-a-shell problem (and the shell-quoting hazard that comes with
  // it) entirely — no shell is spawned, so paths with spaces are safe.
  const res = spawnSync(process.execPath, [TSX_CLI, file], {
    cwd: root,
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    failed.push(rel);
    console.log(`\n  ✗ FAIL  ${rel} (exit ${res.status})\n`);
  } else {
    console.log(`  ✓ pass  ${rel}`);
  }
}

console.log(`\nunit suite: ${selected.length - failed.length}/${selected.length} files passed`);
if (failed.length) {
  console.log('failing files:');
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
