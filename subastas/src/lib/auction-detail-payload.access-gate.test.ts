/**
 * Unit tests for the wave173 PAID document gate (Task 3a, Option A).
 * Run with: npx tsx src/lib/auction-detail-payload.access-gate.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * Covers the single rule that decides whether our CACHED-copy download URL is
 * emitted into the payload (and therefore the DOM/RSC):
 *   - entitled + stored file   → the /api/auction-doc/<id> path
 *   - entitled + no stored file→ null (nothing to download)
 *   - NOT entitled             → ALWAYS null (gated, whatever the storedPath)
 * The free public officialUrl is projected separately and is NOT covered here —
 * Option A keeps it visible for everyone, so it is never passed through this fn.
 */
import { projectDocDownloadUrl } from './auction-detail-payload';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

const ID = 'ckdoc123';
const STORED = 'boe-abc/nota-simple.pdf';

// Entitled viewer with a stored cached copy → the download path is emitted.
check(
  'entitled + storedPath → /api/auction-doc/<id>',
  projectDocDownloadUrl(true, STORED, ID) === `/api/auction-doc/${ID}`,
);
// Entitled but no cached copy on disk → null (BOE officialUrl is the fallback).
check('entitled + null storedPath → null', projectDocDownloadUrl(true, null, ID) === null);
check('entitled + empty storedPath → null', projectDocDownloadUrl(true, '', ID) === null);

// NOT entitled (guest / expired-trial) → ALWAYS null, even with a stored file.
// This is the gate: the /api/auction-doc/ string must never reach a non-entitled
// viewer's DOM/RSC (defence-in-depth alongside the endpoint's own 403).
check('locked + storedPath → null (GATED)', projectDocDownloadUrl(false, STORED, ID) === null);
check('locked + null storedPath → null', projectDocDownloadUrl(false, null, ID) === null);

// The gated result must not carry the endpoint path in any form.
const lockedVal = projectDocDownloadUrl(false, STORED, ID);
check(
  'locked result never contains /api/auction-doc/',
  lockedVal === null || !String(lockedVal).includes('/api/auction-doc/'),
);

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll document access-gate tests passed.');
