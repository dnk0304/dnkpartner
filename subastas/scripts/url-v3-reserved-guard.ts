/**
 * URL-v3 reserved-segment guard — BUILD-TIME FAILURE, not a runtime surprise.
 *
 * Two independent checks, both judged by exit code:
 *
 *   MODE 1 (default, NO database): re-enumerate the literal route siblings
 *     from the real filesystem route tree and assert they still equal the
 *     hard-coded lists in `src/lib/seo/reserved-segments.ts`. If someone adds
 *     `src/app/subastas/[slug]/[municipio]/comparar/page.tsx`, this fails —
 *     BEFORE a minted URL silently becomes unreachable.
 *
 *   MODE 2 (`--data`, needs DATABASE_URL): assert no row in `auction_url_v3`
 *     is shadowed by a reserved segment, and that every minted URL is the
 *     strict 4-segment v3 shape.
 *
 * Mode 1 is wired into `npm run build` because it needs no secrets and no DB
 * (a build that reaches for the database is a build that breaks when the
 * database is merely slow). Mode 2 is a pre-switch / CI gate.
 *
 * Run:
 *   npx tsx scripts/url-v3-reserved-guard.ts
 *   npx tsx scripts/url-v3-reserved-guard.ts --data
 *   npx tsx scripts/url-v3-reserved-guard.ts --self-test   (negative test)
 */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  RESERVED_UNDER_SUBASTAS,
  RESERVED_UNDER_PROVINCE,
  RESERVED_UNDER_TOWN,
  shadowReason,
  parseV3Path,
} from '../src/lib/seo/reserved-segments';

const APP_DIR = join(process.cwd(), 'src', 'app');

