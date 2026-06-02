-- Feature #10 (Whop embedded payment) — Forge
-- Tier model collapse: FREE/GOLD/DIAMOND → FREE + ACCESO (paid).
-- Reversible-by-design:
--   * ADD enum value 'ACCESO' to UserTier (keeps GOLD/DIAMOND in place so any
--     future re-expansion is config, not a destructive migration).
--   * Subscription gains Whop linkage columns (additive, nullable).
-- Created NOT applied — Ken applies as slot #3 (after Article #9 + slug-table
-- + the BigInt widen). Idempotent guards so re-running locally is harmless.

-- 1) Extend UserTier enum with ACCESO. Postgres enum ALTERs are atomic AFTER
--    commit; the IF NOT EXISTS guard makes this safe to re-run.
ALTER TYPE "UserTier" ADD VALUE IF NOT EXISTS 'ACCESO';

-- 2) Extend Subscription with the Whop linkage columns. Additive + nullable +
--    indexed where we query by them. stripeCustomerId / stripeSubscriptionId
--    remain in place (legacy data, unused going forward).
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "whopMembershipId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "whopPlanId"       TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "whopUserId"       TEXT;

-- Lookup: webhook handler reads Subscription by membership id on every
-- membership.* event. Unique because Whop guarantees one-per-user per plan
-- and one membership maps to one local Subscription row.
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_whopMembershipId_key"
  ON "Subscription"("whopMembershipId");

CREATE INDEX IF NOT EXISTS "Subscription_whopUserId_idx"
  ON "Subscription"("whopUserId");
