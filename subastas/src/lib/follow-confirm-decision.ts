/**
 * Pure decision helpers for the email one-click follow (Option B, 2026-07-28).
 *
 * These are deliberately free of Next / DB / auth imports so the branch logic
 * that governs whether a Favorite is written can be unit-tested in isolation
 * (see follow-confirm-decision.test.ts). The GET /api/follow/confirm handler is
 * a thin shell around `decideFollowConfirm`; the login page uses
 * `sanitizeCallbackUrl` to safely honour the round-trip target.
 */

export type FollowConfirmDecision =
  | { kind: 'need-login'; callbackUrl: string }
  | { kind: 'mismatch' }
  | { kind: 'follow' };

/**
 * Decide what the confirm endpoint should do for a signature-valid token.
 *
 *   no session                → 'need-login' (bounce through /login, come back)
 *   session ≠ token.userId     → 'mismatch'   (NEVER follow under wrong account)
 *   session === token.userId   → 'follow'      (record the Favorite)
 *
 * @param sessionUserId the authenticated user's id, or null when logged out.
 * @param tokenUserId   the userId baked into (and signed inside) the token.
 * @param confirmPath   this request's path+query (token intact) — becomes the
 *                      login callbackUrl so auth returns straight here.
 */
export function decideFollowConfirm(params: {
  sessionUserId: string | null | undefined;
  tokenUserId: string;
  confirmPath: string;
}): FollowConfirmDecision {
  const { sessionUserId, tokenUserId, confirmPath } = params;
  if (!sessionUserId) return { kind: 'need-login', callbackUrl: confirmPath };
  if (sessionUserId !== tokenUserId) return { kind: 'mismatch' };
  return { kind: 'follow' };
}

/**
 * Open-redirect guard for a `callbackUrl` query param. Only a same-origin,
 * absolute-path reference is allowed through; anything with a scheme/host, a
 * protocol-relative `//host` prefix, or a `/\` backslash trick returns null so
 * the caller falls back to a safe default ("/"). This is what keeps the email
 * follow round-trip from being turned into an open redirect.
 */
export function sanitizeCallbackUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null; // must be an absolute path, not a full URL
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null; // protocol-relative / backslash
  return raw;
}
