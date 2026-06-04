'use client';

/**
 * Client-side mirror of `hasFullAccessServer`. Reads `session.user.tier` +
 * `session.user.trialEndDate` (both plumbed from `lib/auth.ts` → session
 * callback) and returns the same `hasFullAccess` predicate the server uses.
 *
 * Both sides MUST agree — anything the server projects out (e.g. exact
 * address) the client must also hide; anything the server sends the client
 * may freely render.
 */

import { useSession } from 'next-auth/react';
import { isPaid } from '@/lib/whop/plan-map';

export type ClientAccessState = 'logged-out' | 'trial-active' | 'paid-active' | 'trial-expired';

export interface ClientAccess {
  state: ClientAccessState;
  hasFullAccess: boolean;
  /** True until the session resolves — render gates as locked during this window. */
  loading: boolean;
}

export function useAccess(): ClientAccess {
  const { data: session, status } = useSession();
  if (status === 'loading') {
    return { state: 'logged-out', hasFullAccess: false, loading: true };
  }
  if (status !== 'authenticated' || !session?.user) {
    return { state: 'logged-out', hasFullAccess: false, loading: false };
  }
  if (isPaid(session.user.tier)) {
    return { state: 'paid-active', hasFullAccess: true, loading: false };
  }
  const trialEndIso = session.user.trialEndDate ?? null;
  if (trialEndIso) {
    const end = new Date(trialEndIso).getTime();
    if (Number.isFinite(end) && Date.now() < end) {
      return { state: 'trial-active', hasFullAccess: true, loading: false };
    }
  }
  return { state: 'trial-expired', hasFullAccess: false, loading: false };
}
