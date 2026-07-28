/**
 * Unit tests for the email one-click follow decision logic (Option B, 2026-07-28).
 * Run with: npx tsx src/lib/follow-confirm-decision.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * Covers the three cases Dennis asked for:
 *   (a) no session            → 'need-login' with a callbackUrl back to this URL
 *   (b) session === token.user → 'follow'    (the ONLY branch that inserts)
 *   (c) session !== token.user → 'mismatch'  (no wrong-account insert)
 * plus the open-redirect guard on the login callbackUrl.
 */
import { decideFollowConfirm, sanitizeCallbackUrl } from './follow-confirm-decision';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

const CONFIRM_PATH = '/api/follow/confirm?token=payload.sig';

// ── (a) No authenticated session → redirect to login, token preserved ───────
{
  const d = decideFollowConfirm({ sessionUserId: null, tokenUserId: 'user_A', confirmPath: CONFIRM_PATH });
  check('(a) null session → need-login', d.kind === 'need-login');
  check('(a) callbackUrl returns to the exact confirm URL (token intact)',
    d.kind === 'need-login' && d.callbackUrl === CONFIRM_PATH);

  // undefined session id behaves identically to null (both "logged out").
  const d2 = decideFollowConfirm({ sessionUserId: undefined, tokenUserId: 'user_A', confirmPath: CONFIRM_PATH });
  check('(a) undefined session → need-login', d2.kind === 'need-login');
}

// ── (b) Session matches the token's user → follow (insert path) ─────────────
{
  const d = decideFollowConfirm({ sessionUserId: 'user_A', tokenUserId: 'user_A', confirmPath: CONFIRM_PATH });
  check('(b) session === token.userId → follow', d.kind === 'follow');
}

// ── (c) Session is a DIFFERENT user → mismatch, never a wrong-account insert ─
{
  const d = decideFollowConfirm({ sessionUserId: 'user_B', tokenUserId: 'user_A', confirmPath: CONFIRM_PATH });
  check('(c) session !== token.userId → mismatch', d.kind === 'mismatch');
  // The route only reaches its INSERT under kind==='follow'; assert this case
  // is NOT that branch, i.e. no favorite can be written under the wrong account.
  check('(c) mismatch is NOT the follow/insert branch', d.kind !== 'follow');
}

// ── Open-redirect guard on the login callbackUrl ────────────────────────────
{
  check('guard: valid same-origin path passes', sanitizeCallbackUrl(CONFIRM_PATH) === CONFIRM_PATH);
  check('guard: null/empty → null', sanitizeCallbackUrl(null) === null && sanitizeCallbackUrl('') === null);
  check('guard: absolute http URL rejected', sanitizeCallbackUrl('https://evil.example/x') === null);
  check('guard: protocol-relative //host rejected', sanitizeCallbackUrl('//evil.example/x') === null);
  check('guard: backslash /\\ trick rejected', sanitizeCallbackUrl('/\\evil.example') === null);
  check('guard: non-slash relative rejected', sanitizeCallbackUrl('evil.example') === null);
}

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll follow-confirm-decision tests passed.');