/** Literal (non-dynamic) child route directories of `dir`. */
function literalRouteChildren(dir: string): string[] {
  if (!existsSync(dir)) {
    throw new Error(`route directory does not exist: ${dir}`);
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    // dynamic segments are not literals and cannot shadow anything
    .filter((e) => !e.name.startsWith('[') && !e.name.startsWith('('))
    // `_shared` is a private folder — Next.js does not route it
    .filter((e) => !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort();
}

function compare(label: string, actual: string[], declared: readonly string[]): string[] {
  const a = [...actual].sort().join(',');
  const d = [...declared].sort().join(',');
  if (a === d) {
    console.log(`  OK   ${label}: [${a || '(none)'}]`);
    return [];
  }
  const missing = actual.filter((x) => !declared.includes(x));
  const extra = declared.filter((x) => !actual.includes(x));
  console.error(`  FAIL ${label}`);
  console.error(`       route tree declares: [${a}]`);
  console.error(`       guard list declares: [${d}]`);
  if (missing.length) {
    console.error(`       >>> NEW LITERAL ROUTE(S) NOT IN THE GUARD: ${missing.join(', ')}`);
    console.error(`       >>> A minted slug equal to one of these is UNREACHABLE.`);
    console.error(`       >>> Add it to src/lib/seo/reserved-segments.ts AND re-check the minted table.`);
  }
  if (extra.length) {
    console.error(`       >>> guard lists a segment that is no longer a route: ${extra.join(', ')}`);
  }
  return [label];
}

function modeRouteTree(): number {
  console.log('MODE 1 — reserved list vs actual route tree');
  const failures: string[] = [];
  failures.push(
    ...compare(
      '/subastas/*',
      literalRouteChildren(join(APP_DIR, 'subastas')),
      RESERVED_UNDER_SUBASTAS,
    ),
  );
  failures.push(
    ...compare(
      '/subastas/[slug]/*',
      literalRouteChildren(join(APP_DIR, 'subastas', '[slug]')),
      RESERVED_UNDER_PROVINCE,
    ),
  );

  // The detail route may not exist yet (it is created by the switchover). Its
  // reserved list is still asserted against [municipio]'s literal children,
  // which are exactly the siblings a detail segment would compete with.
  failures.push(
    ...compare(
      '/subastas/[slug]/[municipio]/*',
      literalRouteChildren(join(APP_DIR, 'subastas', '[slug]', '[municipio]')),
      RESERVED_UNDER_TOWN,
    ),
  );

  if (failures.length) {
    console.error(`\nRESERVED-SEGMENT GUARD FAILED (${failures.length}): ${failures.join(' | ')}`);
    return 1;
  }
  console.log('\nRESERVED-SEGMENT GUARD PASSED — no literal route can shadow a minted slug.');
  return 0;
}

async function modeData(): Promise<number> {
  console.log('MODE 2 — minted table vs reserved segments');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ url: string; auction_id: string }>>`
      SELECT url, auction_id FROM auction_url_v3
    `;
    console.log(`  scanned ${rows.length} minted urls`);

    const shadowed: Array<{ url: string; why: string }> = [];
    let badShape = 0;
    for (const r of rows) {
      if (!parseV3Path(r.url)) badShape += 1;
      const why = shadowReason(r.url);
      if (why) shadowed.push({ url: r.url, why });
    }

    console.log(`  non-v3-shape urls : ${badShape}`);
    console.log(`  shadowed urls     : ${shadowed.length}`);
    if (shadowed.length) {
      for (const s of shadowed.slice(0, 25)) {
        console.error(`    ${s.url}  <-- ${s.why}`);
      }
      console.error(`\nDATA GUARD FAILED — ${shadowed.length} minted url(s) are unreachable.`);
      return 1;
    }
    console.log('\nDATA GUARD PASSED — every minted url is a reachable v3 path.');
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Negative test — the guard is worthless unless a deliberate collision fails
 * it. Asserts shadowReason() actually rejects each reserved segment in each
 * position, and accepts a known-good url.
 */
function modeSelfTest(): number {
  console.log('MODE 3 — negative test (a deliberate collision MUST fail)');
  const cases: Array<{ path: string; shouldShadow: boolean; label: string }> = [
    { path: '/subastas/madrid/madrid/local-madrid-boe-j-2025-822193', shouldShadow: false, label: 'real minted url' },
    { path: '/subastas/tipo/madrid/x-y-1', shouldShadow: true, label: 'province = tipo' },
    { path: '/subastas/subasta/madrid/x-y-1', shouldShadow: true, label: 'province = subasta' },
    { path: '/subastas/pagina/madrid/x-y-1', shouldShadow: true, label: 'province = pagina' },
    { path: '/subastas/madrid/pagina/x-y-1', shouldShadow: true, label: 'town = pagina' },
    { path: '/subastas/madrid/madrid/pagina', shouldShadow: true, label: 'detail = pagina' },
    { path: '/subastas/madrid/madrid', shouldShadow: true, label: 'only 3 segments' },
    { path: '/subastas/madrid/madrid/a/b', shouldShadow: true, label: '5 segments' },
    { path: '/otro/madrid/madrid/x', shouldShadow: true, label: 'not under /subastas' },
  ];

  let failed = 0;
  for (const c of cases) {
    const why = shadowReason(c.path);
    const shadowed = why !== null;
    const ok = shadowed === c.shouldShadow;
    if (!ok) failed += 1;
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'} ${c.label.padEnd(22)} shadowed=${String(shadowed).padEnd(5)} expected=${c.shouldShadow}` +
        (why ? `  (${why})` : ''),
    );
  }
  if (failed) {
    console.error(`\nNEGATIVE TEST FAILED — ${failed} case(s) wrong. The guard does not actually guard.`);
    return 1;
  }
  console.log('\nNEGATIVE TEST PASSED — every deliberate collision is rejected.');
  return 0;
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  let code = 0;
  if (args.includes('--self-test')) {
    code = modeSelfTest();
  } else if (args.includes('--data')) {
    code = await modeData();
  } else {
    code = modeRouteTree();
  }
  process.exit(code);
}

run().catch((e) => {
  console.error('GUARD CRASHED:', e);
  process.exit(1);
});
