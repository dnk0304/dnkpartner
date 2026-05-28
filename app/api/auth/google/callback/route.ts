/**
 * GET /api/auth/google/callback — complete the Google OAuth flow.
 *
 * Sequence:
 *   1. Reject if Google returned `error` (user denied consent, app blocked, etc).
 *   2. Verify state JWT signature AND match its nonce against the cookie.
 *      Either failing → CSRF reject, redirect to login.
 *   3. Exchange code → id_token via Google's token endpoint.
 *   4. Validate id_token via Google's tokeninfo endpoint (sig + iss + aud + exp).
 *   5. Refuse if `email_verified=false` (extremely rare for consumer Google).
 *   6. User lookup branches:
 *        a) Found by googleId             → login this user (sign JWT, redirect)
 *        b) Found by email (no googleId)  → link Google to this account
 *                                            (set googleId, authProvider='both'),
 *                                            mark emailVerified=true, login.
 *        c) Not found                     → create new user
 *                                            (passwordHash=null, emailVerified=true,
 *                                            authProvider='google'), login.
 *   7. Bump sessionVersion, sign auth_token JWT, set HttpOnly cookie.
 *   8. Redirect to `next` (or `/`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signAccessToken } from '@/lib/auth';
import {
  exchangeCodeForTokens,
  verifyIdToken,
  verifyOAuthState,
  sanitiseNext,
} from '@/lib/google';

const STATE_COOKIE = 'g_oauth_state';

// Behind Coolify's Traefik reverse proxy, req.url resolves to the container's
// internal address. Anchor every redirect from this endpoint on the public
// NEXT_PUBLIC_APP_URL.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

function loginErrorRedirect(reason: string): NextResponse {
  const url = new URL(`/auth/login?error=${encodeURIComponent(reason)}`, APP_URL);
  const res = NextResponse.redirect(url);
  // Burn the state cookie — single-use.
  res.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/api/auth/google' });
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const oauthError = req.nextUrl.searchParams.get('error');
    if (oauthError) {
      console.warn(`[GoogleCallback] OAuth error param: ${oauthError}`);
      // `access_denied` = user clicked "Cancel" on the Google consent. Silently
      // bounce back to login rather than scaring them with an error message.
      return loginErrorRedirect(oauthError === 'access_denied' ? 'google_cancelled' : 'google_error');
    }

    const code = req.nextUrl.searchParams.get('code');
    const stateParam = req.nextUrl.searchParams.get('state');
    if (!code || !stateParam) {
      return loginErrorRedirect('google_missing_params');
    }

    // Dual CSRF check: signed state JWT + cookie containing the same JWT.
    const cookieState = req.cookies.get(STATE_COOKIE)?.value;
    if (!cookieState || cookieState !== stateParam) {
      console.warn('[GoogleCallback] State cookie/param mismatch — CSRF reject');
      return loginErrorRedirect('google_state_mismatch');
    }
    const state = verifyOAuthState(stateParam);
    if (!state) {
      return loginErrorRedirect('google_state_invalid');
    }

    const { idToken } = await exchangeCodeForTokens(code);
    const claims = await verifyIdToken(idToken);

    if (!claims.email_verified) {
      console.warn(`[GoogleCallback] Refused: Google email_verified=false for ${claims.email}`);
      return loginErrorRedirect('google_email_unverified');
    }

    const email = claims.email.toLowerCase();
    const googleId = claims.sub;

    // Branch a: look up by googleId first — exact match wins regardless of email.
    let user = await db.user.findUnique({ where: { googleId } });

    if (!user) {
      // Branch b: existing email/password account on the same email — link.
      const byEmail = await db.user.findUnique({ where: { email } });

      if (byEmail) {
        const newProvider = byEmail.passwordHash ? 'both' : 'google';
        user = await db.user.update({
          where: { id: byEmail.id },
          data: {
            googleId,
            authProvider: newProvider,
            emailVerified: true,
          },
        });
      } else {
        // Branch c: brand-new user.
        user = await db.user.create({
          data: {
            email,
            passwordHash: null,
            emailVerified: true,
            googleId,
            authProvider: 'google',
          },
        });
      }
    }

    // Bump sessionVersion before signing so any prior token for this user
    // (e.g. an old tab) is invalidated. Symmetric with /api/auth/login.
    const bumped = await db.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });

    const token = signAccessToken({
      userId: user.id,
      email: user.email,
      ver: bumped.sessionVersion,
    });

    const next = sanitiseNext(state.next);
    const redirectUrl = new URL(next, APP_URL);
    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400, // 24h — matches /api/auth/login
      path: '/',
    });

    // Burn the state cookie — single-use.
    response.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/api/auth/google' });

    return response;
  } catch (e) {
    console.error('[GoogleCallback] error:', e);
    return loginErrorRedirect('google_internal_error');
  }
}
