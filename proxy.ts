import { NextRequest, NextResponse } from 'next/server';
import { validateSessionToken } from '@/lib/auth';

/**
 * DNK Partner — auth proxy / middleware.
 *
 * Phase 1 (scaffold, 2026-05-28) scope:
 *   - Auth pages (/auth/*) bounce LOGGED-IN users back to / so the back
 *     button doesn't dump them into login again after they signed in.
 *   - Root /, /privacy, /terms render for everyone (guest or logged-in).
 *   - Stale-cookie cleanup: if a cookie exists but fails validation, clear
 *     it so the next request is a clean guest request (avoids a redirect
 *     loop where a kicked browser keeps re-failing validation).
 *
 * FUTURE PORTFOLIO ROUTES — gate these here when Phase 2+ adds them:
 *   /studio          (Dennis's design/dev portfolio gallery)
 *   /subastas        (Auctions product)
 *   /defensapenal    (Criminal defense product)
 *   ...any other sub-route owned by the DNK umbrella that requires a login.
 *
 * Each future route should be appended to the PROTECTED array below AND
 * added to the matcher config at the bottom. Pattern is identical to the
 * /app pattern this file inherited from the ComputerCaller codebase —
 * payload null → bounce to /auth/login?next=<original-path>.
 */

// Empty in Phase 1 — no gated routes exist yet. Append future portfolio
// routes here. Order doesn't matter; matching is `startsWith`.
const PROTECTED: string[] = [];

// Auth flow pages. Logged-in users who hit one of these get bounced to /
// so the login form isn't shown after a successful sign-in.
const AUTH_PAGES = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Auth check uses validateSessionToken (signature verify + DB sessionVersion
  // lookup). A token whose `ver` no longer matches the DB column (because the
  // user re-logged elsewhere) returns null and we treat the request as guest.
  // Silent bounce per the single-active-session policy — no toast / no banner
  // telling the abuser what we detected.
  const token = req.cookies.get('auth_token')?.value;
  const payload = token ? await validateSessionToken(token) : null;

  // Helper: build a redirect response that ALSO clears the stale auth_token
  // cookie. Without this, a kicked browser would keep its cookie, the next
  // page load would re-trigger validateSessionToken, re-fail, re-bounce in a
  // loop. Clearing the cookie means the next request is a clean guest request.
  const bounceToLogin = (nextPath?: string) => {
    const loginUrl = nextPath
      ? new URL(`/auth/login?next=${encodeURIComponent(nextPath)}`, req.url)
      : new URL('/auth/login', req.url);
    const res = NextResponse.redirect(loginUrl);
    if (token && !payload) {
      res.cookies.set('auth_token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
    }
    return res;
  };

  // Stale-cookie cleanup at the root. If the user has a cookie but it fails
  // validation, clear it so the landing renders cleanly without a fake
  // "logged in" state in the header.
  if (pathname === '/' && token && !payload) {
    const res = NextResponse.next();
    res.cookies.set('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return res;
  }

  // Protect future portfolio routes. PROTECTED is empty in Phase 1, so this
  // block is a no-op until portfolio routes ship.
  if (PROTECTED.some(p => pathname.startsWith(p))) {
    if (!payload) {
      return bounceToLogin(pathname);
    }
  }

  // Logged-in users hitting an auth page → bounce to / (landing). When
  // portfolio routes exist, this can be changed to `/<default-portfolio-route>`.
  if (AUTH_PAGES.includes(pathname) && payload) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

// Matcher — list every path the proxy needs to inspect. When portfolio routes
// land, add their patterns here (e.g. '/studio/:path*').
export const config = {
  matcher: ['/', '/auth/:path*'],
};
