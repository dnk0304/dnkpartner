/**
 * Auth + RBAC helpers for the notification/follow/dispatch routes (Wave 2b).
 *
 * Three primitives:
 *   - requireSession()  : returns the authenticated session.user.id or a 401 response.
 *   - requireAdmin()    : returns the authenticated session OR a 403 response if not admin.
 *   - requireCronSecret(): returns OK or a 401 response (constant-time comparison).
 *
 * Admin is defined by the same constant the existing /api/admin/* routes use:
 * email === ADMIN_EMAIL. Centralized here so future role expansion (DB-backed
 * roles, multi-admin) only touches one file.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { timingSafeEqual } from 'crypto';

export const ADMIN_EMAIL = 'dennis.kotlenko@gmail.com';

/**
 * Resolve the session. Returns `{ userId, email, tier }` on success or a
 * 401 NextResponse on failure. Callers check `if ('userId' in result)`.
 */
export async function requireSession(): Promise<
  | { userId: string; email: string; tier: string }
  | NextResponse
> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    );
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    tier: (session.user.tier as string) ?? 'FREE',
  };
}

/**
 * Resolve the session AND require admin role. Returns the session shape or
 * a 401 / 403 NextResponse. Use this on routes that send real emails / mutate
 * scraper state / surface internal data.
 */
export async function requireAdmin(): Promise<
  | { userId: string; email: string; tier: string }
  | NextResponse
> {
  const result = await requireSession();
  if (result instanceof NextResponse) return result;
  if (result.email !== ADMIN_EMAIL) {
    return NextResponse.json(
      { success: false, error: 'forbidden' },
      { status: 403 },
    );
  }
  return result;
}

/**
 * Verify a cron-style invocation via `Authorization: Bearer <CRON_SECRET>`.
 * Falls back to `x-cron-secret` header for compatibility with simple curl
 * one-liners. Constant-time comparison to avoid token-length leakage.
 *
 * Returns null on success or a NextResponse on failure (so callers can do
 * `const err = requireCronSecret(req); if (err) return err;`).
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'cron_secret_not_configured' },
      { status: 500 },
    );
  }

  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';
  const headerSecret = req.headers.get('x-cron-secret') ?? '';
  const supplied = bearer || headerSecret;

  if (!supplied || !constantTimeEqual(supplied, expected)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    );
  }
  return null;
}

/**
 * Allow EITHER an admin session OR a valid cron secret. Used by dual-purpose
 * endpoints like /api/alerts/check (currently called by cron AND by humans).
 */
export async function requireAdminOrCron(
  req: NextRequest,
): Promise<
  | { mode: 'cron' }
  | { mode: 'admin'; userId: string; email: string }
  | NextResponse
> {
  // Try cron first (cheap, header-only).
  const cronErr = requireCronSecret(req);
  if (cronErr === null) return { mode: 'cron' };

  // Fall through to admin session.
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) {
    // Surface the cron 401 only if no admin either; admin's 403 is more useful
    // if the user IS logged in but not admin.
    return adminResult;
  }
  return { mode: 'admin', userId: adminResult.userId, email: adminResult.email };
}

function constantTimeEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
      // timingSafeEqual throws on length mismatch; pad to a fixed size and
      // still compare so the timing is independent of the supplied length.
      const max = Math.max(aBuf.length, bBuf.length);
      const aPad = Buffer.alloc(max);
      const bPad = Buffer.alloc(max);
      aBuf.copy(aPad);
      bBuf.copy(bPad);
      // Force a comparison but always return false (lengths differ).
      timingSafeEqual(aPad, bPad);
      return false;
    }
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}
