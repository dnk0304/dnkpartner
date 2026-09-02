/**
 * ADMIN SIGNUP NOTIFICATION — fires once, on a brand-new registration only.
 *
 * Mirrors ComputerCaller's `sendNewSignupAdminEmail`: a plain internal heads-up
 * to the operator that a new user just signed up. NOT customer-facing mail — no
 * marketing, no CTA, just the facts (email / tier / trial end / timestamp).
 *
 * ─── GUARANTEES ─────────────────────────────────────────────────────────────
 * • Recipient: `ADMIN_NOTIFY_EMAIL` env, default `hola@subastasactivas.com`.
 *   Ken sets `ADMIN_NOTIFY_EMAIL` at deploy; the default keeps it safe if unset.
 * • From: `alertsFromEmail()` — honours the existing `RESEND_FROM_EMAIL` /
 *   `EMAIL_FROM_ALERTS` and otherwise defaults to the VERIFIED sending domain
 *   (`alertas@subastasactivas.com`). Never introduces a new key or an
 *   unverified sender.
 * • NEVER THROWS. This function swallows every error and returns a status. The
 *   caller must still wrap it, but a mail failure can never break the signup
 *   flow — a lost admin notification is trivial; a failed registration is not.
 */
import { alertsFromEmail } from '@/lib/email-from';

export type SignupAdminResult = 'sent' | 'no-resend-key' | 'send-failed';

/** Minimal HTML-escape for the user-supplied email interpolated into the body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendNewSignupAdminEmail(opts: {
  userEmail: string;
  tier: string;
  trialEndDate: Date;
  createdAt: Date;
}): Promise<SignupAdminResult> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return 'no-resend-key';

    const to = process.env.ADMIN_NOTIFY_EMAIL || 'hola@subastasactivas.com';
    const email = escapeHtml(opts.userEmail);

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(key);
      const res = await resend.emails.send({
        from: alertsFromEmail(),
        to,
        subject: `Nuevo registro SubastasActivas: ${opts.userEmail}`,
        html: `
          <h2>Nuevo registro en SubastasActivas</h2>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Plan:</strong> ${escapeHtml(opts.tier)}</p>
          <p><strong>Fin del periodo de prueba:</strong> ${opts.trialEndDate.toISOString()}</p>
          <p><strong>Fecha de registro:</strong> ${opts.createdAt.toISOString()}</p>
        `,
        text:
          `Nuevo registro en SubastasActivas\n` +
          `Email: ${opts.userEmail}\n` +
          `Plan: ${opts.tier}\n` +
          `Fin del periodo de prueba: ${opts.trialEndDate.toISOString()}\n` +
          `Fecha de registro: ${opts.createdAt.toISOString()}\n`,
      });
      if (res.error) throw new Error(res.error.message ?? String(res.error));
      return 'sent';
    } catch (sendErr) {
      console.error('[signup-admin-email] send failed (ignored):', sendErr);
      return 'send-failed';
    }
  } catch (err) {
    console.error('[signup-admin-email] unexpected failure (ignored):', err);
    return 'send-failed';
  }
}
