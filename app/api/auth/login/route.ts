import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signAccessToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const user = await db.user.findUnique({
      where: { email: email?.toLowerCase() },
    });

    // Google-only account guard. If a user signed up via Google, passwordHash
    // is NULL. Returning the generic "Invalid email or password" would be
    // misleading — they HAVE an account, they just need to use the Google
    // button. We respond BEFORE the bcrypt.compare so we don't leak timing
    // info on the password — but this also means we leak the existence of
    // the email + the fact that it's Google-linked. Acceptable trade-off:
    // this is a sign-in form, not a recovery flow.
    if (user && user.passwordHash === null) {
      return NextResponse.json(
        { error: 'This account uses Google. Sign in with Google.' },
        { status: 400 },
      );
    }

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (!user.emailVerified) {
      return NextResponse.json({ error: 'Please verify your email before logging in' }, { status: 403 });
    }

    // Single-active-session: bump sessionVersion BEFORE signing the new JWT.
    // Any previously-issued token for this user carries the old `ver` claim;
    // subsequent calls to validateSessionToken will compare against this
    // newly-incremented row and reject the stale token. Atomic increment so
    // concurrent logins serialise correctly at the DB level.
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

    const response = NextResponse.json({
      user: { id: user.id, email: user.email },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400, // 24 hours
      path: '/',
    });

    return response;
  } catch (e) {
    console.error('[Auth] Login error:', e);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
