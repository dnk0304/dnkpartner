/**
 * Trial System Utilities
 * Functions to check and manage 15-day free trial for new users
 */

import { queryOne, execute } from './db';

export interface TrialStatus {
  isActive: boolean;
  daysRemaining: number;
  endDate: Date | null;
  hasExpired: boolean;
}

interface UserTrialData {
  trialStartDate: string | Date | null;
  trialEndDate: string | Date | null;
  hasUsedTrial: number | boolean;
  tier: string;
}

/**
 * Check if a user's trial is still active
 */
export async function checkTrialStatus(userId: string): Promise<TrialStatus> {
  const user = await queryOne<UserTrialData>(
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

  // hasUsedTrial: 0/false = unused (active eligible), 1/true = used.
  const hasUsedTrial = user.hasUsedTrial === true || user.hasUsedTrial === 1;
  return {
    isActive: !hasExpired && !hasUsedTrial,
    daysRemaining,
    endDate,
    hasExpired,
  };
}

/**
 * Mark trial as expired for a user
 */
export async function expireTrial(userId: string): Promise<void> {
  await execute('UPDATE User SET hasUsedTrial = ? WHERE id = ?', [true, userId]);
}

/**
 * Extend trial by additional days (admin function)
 */
export async function extendTrial(userId: string, additionalDays: number): Promise<Date> {
  const user = await queryOne<{trialEndDate: string | Date | null}>(
    'SELECT trialEndDate FROM User WHERE id = ?',
    [userId]
  );

  if (!user?.trialEndDate) {
    throw new Error('User does not have an active trial');
  }

  const currentEndDate = new Date(user.trialEndDate);
  const newEndDate = new Date(currentEndDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);

  await execute('UPDATE User SET trialEndDate = ? WHERE id = ?', [newEndDate.toISOString(), userId]);

  return newEndDate;
}
