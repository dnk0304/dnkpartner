import { Resend } from 'resend';

// Lazy Resend client. The constructor throws "Missing API key" if
// RESEND_API_KEY is empty/undefined — deferring construction keeps the import
// safe in dev (no key set, register route auto-verifies and never reaches
// here). The client only ever materialises when something actually tries to
// send.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('[email] RESEND_API_KEY is not set — refusing to send.');
  }
  _resend = new Resend(key);
  return _resend;
}

// Brand identity. EMAIL_FROM overrides via env when needed (e.g. staging),
// but the production default is the friendly `hello@` so customers see a real
// address — not a "noreply" black hole. Display name "DNK Partner" renders
// nicely in mail clients.
const FROM = process.env.EMAIL_FROM ?? 'DNK Partner <hello@dnkpartner.com>';

// Reply-To always points at support@ so any customer reply to a transactional
// email reaches a real human inbox (Cloudflare Email Routing forwards
// support@ → Dennis's Gmail in Phase 3). Send-from and reply-to are SEPARATE
// concerns: sending from support@ would pollute the inbox with auto-receipts;
// sending from noreply@ would lose customer replies. Friendly hello@ +
// support@ reply-to is the SaaS standard.
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? 'support@dnkpartner.com';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function sendVerificationEmail(email: string, token: string) {
  // Point at the API route — it verifies the token server-side and redirects
  // to `/auth/login?verified=1`. The `/auth/verify-email` PAGE is a static
  // placeholder ("Verifying your email…") that does no work; landing the user
  // there leaves them stuck forever.
  const url = `${APP_URL}/api/auth/verify-email?token=${token}`;
  await getResend().emails.send({
    from: FROM,
    to: email,
    replyTo: REPLY_TO,
    subject: 'Verify your DNK Partner account',
    html: `
      <h2>Welcome to DNK Partner</h2>
      <p>Click the link below to verify your email address:</p>
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">Verify Email</a>
      <p style="color:#888;font-size:12px;">Link expires in 24 hours.</p>
      <p style="color:#888;font-size:12px;">Questions? Just reply to this email and we'll help.</p>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${APP_URL}/auth/reset-password?token=${token}`;
  await getResend().emails.send({
    from: FROM,
    to: email,
    replyTo: REPLY_TO,
    subject: 'Reset your DNK Partner password',
    html: `
      <h2>Password Reset</h2>
      <p>Click below to reset your password. This link expires in 1 hour.</p>
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">Reset Password</a>
      <p style="color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}
