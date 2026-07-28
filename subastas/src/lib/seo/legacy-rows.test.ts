/**
 * Unit tests for the CORRECTED auction-retire (410 / de-index) predicate.
 * Run with: npx tsx src/lib/seo/legacy-rows.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * The predicate (wave155): retire ONLY when dead-link boeId (`^0x`) AND terminal
 * status. Never retire suspended / live / upcoming, and never retire a real
 * `SUB-` boeId regardless of status.
 */
import {
  shouldRetireAuction,
  isLegacyRow,
  isDeadLinkBoeId,
  isLegacyCuid,
} from './legacy-rows';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

// ── The three cases Ken/Dennis asked for ────────────────────────────────────

// (1) suspended-with-0x is NOT retired (Dennis's Las Palmas example:
//     c7mdnij4a9ihge0842bms8sst — SUSPENDIDA + dead 0x link → render frozen).
check(
  'SUSPENDIDA + dead 0x link → NOT retired',
  shouldRetireAuction({ boeId: '0xBC7D9A14EE', status: 'SUSPENDIDA' }) === false,
);

// (2) 0x + terminal IS retired (the genuine ~12.3k junk).
check(
  '0x + CONCLUIDA_PORTAL → retired',
  shouldRetireAuction({ boeId: '0xdeadbeef', status: 'CONCLUIDA_PORTAL' }) === true,
);
check(
  '0x + FINISHED (legacy terminal) → retired',
  shouldRetireAuction({ boeId: '0x1234', status: 'FINISHED' }) === true,
);
check(
  '0x + CANCELADA → retired',
  shouldRetireAuction({ boeId: '0xabc', status: 'CANCELADA' }) === true,
);

// (3) real-SUB + terminal is NOT retired (indexable sold comps / cancelada).
check(
  'real SUB- + CONCLUIDA_PORTAL → NOT retired (sold comp stays reachable)',
  shouldRetireAuction({ boeId: 'SUB-JA-2024-123', status: 'CONCLUIDA_PORTAL' }) === false,
);
check(
  'real SUB- + CANCELADA → NOT retired',
  shouldRetireAuction({ boeId: 'SUB-PLABI-x', status: 'CANCELADA' }) === false,
);

// ── Guard rails ─────────────────────────────────────────────────────────────

// A cuid-shaped id must NEVER by itself retire a row (the whole bug). A live
// cuid row with a real boeId renders.
check(
  'cuid id + real SUB- + CELEBRANDOSE → NOT retired',
  shouldRetireAuction({ boeId: 'SUB-JA-1', status: 'CELEBRANDOSE' }) === false,
);
// 0x + live status → NOT retired (dead link but still live → frozen render).
check(
  '0x + CELEBRANDOSE → NOT retired',
  shouldRetireAuction({ boeId: '0xfeed', status: 'CELEBRANDOSE' }) === false,
);
// 0x + upcoming → NOT retired.
check(
  '0x + PROXIMA_APERTURA → NOT retired',
  shouldRetireAuction({ boeId: '0xfeed', status: 'PROXIMA_APERTURA' }) === false,
);
// Null / missing boeId → never retired.
check(
  'null boeId + CONCLUIDA_PORTAL → NOT retired',
  shouldRetireAuction({ boeId: null, status: 'CONCLUIDA_PORTAL' }) === false,
);

// isLegacyRow is the back-compat alias → same corrected behavior.
check(
  'isLegacyRow alias matches shouldRetireAuction (0x + terminal)',
  isLegacyRow({ id: 'c7mdnij4a9ihge0842bms8sst', boeId: '0xabc', status: 'CONCLUIDA_PORTAL' }) === true,
);
check(
  'isLegacyRow alias does NOT retire suspended 0x',
  isLegacyRow({ id: 'c7mdnij4a9ihge0842bms8sst', boeId: '0xabc', status: 'SUSPENDIDA' }) === false,
);

// Low-level helpers.
check('isDeadLinkBoeId 0x → true', isDeadLinkBoeId('0xabc') === true);
check('isDeadLinkBoeId SUB- → false', isDeadLinkBoeId('SUB-1') === false);
// isLegacyCuid still recognises the shape but it must NOT be used to retire.
check('isLegacyCuid recognises cuid shape (historical only)', isLegacyCuid('c7mdnij4a9ihge0842bms8sst') === true);

if (failures) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll legacy-rows retire-predicate tests passed.');
