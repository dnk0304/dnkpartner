/**
 * Trial System Utilities
 * Functions to check and manage 15-day free trial for new users
 */

import { query, queryOne, execute } from './db';

export interface TrialStatus {
  isActive: boolean;
  daysRemaining: number;
  endDate: Date | null;
  hasExpired: boolean;
}

interface UserTrialData {
  trialStartDate: string | null;
  trialEndDate: string | null;
  hasUsedTrial: number;
  tier: string;
}

/**
 * Check if a user's trial is still active
 */
export async function checkTrialStatus(userId: string): Promise<TrialStatus> {
  const user = queryOne<UserTrialData>(
    'SELECT trialStartDate, trialEndDate, hasUsedTrial, tier FROM User WHERE id = ?',
    [userId]
  );

  if (!user) {
    return {
      isActive: false,
      daysRemaining: 0,
      endDate: null,
      hasExpired: false,
    };
  }

  // If user has upgraded to paid tier, trial is no longer relevant
  if (user.tier !== 'FREE') {
    return {
      isActive: false,
      daysRemaining: 0,
      endDate: user.trialEndDate ? new Date(user.trialEndDate) : null,
      hasExpired: false,
    };
  }

  // If no trial dates set, no trial
  if (!user.trialStartDate || !user.trialEndDate) {
    return {
      isActive: false,
      daysRemaining: 0,
      endDate: null,
      hasExpired: false,
    };
  }

  const now = new Date();
  const endDate = new Date(user.trialEndDate);
  const hasExpired = now > endDate;
  const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    isActive: !hasExpired && user.hasUsedTrial === 0,
    daysRemaining,
    endDate,
    hasExpired,
  };
}

/**
 * Mark trial as expired for a user
 */
export async function expireTrial(userId: string): Promise<void> {
  execute('UPDATE User SET hasUsedTrial = 1 WHERE id = ?', [userId]);
}

/**
 * Extend trial by additional days (admin function)
 */
export async function extendTrial(userId: string, additionalDays: number): Promise<Date> {
  const user = queryOne<{trialEndDate: string | null}>(
    'SELECT trialEndDate FROM User WHERE id = ?',
    [userId]
  );

  if (!user?.trialEndDate) {
    throw new Error('User does not have an active trial');
  }

  const currentEndDate = new Date(user.trialEndDate);
  const newEndDate = new Date(currentEndDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);

  execute('UPDATE User SET trialEndDate = ? WHERE id = ?', [newEndDate.toISOString(), userId]);

  return newEndDate;
}
