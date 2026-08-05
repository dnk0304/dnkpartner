/**
 * WELCOME EMAIL TRIGGER — fires exactly once per account.
 *
 * ─── WHERE "COMPLETES EMAIL VERIFICATION" ACTUALLY IS IN THIS CODEBASE ───────
 * ⚠️ Worth stating plainly, because the dispatch assumed a verification step
 * that does not exist: **this app has no email-verification flow.**
 * `createVerificationEmail` in email-templates.ts is DEAD CODE — nothing imports
 * it, there is no verify-email route, and no code path consumes a
 * VerificationToken. `User.emailVerified` is set at exactly two moments:
 *   1. password registration  (`api/auth/register` — "auto-verify since they
 *      set a password"), and
 *   2. first OAuth sign-in    (`lib/auth.ts::ensureUserForOAuth` — Google/Apple
 *      have already verified the address).
 *
 * Those two moments ARE "the account is now verified" in this system, so that is
 * where this fires. Both are covered. If a real verification step is added
 * later, it calls this same function and nothing else changes — which is the
 * reason the trigger is a function here rather than inline in either route.
 *
 * ─── IDEMPOTENCY ────────────────────────────────────────────────────────────
 * ⭐ CLAIM FIRST, SEND SECOND. The claim is a CONDITIONAL update
 * (`WHERE welcomeSentAt IS NULL`) and the winner is decided by `changes === 1`.
 * Checking-then-sending would be a read-modify-write race: two concurrent
 * sign-ins would both read NULL and both send. Racing on the UPDATE means the
 * database picks one winner, which is the only place that decision can be made
 * correctly.
 *
 * If the send then FAILS the claim is released back to NULL, so a transient
 * Resend outage costs a retry rather than the email. Losing a welcome email is
 * minor; sending two is the visible defect, so the ordering favours "at most
 * once" and repairs forward.
 *
 * Never throws. A welcome email must not be able to fail a registration or a
 * login — that would trade a nice-to-have for the account itself.
 */
import { execute, queryOne } from '@/lib/db';
import { createWelcomeEmail } from '@/lib/email-templates';
import { infoFromEmail } from '@/lib/email-from';

export type WelcomeResult =
  | 'sent'
  | 'already-sent'
  | 'no-resend-key'
  | 'send-failed'
  | 'user-not-found';

/** The site origin used in the email's links. */
function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_URL
    || 'https://subastasactivas.com'
  ).replace(/\/+$/, '');
}

/**
 * Claim + send the welcome email for `userId`. Safe to call on every
 * verification / sign-in; only the first call for a given user sends anything.
 */
export async function sendWelcomeEmailOnce(userId: string): Promise<WelcomeResult> {
  try {
    const user = await queryOne<{ id: string; email: string; name: string | null }>(
      'SELECT id, email, name FROM User WHERE id = ?',
      [userId],
    );
    if (!user?.email) return 'user-not-found';

    // ── THE CLAIM. Exactly one caller can flip NULL -> now().
    const claim = await execute(
      'UPDATE User SET welcomeSentAt = ? WHERE id = ? AND welcomeSentAt IS NULL',
      [new Date().toISOString(), userId],
    );
    if (claim.changes !== 1) return 'already-sent';

    const key = process.env.RESEND_API_KEY;
    if (!key) {
      // No mailer configured (dev / CI). Release the claim so a real
      // environment still sends it — do NOT leave the user permanently marked.
      await execute('UPDATE User SET welcomeSentAt = NULL WHERE id = ?', [userId]);
      return 'no-resend-key';
    }

    const { subject, html, text } = createWelcomeEmail({
      email: user.email, appUrl: appUrl(), name: user.name,
    });

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(key);
      const res = await resend.emails.send({
        // INFO sender — this is account mail, never the alerts stream.
        from: infoFromEmail(),
        to: user.email,
        subject,
        html,
        text,
      });
      if (res.error) throw new Error(res.error.message ?? String(res.error));
      return 'sent';
    } catch (sendErr) {
      // Release the claim so the next verification/sign-in retries.
      await execute('UPDATE User SET welcomeSentAt = NULL WHERE id = ?', [userId]);
      console.error('[welcome-email] send failed, claim released:', sendErr);
      return 'send-failed';
    }
  } catch (err) {
    console.error('[welcome-email] unexpected failure (ignored):', err);
    return 'send-failed';
  }
}
