-- Notification idempotency key (2026-06-21) — Forge (wave113).
-- Additive ONLY. ONE new UNIQUE constraint on "Notification": (alertId, auctionId, channel).
-- CREATED, NOT APPLIED — Ken applies on the box via `prisma migrate deploy`
-- FIRST (before the app image flips), mirroring the wave52 suspensionMotive /
-- wave54 valorSubasta / wave112 surfaceM2 pattern.
--
-- WHY: the alert email route (/api/alerts/check) re-selected the same auction
-- rows on every scheduler run (rolling 24h window) and had NO record of what it
-- had already emailed, so Dennis received the SAME properties three days running.
-- The "already-notified" fix records one Notification row per (alert, auction,
-- channel) on a successful send and EXCLUDES anything already recorded on the
-- next run. That exclusion is only race-safe if the table can REJECT a duplicate
-- insert — hence this UNIQUE constraint, written with ON CONFLICT DO NOTHING at
-- the call site. Channel is in the key (recommended in the brief) so a future
-- SMS/push send is tracked independently of the email send.
--
-- The "0 rows today" Notification table already has the perfect column shape
-- (id, userId, alertId, auctionId, channel, type, sentAt, deliveredAt, …); this
-- migration only adds the constraint. NO new columns. NO data backfill — every
-- existing send (there are none) is irrelevant; the constraint protects future
-- inserts only.
--
-- NULL note: "alertId" is nullable in the schema. Postgres treats NULLs as
-- DISTINCT in a UNIQUE constraint, so two future rows with alertId IS NULL would
-- NOT collide. That is acceptable here: the alert-email insert path ALWAYS
-- carries a concrete alertId (it is iterating real alerts), so the dedup we need
-- is fully enforced. We deliberately use a plain UNIQUE (not NULLS NOT DISTINCT)
-- for maximum server-version compatibility; no current writer relies on
-- collapsing NULL-alertId rows.
--
-- SAFETY: pure constraint add. On an empty/near-empty table this is instant and
-- acquires only a brief lock. Guarded with a DO-block existence check so a
-- partial prior apply or a local re-run is a no-op (ADD CONSTRAINT has no
-- IF NOT EXISTS in Postgres). A matching @@unique is added to schema.prisma in
-- the same commit so `prisma migrate status` / future introspection stay in sync.
--
-- Idempotent. Follows: 20260619_add_surface_m2.
-- Sequencing (Ken applies): AFTER 20260619_add_surface_m2. Independent of every
-- prior wave's columns.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_alertId_auctionId_channel_key'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_alertId_auctionId_channel_key"
      UNIQUE ("alertId", "auctionId", "channel");
  END IF;
END
$$;
