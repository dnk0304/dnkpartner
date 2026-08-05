/**
 * RUNTIME-ASSETS GUARD — "does the IMAGE have what the running app reads?"
 *
 * ─── WHY THIS EXISTS (wave185, 2026-08-05) ──────────────────────────────────
 * The v3 mint sweep shipped green — build passed, container healthy, endpoint
 * reachable, auth fine — and could not mint a single row. `subastas/.dockerignore`
 * excluded the whole `scraper/` tree, so `scraper/config/ine_municipalities.csv`
 * was absent from the app image and every row failed ENOENT.
 *
 * The gap it exposes is general: `next build` proves the code COMPILES, and the
 * repo-layout tests pass because the repo has every file. Neither says anything
 * about which files survive .dockerignore and the multi-stage COPY list into the
 * runner stage. A file read at REQUEST time is invisible to both.
 *
 * So this runs as a RUN step in the runner stage: the image cannot be built
 * unless the assets are present AND the resolver actually works against them.
 * It is not a unit test — it is a layout assertion executed where the layout is.
 *
 * Add an entry here whenever code starts reading a file at request time.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/runtime-assets-guard.ts
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

let failures = 0;
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log(`# runtime-assets guard (cwd=${process.cwd()})`);

/**
 * Files the app reads at REQUEST time, with a minimum plausible size so a
 * truncated or placeholder file fails too.
 */
const REQUIRED: Array<{ rel: string; minBytes: number; why: string }> = [
  {
    rel: 'scraper/config/ine_municipalities.csv',
    minBytes: 300_000,
    why: 'INE official register — validates municipality before it enters a permanent url',
  },
  {
    rel: 'scraper/config/ine_municipalities_coofficial.csv',
    minBytes: 5_000,
    why: 'INE co-official names — tier-2 gazetteer lookup',
  },
];

// ⚠️ Wrapped in an async main() rather than using top-level await: tsx runs a
// `.ts` file as CJS, where top-level await is a syntax error.
async function main(): Promise<void> {
  for (const f of REQUIRED) {
    const abs = path.join(process.cwd(), f.rel);
    if (!existsSync(abs)) {
      ok(`${f.rel} present`, false, `MISSING (${f.why})`);
      continue;
    }
    const size = statSync(abs).size;
    ok(`${f.rel} present (${size} bytes)`, size >= f.minBytes,
      size < f.minBytes ? `only ${size} bytes, expected >= ${f.minBytes}` : undefined);
  }

  /**
   * ⭐ The assertion that actually matters: not "the file exists" but "the
   * resolver RESOLVES". A present-but-unparseable file would pass the checks
   * above and still mint nothing.
   */
  if (failures === 0) {
    console.log('\n# resolver works against the image layout');
    const { lookupMunicipality } = await import('../src/lib/geo/municipality-gazetteer');

    const madrid = lookupMunicipality('Madrid');
    ok('resolves "Madrid" (tier 1, INE 28079)',
      madrid?.ine === '28079' && madrid?.tier === 1, JSON.stringify(madrid));

    // Proves the SECOND file is loaded too: `Elche` is the Castilian exonym and
    // appears only in the co-official register (official tier-1 name is `Elx`).
    const elche = lookupMunicipality('Elche');
    ok('resolves the co-official-only spelling "Elche" (INE 03065)',
      elche?.ine === '03065', JSON.stringify(elche));

    // Fails CLOSED: a typo must NOT snap onto a real municipality. This is the
    // property that keeps a wrong permanent url from ever being minted.
    const typo = lookupMunicipality('Vitoria-Gaseiz');
    ok('a typo does NOT resolve (fails closed)', typo === null, JSON.stringify(typo));
  }

  console.log(`\n${failures === 0 ? 'RUNTIME-ASSETS GUARD PASSED' : `RUNTIME-ASSETS GUARD FAILED (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('RUNTIME-ASSETS GUARD ERROR:', err);
  process.exit(1);
});
