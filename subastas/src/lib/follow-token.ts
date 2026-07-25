/**
 * Stateless, signed "follow this auction" tokens (email one-click follow).
 *
 * A token is baked into the "Seguir esta subasta" button in the saved-search
 * Alert email (`createAuctionAlertEmail`, sent by /api/alerts/check). Clicking
 * it hits GET /api/follow/confirm, which verifies the token and creates the
 * Favorite (the follow record) for that ONE user + that ONE auction.
 *
 * Design (Ken brief 2026-07-25, Niki "pure one-click" decision): NO DB table,
 * NO migration. The token is self-contained and HMAC-signed.
 *
 * Wire format:  base64url(payloadJson) + "." + base64url(hmacSha256)
 *   payload = { u: userId, a: auctionId, p: "follow", exp: <unix seconds> }
 *
 * Security properties:
 *   1. Unforgeable   — the HMAC is computed with a server-only secret; an
 *                      attacker cannot mint a valid token without it.
 *   2. No follow-on-behalf — `u` (userId) is inside the signed payload; changing
 *                      it invalidates the signature, so a token can only ever
 *                      follow on behalf of the user it was minted for.
 *   3. Single-purpose — `p:"follow"` is signed and checked; a token cannot be
 *                      repurposed for anything else.
 *   4. Expiring       — `exp` is signed and checked (default 30 days). An expired
 *                      token is rejected and the caller falls back to the normal
 *                      login-gated on-page Follow.
 *   5. Constant-time  — signature comparison uses timingSafeEqual.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const PURPOSE = 'follow' as const;
export const DEFAULT_FOLLOW_TOKEN_TTL_DAYS = 30;

interface FollowTokenPayload {
  /** userId */
  u: string;
  /** auctionId */
  a: string;
  /** purpose — always "follow" */
  p: typeof PURPOSE;
  /** expiry, unix SECONDS */
  exp: number;
}

export type FollowTokenVerifyResult =
  | { ok: true; userId: string; auctionId: string; exp: number }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'bad-purpose' | 'no-secret' };

/**
 * Resolve the signing secret. A dedicated FOLLOW_TOKEN_SECRET is preferred for
 * isolation; otherwise we reuse the Auth.js secret (AUTH_SECRET / NEXTAUTH_SECRET)
 * which is already present in this environment. The `p:"follow"` purpose tag +
 * the bespoke (non-JWT) construction keep it domain-separated from session JWTs.
 */
function getSecret(): string | null {
  return (
    process.env.FOLLOW_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    null
  );
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(payloadB64: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payloadB64).digest();
}

/**
 * Mint a follow token for (userId, auctionId). Returns null only when no secret
 * is configured (fail-closed — the caller simply omits the button).
 */
export function mintFollowToken(
  userId: string,
  auctionId: string,
  ttlDays: number = DEFAULT_FOLLOW_TOKEN_TTL_DAYS,
): string | null {
  const secret = getSecret();
  if (!secret) {
    console.error('[follow-token] no signing secret configured (FOLLOW_TOKEN_SECRET / AUTH_SECRET / NEXTAUTH_SECRET); cannot mint.');
    return null;
  }
  if (!userId || !auctionId) return null;

  const payload: FollowTokenPayload = {
    u: userId,
    a: auctionId,
    p: PURPOSE,
    exp: Math.floor(Date.now() / 1000) + Math.round(ttlDays * 24 * 60 * 60),
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sigB64 = b64url(sign(payloadB64, secret));
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify a follow token. Checks signature (constant-time), purpose, and expiry.
 */
export function verifyFollowToken(token: string | null | undefined): FollowTokenVerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no-secret' };
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' };
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  // Recompute the expected signature and compare in constant time.
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sigB64, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const expectedSig = sign(payloadB64, secret);
  if (providedSig.length !== expectedSig.length || !timingSafeEqual(providedSig, expectedSig)) {
    return { ok: false, reason: 'bad-signature' };
  }

  // Signature is valid → the payload is authentic. Now parse + check claims.
  let payload: FollowTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.u !== 'string' || typeof payload.a !== 'string' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.p !== PURPOSE) return { ok: false, reason: 'bad-purpose' };
  if (Math.floor(Date.now() / 1000) > payload.exp) return { ok: false, reason: 'expired' };

  return { ok: true, userId: payload.u, auctionId: payload.a, exp: payload.exp };
}

/**
 * Extract the auctionId from a SIGNATURE-VALID token, ignoring expiry.
 *
 * Used by the confirm endpoint's fallback path so an expired (but authentic)
 * link can still deep-link the user to the specific auction page, where the
 * normal login-gated "Seguir" works. Returns null for any token whose signature
 * does not verify (never trusts unauthenticated payload data).
 */
export function peekAuctionId(token: string | null | undefined): string | null {
  const secret = getSecret();
  if (!secret || !token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  const expectedSig = sign(payloadB64, secret);
  if (providedSig.length !== expectedSig.length || !timingSafeEqual(providedSig, expectedSig)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return typeof payload?.a === 'string' && payload.p === PURPOSE ? payload.a : null;
  } catch {
    return null;
  }
}
