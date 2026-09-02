/**
 * Admin role via email allowlist — NO migration, NO DB column.
 *
 * An admin is a capability layered on top of a normal authenticated session:
 * the session is still issued by NextAuth (`auth()`), but the *admin* check is
 * a pure email-membership test against this allowlist. This keeps the admin
 * roster out of the schema (zero migration) while still being enforced
 * server-side on every protected route.
 *
 * Source: ADMIN_EMAILS env var (comma-separated, trimmed, lowercased).
 * FAIL-CLOSED: if the env var is unset/empty, NOBODY is admin — there is no
 * hardcoded fallback address (that would both leak a private email into the
 * bundle and grant standing access no env change could revoke). Add admins via
 * env-var update + redeploy — no code change.
 *
 * Comparison is case-insensitive: both the allowlist and the candidate email
 * are normalised to trimmed-lowercase before the Set lookup.
 */

const ADMIN_EMAILS: Set<string> = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** Case-insensitive: is this raw email address an admin? */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

/**
 * Minimal shape we need off a NextAuth session to decide admin-ness. Accepting
 * this structural type (rather than importing Session) keeps the helper usable
 * from anywhere without coupling to next-auth's exported types.
 */
interface SessionLike {
  user?: { email?: string | null } | null;
}

/**
 * Is the current NextAuth session an admin? Reads `session.user.email`. Call
 * this at the TOP of every admin-gated handler, AFTER `auth()` has resolved the
 * session. Returns false for logged-out (null session) and for any normal user
 * whose email is not on the allowlist.
 */
export function isAdmin(session: SessionLike | null | undefined): boolean {
  return isAdminEmail(session?.user?.email);
}
