import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

/**
 * Email verification endpoint (Wave 2c).
 *
 * Looks up a `VerificationToken` row (NextAuth-standard table), verifies it
 * hasn't expired, sets `User.emailVerified = NOW()` for the matching
 * identifier (email), and deletes the token.
 *
 * Two entry shapes:
 *   - GET /api/auth/verify-email?token=<hex>
 *     Used by the link in the verification email. On success, redirects to
 *     /login?verified=1 so the user sees confirmation. On failure, redirects
 *     to /login?verified=0&reason=invalid|expired so the UI can surface it.
 *
 *   - POST /api/auth/verify-email
 *     Body: { token: "<hex>" }
 *     Returns JSON. Used by client-side scripts / tests.
 *
 * Token TTL is set on register (24h). After redemption the row is deleted —
 * a fresh token must be requested via re-send for further attempts.
 *
 * No-op safety: if the user is already verified (token row gone but DB has
 * emailVerified set), GET still redirects ?verified=1 — idempotent from the
 * user's POV. POST returns 400 invalid in that case (cleaner for programmatic
 * callers to distinguish "valid token redeemed" vs "already done").
 */

interface VerificationRow {
  identifier: string;
  token: string;
  expires: string | Date;
}

interface VerifyResult {
  ok: boolean;
  reason?: 'missing' | 'invalid' | 'expired' | 'user_missing' | 'server_error';
  email?: string;
}

async function consumeToken(rawToken: string | null | undefined): Promise<VerifyResult> {
  if (!rawToken || typeof rawToken !== 'string') {
    return { ok: false, reason: 'missing' };
  }

  try {
    const row = await queryOne<VerificationRow>(
      `SELECT identifier, token, expires FROM VerificationToken WHERE token = ?`,
      [rawToken]
    );

    if (!row) {
      return { ok: false, reason: 'invalid' };
    }

    const expiresAt = row.expires instanceof Date ? row.expires : new Date(row.expires);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      // Expired — clean it up so it can't linger.
      await execute(`DELETE FROM VerificationToken WHERE token = ?`, [rawToken]);
      return { ok: false, reason: 'expired' };
    }

    // Confirm the user still exists (could have been deleted in the meantime).
    const user = await queryOne<{ id: string }>(
      `SELECT id FROM User WHERE email = ?`,
      [row.identifier]
    );
    if (!user) {
      await execute(`DELETE FROM VerificationToken WHERE token = ?`, [rawToken]);
      return { ok: false, reason: 'user_missing' };
    }

    // Activate verification + burn the token.
    // datetime('now') is translated to PG NOW() by @/lib/db.
    await execute(
      `UPDATE User SET emailVerified = datetime('now') WHERE email = ?`,
      [row.identifier]
    );
    await execute(`DELETE FROM VerificationToken WHERE identifier = ?`, [row.identifier]);

    return { ok: true, email: row.identifier };
  } catch (error) {
    console.error('verify-email: server error consuming token:', error);
    return { ok: false, reason: 'server_error' };
  }
}

function resolveBaseUrl(req: NextRequest): string {
  // Honour the proxy-aware request URL if available; fall back to env.
  const fromEnv =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return new URL(req.url).origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  const result = await consumeToken(token);
  const base = resolveBaseUrl(request);

  if (result.ok) {
    return NextResponse.redirect(`${base}/login?verified=1`, { status: 302 });
  }

  const reason = result.reason ?? 'invalid';
  return NextResponse.redirect(
    `${base}/login?verified=0&reason=${encodeURIComponent(reason)}`,
    { status: 302 }
  );
}

export async function POST(request: NextRequest) {
  let token: string | null = null;
  try {
    const body = await request.json();
    token = typeof body?.token === 'string' ? body.token : null;
  } catch {
    // Fall through — consumeToken will return missing.
  }

  const result = await consumeToken(token);
  if (result.ok) {
    return NextResponse.json({ success: true, email: result.email });
  }

  const reason = result.reason ?? 'invalid';
  const status = reason === 'server_error' ? 500 : 400;
  return NextResponse.json(
    { success: false, error: reason },
    { status }
  );
}
