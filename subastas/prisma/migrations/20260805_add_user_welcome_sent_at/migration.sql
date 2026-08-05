-- Welcome-email idempotency marker.
--
-- ADDITIVE ONLY, and deliberately so: one nullable column, no default, no
-- backfill. Every existing user stays NULL, which under the send rule below
-- means "no welcome email" — we do not want a mass mailing to the entire
-- existing user base the moment this deploys. Only accounts verified from here
-- on receive one.
--
-- ⭐ IT IS A CLAIM MARKER, NOT A RECEIPT. `sendWelcomeEmailOnce` sets it in a
-- conditional UPDATE (`WHERE welcomeSentAt IS NULL`) BEFORE attempting the
-- send, so two concurrent verifications race on the database rather than both
-- sending. The loser of the race sends nothing. If the send then fails, the
-- claim is released back to NULL so it can be retried.
--
-- Idempotent (IF NOT EXISTS): this runs as the production container's CMD
-- (`npx prisma migrate deploy && next start`), so a statement that throws
-- because the column already exists would stop the container from booting.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "welcomeSentAt" TIMESTAMP(3);
