import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password } = body;

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Find the reset token
    const resetToken = queryOne<{
      id: string;
      token: string;
      email: string;
      expiresAt: string;
    }>('SELECT * FROM PasswordResetToken WHERE token = ?', [token]);

    if (!resetToken) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Check if token has expired
    if (new Date() > new Date(resetToken.expiresAt)) {
      execute('DELETE FROM PasswordResetToken WHERE token = ?', [token]);
      return NextResponse.json(
        { error: 'Reset token has expired' },
        { status: 400 }
      );
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user's password
    execute(`
      UPDATE User 
      SET password = ?, emailVerified = datetime('now')
      WHERE email = ?
    `, [hashedPassword, resetToken.email]);

    // Delete all reset tokens for this email
    execute('DELETE FROM PasswordResetToken WHERE email = ?', [resetToken.email]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
