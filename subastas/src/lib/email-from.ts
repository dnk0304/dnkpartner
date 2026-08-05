/**
 * email-from — the ONE place that decides which address an email is sent FROM.
 *
 * ⭐ TWO SENDERS, STRICTLY SEPARATED (Dennis, 2026-08-05)
 *
 *   info@subastasactivas.com    — informational / account mail: email
 *                                 verification, magic-link + login, password
 *                                 reset, and the welcome email.
 *   alertas@subastasactivas.com — STRICTLY notifications: auction alerts,
 *                                 saved-search matches, followed-auction
 *                                 updates.
 *
 * Why the split is worth enforcing in code rather than in a runbook: a
 * recipient who mutes or filters `alertas@` must not thereby lose their
 * password-reset mail, and a spam complaint against a notification stream must
 * not damage the reputation of the address that carries account-critical mail.
 * Mixing them silently couples the deliverability of the two.
 *
 * ⚠️ THE FALLBACKS ARE PART OF THE SECURITY BOUNDARY, NOT COSMETIC DEFAULTS.
 * A fallback naming a domain we do not own is a deliverability hole: Resend
 * rejects it outright (best case) or it sends unauthenticated and lands in
 * spam. The repo previously carried `SubastaPro <notifications@subastapro.com>`
 * fallbacks — a domain that is not ours. Every default here is on
 * subastasactivas.com, which is the verified sending domain; one domain
 * verification covers both mailboxes.
 */

/** Display name used on every outgoing message. */
export const EMAIL_BRAND_NAME = 'SubastasActivas';

/** The verified sending domain. Both mailboxes live here. */
export const EMAIL_SENDING_DOMAIN = 'subastasactivas.com';

const DEFAULT_INFO_FROM = `${EMAIL_BRAND_NAME} <info@${EMAIL_SENDING_DOMAIN}>`;
const DEFAULT_ALERTS_FROM = `${EMAIL_BRAND_NAME} <alertas@${EMAIL_SENDING_DOMAIN}>`;

/**
 * Informational / account mail sender.
 * Env: `EMAIL_FROM_INFO`. Legacy `EMAIL_FROM` is still honoured so an existing
 * deployment does not silently change behaviour before the new var is set.
 */
export function infoFromEmail(): string {
  return process.env.EMAIL_FROM_INFO || process.env.EMAIL_FROM || DEFAULT_INFO_FROM;
}

/**
 * Notification sender.
 * Env: `EMAIL_FROM_ALERTS`. Legacy `RESEND_FROM_EMAIL` is still honoured for the
 * same reason.
 *
 * ⚠️ `RESEND_FROM_EMAIL` is currently a BARE ADDRESS in some environments
 * (`dennis.kotlenko@gmail.com`). That is why the new var exists and why Ken must
 * set `EMAIL_FROM_ALERTS` explicitly at deploy — leaving the legacy var in place
 * would keep sending notifications from a gmail address that the sending domain
 * cannot authenticate.
 */
export function alertsFromEmail(): string {
  return process.env.EMAIL_FROM_ALERTS || process.env.RESEND_FROM_EMAIL || DEFAULT_ALERTS_FROM;
}
