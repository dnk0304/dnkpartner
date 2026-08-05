import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import crypto from 'crypto';
import { infoFromEmail } from '@/lib/email-from';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await queryOne<{ id: string; email: string }>(`
      SELECT id, email FROM User WHERE email = ?
    `, [email]);

    // Don't reveal if user exists or not for security
    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    // Delete any existing reset tokens for this email
    await execute(`DELETE FROM PasswordResetToken WHERE email = ?`, [email]);

    // Create new reset token
    const tokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await execute(`
      INSERT INTO PasswordResetToken (id, email, token, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, datetime('now'))
    `, [tokenId, email, resetToken, expiresAt.toISOString()]);

    // Send reset email
    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`;
    
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        await resend.emails.send({
          from: infoFromEmail(),
          to: email,
          subject: 'Reset your SubastasActivas password',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h1>Reset your password</h1>
              <p>We received a request to reset the password for your SubastasActivas account.</p>
              <p>Click the button below to reset your password:</p>
              <p style="margin: 32px 0;">
                <a href="${resetUrl}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Reset Password
                </a>
              </p>
              <p><strong>This link will expire in 1 hour.</strong></p>
              <p>If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
          text: `Reset your password for SubastasActivas\n\nWe received a request to reset your password.\n\nClick the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, you can safely ignore this email.`,
        });
      } catch (error) {
        console.error('Failed to send password reset email:', error);
        // Still return success to not reveal if user exists
      }
    } else {
      console.log('Password reset link (email not configured):', resetUrl);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
