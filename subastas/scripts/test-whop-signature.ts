/**
 * Standalone proof script for Feature #10 webhook signature verification.
 *
 * Run with: `npx tsx scripts/test-whop-signature.ts`
 *
 * Uses the REAL production webhook secret (the same one Whop signs with) to
 * prove:
 *   1. A correctly-signed `membership.activated` payload PASSES verification.
 *   2. The same payload with a BAD signature is REJECTED.
 *   3. A correctly-signed `membership.deactivated` payload PASSES.
 *   4. A payload with a tampered body (signature stale) is REJECTED.
 *
 * No DB calls — pure crypto. The tier-write logic in route.ts is exercised on
 * top of this once the migration is applied + the route is deployed.
 */
import {
  signForTest,
  verifyWhopSignature,
} from '../src/lib/whop/signature';

const SECRET =
  'ws_10d3585ab8976ee88b8d62176f044c6f93c43b1dfa0cbcee192c18bded582b59';

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name} — ${detail}`);
}

// --- Test 1: correctly-signed membership.activated PASSES -------------------
{
  const id = 'evt_test_activated_001';
  const timestamp = 1748822400; // fixed for determinism
  const body = JSON.stringify({
    id,
    timestamp,
    type: 'membership.activated',
    data: {
      id: 'mem_abc123',
      user_id: 'whop_user_xyz',
      plan_id: 'plan_c4MzcxWSJP7eT',
      status: 'trialing',
      metadata: { userId: 'user_local_1' },
    },
  });
  const sig = signForTest(body, SECRET, id, timestamp);
  const res = verifyWhopSignature(body, sig, SECRET);
  record(
    'membership.activated correctly signed',
    res.ok === true,
    res.ok ? `accepted; sig=${sig.slice(0, 16)}…` : `rejected: ${res.reason}`,
  );
}

// --- Test 2: BAD signature REJECTED -----------------------------------------
{
  const id = 'evt_test_bad_sig_002';
  const timestamp = 1748822500;
  const body = JSON.stringify({
    id,
    timestamp,
    type: 'membership.activated',
    data: { id: 'mem_def456', plan_id: 'plan_c4MzcxWSJP7eT' },
  });
  // Sign with a DIFFERENT secret — should fail.
  const badSig = signForTest(body, 'ws_wrong_secret_value', id, timestamp);
  const res = verifyWhopSignature(body, badSig, SECRET);
  record(
    'BAD signature (wrong secret)',
    res.ok === false && res.reason === 'bad_signature',
    res.ok ? 'WRONGLY ACCEPTED' : `rejected: ${res.reason}`,
  );
}

// --- Test 3: correctly-signed membership.deactivated PASSES -----------------
{
  const id = 'evt_test_deactivated_003';
  const timestamp = 1748822600;
  const body = JSON.stringify({
    id,
    timestamp,
    type: 'membership.deactivated',
    data: {
      id: 'mem_abc123',
      user_id: 'whop_user_xyz',
      plan_id: 'plan_c4MzcxWSJP7eT',
      status: 'canceled',
      metadata: { userId: 'user_local_1' },
    },
  });
  const sig = signForTest(body, SECRET, id, timestamp);
  const res = verifyWhopSignature(body, sig, SECRET);
  record(
    'membership.deactivated correctly signed',
    res.ok === true,
    res.ok ? `accepted; sig=${sig.slice(0, 16)}…` : `rejected: ${res.reason}`,
  );
}

// --- Test 4: TAMPERED body (stale signature) REJECTED -----------------------
{
  const id = 'evt_test_tamper_004';
  const timestamp = 1748822700;
  const originalBody = JSON.stringify({
    id,
    timestamp,
    type: 'membership.activated',
    data: { id: 'mem_orig', plan_id: 'plan_c4MzcxWSJP7eT' },
  });
  // Compute the legitimate signature for the original body.
  const sig = signForTest(originalBody, SECRET, id, timestamp);
  // Now tamper: attacker swaps in their own user id without re-signing.
  const tamperedBody = JSON.stringify({
    id,
    timestamp,
    type: 'membership.activated',
    data: {
      id: 'mem_orig',
      plan_id: 'plan_c4MzcxWSJP7eT',
      metadata: { userId: 'attacker_user' },
    },
  });
  const res = verifyWhopSignature(tamperedBody, sig, SECRET);
  record(
    'TAMPERED body with stale signature',
    res.ok === false && res.reason === 'bad_signature',
    res.ok ? 'WRONGLY ACCEPTED' : `rejected: ${res.reason}`,
  );
}

// --- Test 5: missing signature header REJECTED ------------------------------
{
  const body = JSON.stringify({ id: 'x', timestamp: 1, type: 'membership.activated' });
  const res = verifyWhopSignature(body, null, SECRET);
  record(
    'missing webhook-signature header',
    res.ok === false && res.reason === 'missing_header',
    res.ok ? 'WRONGLY ACCEPTED' : `rejected: ${res.reason}`,
  );
}

// --- Test 6: malformed signature header REJECTED ----------------------------
{
  const body = JSON.stringify({ id: 'x', timestamp: 1, type: 'membership.activated' });
  const res = verifyWhopSignature(body, 'v2,garbage', SECRET);
  record(
    'malformed signature header (v2)',
    res.ok === false && res.reason === 'malformed_header',
    res.ok ? 'WRONGLY ACCEPTED' : `rejected: ${res.reason}`,
  );
}

// --- Summary ----------------------------------------------------------------
const passed = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n=== ${passed}/${total} passed ===`);
if (passed !== total) process.exit(1);
