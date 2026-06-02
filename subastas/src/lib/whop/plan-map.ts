/**
 * Whop plan → app tier map.
 *
 * One row today: the Acceso plan (€5.99/mo). Future tiers are an addition here
 * (plus the corresponding `ALTER TYPE UserTier ADD VALUE` migration), NOT a
 * code refactor — every consumer goes through `tierForPlan()` / `isPaid()`.
 */
export type AppTier = 'FREE' | 'ACCESO' | 'GOLD' | 'DIAMOND';

export const WHOP_PLAN_ID_ACCESO = 'plan_c4MzcxWSJP7eT';

const PLAN_TIER_MAP: Record<string, AppTier> = {
  [WHOP_PLAN_ID_ACCESO]: 'ACCESO',
};

export function tierForPlan(planId: string | null | undefined): AppTier | null {
  if (!planId) return null;
  return PLAN_TIER_MAP[planId] ?? null;
}

/**
 * The single gating predicate. Any code that used to ask
 * "is this user GOLD or DIAMOND?" should ask `isPaid(tier)` instead, so adding
 * future tiers does not require touching every call site.
 */
export function isPaid(tier: string | null | undefined): boolean {
  return tier === 'ACCESO' || tier === 'GOLD' || tier === 'DIAMOND';
}
