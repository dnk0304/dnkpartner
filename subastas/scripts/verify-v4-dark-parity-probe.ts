/**
 * verify-v4-dark-parity-probe — request every corpus URL against ONE server and
 * record (path, status, location). Output is a stable TSV, one row per URL,
 * sorted by path, so two runs can be `comm`/`diff`ed directly.
 *
 *   npx tsx scripts/verify-v4-dark-parity-probe.ts \
 *     --base http://localhost:3991 --corpus /tmp/corpus.txt --out /tmp/base.tsv
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS THAT MAKE THIS COMPARABLE
 *
 * 1. redirect: 'manual'. Following redirects would collapse a 307 and a 200
 *    onto the same body and hide precisely the class of regression this exists
 *    to catch (all four of Ken's were status/location moves).
 * 2. Location is NORMALISED to a path. The two servers run on DIFFERENT ports,
 *    so an absolute `Location: http://localhost:3991/x` vs `.../3992/x` would
 *    diff on every single redirect and drown the real rows in noise.
 * 3. A transport failure is recorded as `ERR:<msg>`, never as a status. A
 *    server that stopped answering must show up as a difference, not as a
 *    quietly identical column on both sides.
 */

import { readFileSync, writeFileSync } from 'node:fs';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  console.error(`FATAL: --${name} is required`);
  process.exit(2);
}

const base = arg('base').replace(/\/+$/, '');
const corpusPath = arg('corpus');
const outPath = arg('out');
const conc = Number(arg('concurrency', '12'));

if (/subastasactivas\.com/i.test(base)) {
  console.error(`FATAL: --base points at production (${base}) — refusing to probe the live site`);
  process.exit(3);
}

const urls = readFileSync(corpusPath, 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith('#'));

if (urls.length === 0) {
  console.error('FATAL: corpus is empty — every downstream assertion would be vacuous');
  process.exit(3);
}

/** Absolute -> path, so port differences between the two servers do not diff. */
function normLoc(loc: string | null): string {
  if (!loc) return '';
  return loc.replace(/^https?:\/\/[^/]+/i, '');
}

async function probe(path: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(base + path, { redirect: 'manual' });
      return `${path}\t${r.status}\t${normLoc(r.headers.get('location'))}`;
    } catch (e) {
      if (attempt === 2) return `${path}\tERR:${(e as Error).message}\t`;
      await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
    }
  }
  return `${path}\tERR:unreachable\t`;
}

(async () => {
  const rows: string[] = new Array(urls.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.max(1, conc) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      rows[i] = await probe(urls[i]);
      done++;
      if (done % 250 === 0) console.error(`    ${done}/${urls.length}`);
    }
  });
  await Promise.all(workers);

  rows.sort();
  writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');

  // A status census, printed so a reader can see the run was not degenerate.
  // "All 404" or "all 200" on BOTH sides is how an absence-only proof goes
  // vacuously green; the caller asserts on these numbers.
  const census = new Map<string, number>();
  for (const r of rows) {
    const s = r.split('\t')[1];
    census.set(s, (census.get(s) ?? 0) + 1);
  }
  const parts = [...census.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}=${n}`);
  console.error(`  probed ${rows.length} urls @ ${base} :: ${parts.join(' ')}`);
  writeFileSync(outPath + '.census', parts.join('\n') + '\n', 'utf8');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
