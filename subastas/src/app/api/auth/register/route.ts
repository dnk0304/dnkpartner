import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createVerificationEmail } from '@/lib/email-templates';

/**
 * Wave 2c (email verification):
 *  - Was: register set emailVerified = NOW() immediately and sent NO email.
 *  - Now: emailVerified is NULL on insert. A VerificationToken row is created
 *    (NextAuth-standard table, already in the Prisma schema). A verification
 *    email is sent via Resend. Login is NOT blocked (soft-verify) — Dennis
 *    can flip to hard-gate later with a one-line check elsewhere.
 *
 *  - Token storage: NextAuth's `VerificationToken` (identifier/token/expires).
 *    Reused so no migration is needed.
 *  - Token TTL: 24h.
 *  - Failure mode: if RESEND_API_KEY is unset OR Resend rejects the send,
 *    registration STILL succeeds (account exists, email is in DB) but we log
 *    the failure. The user can request a re-send later. This matches the
 *    existing forgot-password fail-soft pattern.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await queryOne<{ id: string }>(`
      SELECT id FROM User WHERE email = ?
    `, [email]);

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Calculate 15-day trial period
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

    // Generate user ID
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create user — emailVerified intentionally NULL until they click the link.
    // Email/password login still works (NextAuth Credentials doesn't gate on it);
    // notification fan-out can later filter on emailVerified IS NOT NULL.
    await execute(`
      INSERT INTO User (
        id, email, password, emailVerified, tier,
        trialStartDate, trialEndDate, hasUsedTrial, createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      userId,
      email,
      hashedPassword,
      null, // emailVerified: NULL until token redeemed (was: now.toISOString())
      'FREE', // Start as FREE tier
      now.toISOString(), // Trial starts immediately
      trialEnd.toISOString(), // 15 days from now
      false, // hasUsedTrial = false
    ]);

    // Generate verification token + persist into VerificationToken table.
    // 24h TTL. We clear any prior tokens for this identifier first so the
    // newest link is always the live one (mirrors forgot-password pattern).
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    try {
      await execute(
        `DELETE FROM VerificationToken WHERE identifier = ?`,
        [email]
      );
      await execute(
        `
          INSERT INTO VerificationToken (identifier, token, expires)
          VALUES (?, ?, ?)
        `,
        [email, verifyToken, tokenExpires.toISOString()]
      );
    } catch (tokenError) {
      // Token insert failed — log and continue. User can request a re-send.
      console.error('Failed to persist verification token:', tokenError);
    }

    // Send verification email via Resend (mirrors forgot-password send pattern).
    // Fail-soft: if Resend is misconfigured or rejects, registration still
    // succeeds. The token is in DB so a future /api/auth/resend-verification
    // can re-issue. Dennis-infra: needs valid RESEND_API_KEY + verified domain.
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_URL ||
      'https://subastasactivas.com';
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${verifyToken}`;
    const host = (() => {
      try {
        return new URL(baseUrl).host;
      } catch {
        return 'subastasactivas.com';
      }
    })();

    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { subject, html, text } = createVerificationEmail({
          url: verifyUrl,
          host,
          email,
        });
        const result = await resend.emails.send({
          // Unified env: RESEND_FROM_EMAIL controls every send path. Default
          // points at the subastasactivas.com sending domain Dennis is
          // verifying in Resend.
          from:
            process.env.RESEND_FROM_EMAIL ||
            'SubastasActivas <notificaciones@subastasactivas.com>',
          to: email,
          subject,
          html,
          text,
        });
        if (result.error) {
          console.error(
            'Resend rejected verification email:',
            result.error.message ?? result.error
          );
        }
      } catch (error) {
        console.error('Failed to send verification email:', error);
        // Soft-fail — user is registered, can request re-send later.
      }
    } else {
      // Local/dev path: surface the link in logs so devs can copy-click it.
      console.log('Verification link (RESEND_API_KEY not set):', verifyUrl);
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: userId,
          email: email,
          tier: 'FREE',
          trialEndDate: trialEnd.toISOString(),
        },
        verificationEmailSent: Boolean(process.env.RESEND_API_KEY),
        message:
          '🎉 Account created! Check your email to verify your address. You have 15 days of free access to active auctions.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
