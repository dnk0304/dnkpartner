/**
 * Side-effects that run ONCE, for a brand-new OAuth (Google/Apple) account.
 *
 * Extracted out of `ensureUserForOAuth` (`src/lib/auth.ts`) for two reasons:
 *  1. `auth.ts` pulls in NextAuth + the db module at import time, so its
 *     new-user branch cannot be exercised by this repo's pure tsx tests.
 *  2. The ordering and the never-throw contract below are the part that can
 *     actually regress, and they are pure decisions over injected senders.
 *
 * CONTRACT
 *  • Welcome mail first, admin heads-up second (the user-facing mail must not
 *    queue behind an internal notification).
 *  • The admin heads-up can NEVER throw into the sign-in flow. `sendAdmin`
 *    already swallows its own errors; this wrapper is the second belt, matching
 *    the shape of `src/app/api/auth/register/route.ts`.
 *  • This helper is for the BRAND-NEW-user block only. Calling it on the
 *    existing-user path would notify the admin on every repeat OAuth sign-in.
 */
export interface OAuthSignupEffectDeps {
  /** Idempotent: only the first call for a given user ever sends. */
  sendWelcome: (userId: string) => Promise<unknown>;
  sendAdmin: (opts: {
    userEmail: string;
    tier: string;
    trialEndDate: Date;
    createdAt: Date;
  }) => Promise<unknown>;
}

export interface OAuthSignupEffectArgs {
  userId: string;
  email: string;
  /** End of the freemium trial window granted at creation. */
  trialEnd: Date;
  /** Creation timestamp of the row (same `now` used for the INSERT). */
  now: Date;
}

export async function afterOAuthUserCreated(
  args: OAuthSignupEffectArgs,
  deps: OAuthSignupEffectDeps,
): Promise<void> {
  await deps.sendWelcome(args.userId);

  try {
    await deps.sendAdmin({
      userEmail: args.email,
      tier: 'FREE',
      trialEndDate: args.trialEnd,
      createdAt: args.now,
    });
  } catch (err) {
    console.error('[oauth] admin signup notification failed (ignored):', err);
  }
}
