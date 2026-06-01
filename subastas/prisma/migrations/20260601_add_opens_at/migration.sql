-- Lifecycle fix (Ghost, 2026-06-01): add Auction.opensAt
--
-- The auction lifecycle is PROXIMA_APERTURA -> (opensAt) -> CELEBRANDOSE ->
-- (endsAt) -> CONCLUIDA_PORTAL. Before this column nothing recorded WHEN a
-- pre-auction opens, so there was no time-driven way to promote a
-- PROXIMA_APERTURA row to live. opensAt captures the BOE "Fecha de inicio"
-- for pre-auction rows and feeds scheduler.promote_pending_auctions.
--
-- ADDITIVE + NULLABLE: cannot break the live table. Existing rows keep NULL.

ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "opensAt" TIMESTAMP(3);

-- Index for the promotion sweep:
--   WHERE status='PROXIMA_APERTURA' AND opensAt <= now()
CREATE INDEX IF NOT EXISTS "Auction_status_opensAt_idx"
  ON "Auction" ("status", "opensAt");
