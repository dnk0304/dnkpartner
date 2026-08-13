/**
 * Unit tests for the PURE half of the v4 P2 redirect map.
 *
 * `npx tsx src/lib/seo/archive-legacy-redirects.test.ts`
 *
 * These cover the two decisions that are pure arithmetic and therefore provable
 * here rather than against a server: which legacy pages survive v4, and what a
 * retired node falls back to. Everything that needs row counts or a live route
 * is proved in `scripts/verify-v4-redirects.sh`.
 */

import {
  LEGACY_ARCHIVE_PAGE_SIZE,
  mapLegacyArchivePage,
  archiveParentNode,
} from './archive-legacy-redirects';
import { archiveNodePath } from './archive-partitions';

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}`);
  }
}

console.log('--- page mapping ---');
check('page 1..10 survive unchanged at a 10-page node', [1, 2, 5, 9, 10].every((n) => {
  const m = mapLegacyArchivePage(n, 10);
  return m.kind === 'page' && m.page === n;
}));
check('page 11 overflows a 10-page node', mapLegacyArchivePage(11, 10).kind === 'overflow');
check('the overflow row offset is legacy-sized, not v4-sized', (() => {
  const m = mapLegacyArchivePage(11, 10);
  return m.kind === 'overflow' && m.rowOffset === 10 * LEGACY_ARCHIVE_PAGE_SIZE;
})());
check('a deep legacy page maps to its own first row', (() => {
  const m = mapLegacyArchivePage(25, 10);
  return m.kind === 'overflow' && m.rowOffset === 24 * 24;
})());
// ⭐ The chain-free property, asserted rather than described: an in-range page
// maps to ITSELF, so re-entering the rule with the target cannot produce a
// second hop. A row-offset remap (floor((n-1)*24/48)+1) would fail this.
check('in-range mapping is idempotent (no redirect chains)', [2, 6, 10].every((n) => {
  const first = mapLegacyArchivePage(n, 10);
  if (first.kind !== 'page') return false;
  const second = mapLegacyArchivePage(first.page, 10);
  return second.kind === 'page' && second.page === first.page;
}));
check('a node with a smaller page count still keeps its own pages', (() => {
  const m = mapLegacyArchivePage(3, 4);
  return m.kind === 'page' && m.page === 3;
})());

console.log('--- parent fallback (a 301 must never land on a 404) ---');
check('an outcome facet falls back to its province',
  archiveNodePath(archiveParentNode({ prov: 'madrid', outcome: 'canceladas' })) === '/resultados/madrid');
check('a trimestre falls back to its year',
  archiveNodePath(archiveParentNode({ prov: 'madrid', muni: 'madrid', tipo: 'judicial', anio: 2026, trimestre: 1 })) ===
    '/resultados/madrid/madrid/judicial/2026');
check('a year falls back to its tipo',
  archiveNodePath(archiveParentNode({ prov: 'madrid', muni: 'madrid', tipo: 'judicial', anio: 2026 })) ===
    '/resultados/madrid/madrid/judicial');
check('a tipo falls back to its town',
  archiveNodePath(archiveParentNode({ prov: 'madrid', muni: 'madrid', tipo: 'judicial' })) ===
    '/resultados/madrid/madrid');
check('a town falls back to its province',
  archiveNodePath(archiveParentNode({ prov: 'madrid', muni: 'madrid', muniDbName: 'MADRID' })) ===
    '/resultados/madrid');
check('the fallback drops muniDbName with the muni (a stale name selects nothing)',
  archiveParentNode({ prov: 'madrid', muni: 'madrid', muniDbName: 'MADRID' }).muniDbName === undefined);
check('a province is its own floor — never the archive root',
  archiveNodePath(archiveParentNode({ prov: 'madrid' })) === '/resultados/madrid');
// The location-free shelf has no province to fall back to; its tipo root is the
// floor, and dropping it would land on `/resultados`, the soft-404 §1 forbids.
check('a shelf year falls back to its shelf root, not the archive root',
  archiveNodePath(archiveParentNode({ tipo: 'judicial', anio: 2024 })) === '/resultados/judicial');

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll archive-legacy-redirects tests passed.');
