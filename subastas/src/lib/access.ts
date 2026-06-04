/**
 * Freemium access predicate — the single gate for "open the auction's full info".
 *
 * Dennis boundary (2026-06-04, locked):
 *   - Catalog / list / search / counts / province tree / cards = PUBLIC.
 *   - Opening an auction's FULL INFO (exact address, full map, financials,
 *     documents, edicto, contact panel, alerts, saved searches, advanced
 *     filters) = requires PAID or 30-day TRIAL-active account.
 *
 * Account-state matrix → `hasFullAccess`:
 *   logged-out                → false
 *   signed-in, paid-active    → true        (isPaid(tier))
 *   signed-in, trial-active   → true        (now < trialEndDate)
 *   signed-in, trial-expired  → false
 *
 * MIGRATION DECISION (Forge, 2026-06-04): ZERO migration.
 *   `User.trialStartDate` + `User.trialEndDate` ALREADY exist in
 *   `prisma/schema.prisma` (lines 293-294). The register route and the
 *   OAuth-onboarding path both populate them on user creation. The trial
 *   clock therefore lives on User.trialEndDate, which is the cleanest of
 *   the three candidates Ken flagged:
 *     (a) derive from Whop membership window  → would miss users who never
 *         checked out (the whole free-trial cohort)
 *     (b) User.createdAt + 30d                 → would force the gate to
 *         re-read the policy duration on every request
 *     (c) trialEndDate column                  → already exists, already
 *         backfilled for live users, encodes the policy on the row itself
 *   We adopt (c). The existing 15-day default is bumped to 30 in the
 *   register + OAuth bootstrap paths (this is just changing a constant in
 *   two files, no schema change). Existing 15-day rows are honored as-is —
 *   their `trialEndDate` is the source of truth, no backfill needed.
 *
 * Server-side use: import `hasFullAccessServer(session)` in API routes and
 * SSR pages. Client-side use: import `useHasFullAccess()` in components.
 */

import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { isPaid } from '@/lib/whop/plan-map';

/**
 * Trial window we hand to NEW users on registration / OAuth bootstrap.
 * Existing users keep whatever trialEndDate the DB has on them — we never
 * silently extend a live trial by changing this constant.
 */
export const TRIAL_DAYS = 30;

export type AccessState =
  | { state: 'logged-out'; hasFullAccess: false }
  | { state: 'trial-active'; hasFullAccess: true; trialEndDate: Date }
  | { state: 'paid-active'; hasFullAccess: true }
  | { state: 'trial-expired'; hasFullAccess: false; trialEndDate: Date | null };

interface UserAccessRow {
  tier: string | null;
  trialEndDate: string | Date | null;
}

/**
 * SERVER: resolve the current viewer's access state.
 *
 * Reads NextAuth session, then loads `tier + trialEndDate` for that user.
 * Returns `logged-out` for anonymous viewers. Never throws — DB failures
 * collapse to `logged-out` so a transient blip cannot accidentally hand out
 * full access.
 */
export async function getAccessState(): Promise<AccessState> {
  let userId: string | undefined;
  try {
    const session = await auth();
    userId = session?.user?.id;
  } catch {
    return { state: 'logged-out', hasFullAccess: false };
  }
  if (!userId) return { state: 'logged-out', hasFullAccess: false };

  let row: UserAccessRow | null | undefined = null;
  try {
    row = await queryOne<UserAccessRow>(
      'SELECT tier, "trialEndDate" FROM "User" WHERE id = ?',
      [userId],
    );
  } catch {
    return { state: 'logged-out', hasFullAccess: false };
  }
  if (!row) return { state: 'logged-out', hasFullAccess: false };

  if (isPaid(row.tier)) {
    return { state: 'paid-active', hasFullAccess: true };
  }

  if (row.trialEndDate) {
    const end = new Date(row.trialEndDate);
    if (Number.isFinite(end.getTime()) && Date.now() < end.getTime()) {
      return { state: 'trial-active', hasFullAccess: true, trialEndDate: end };
    }
    return { state: 'trial-expired', hasFullAccess: false, trialEndDate: end };
  }

  return { state: 'trial-expired', hasFullAccess: false, trialEndDate: null };
}

/** Convenience: just the boolean (server). */
export async function hasFullAccessServer(): Promise<boolean> {
  const s = await getAccessState();
  return s.hasFullAccess;
}
