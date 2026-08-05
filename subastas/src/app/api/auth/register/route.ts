import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { sendWelcomeEmailOnce } from '@/lib/email/send-welcome';

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

    // Calculate 30-day trial period (Dennis 2026-06-04, freemium gate).
    // Constant lives in src/lib/access.ts (TRIAL_DAYS).
    const { TRIAL_DAYS } = await import('@/lib/access');
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    // Generate user ID
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create user with 15-day trial
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
      now.toISOString(), // Auto-verify since they set a password
      'FREE', // Start as FREE tier
      now.toISOString(), // Trial starts immediately
      trialEnd.toISOString(), // 15 days from now
      false, // hasUsedTrial = false
    ]);

    // Welcome email — the account is verified the moment it is created here
    // ("auto-verify since they set a password" above), so this IS the
    // verification-complete point. Awaited but never allowed to fail the
    // registration; `sendWelcomeEmailOnce` swallows its own errors.
    await sendWelcomeEmailOnce(userId);

    return NextResponse.json(
      {
        success: true,
        user: {
          id: userId,
          email: email,
          tier: 'FREE',
          trialEndDate: trialEnd.toISOString(),
        },
        message: `Account created. You have ${TRIAL_DAYS} days of free access.`,
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
