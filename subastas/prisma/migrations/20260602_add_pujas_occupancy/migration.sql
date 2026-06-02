-- #16 (pujas/bids) + #17 (occupancy) — additive, nullable, no data backfill here.
-- Three new columns on "Auction":
--   pujaStatus       TEXT    : CON_PUJA | SIN_PUJA | NULL  (#16)
--   currentBidAmount BIGINT  : highest bid in CENTS, or NULL (#16)
--   occupancy        TEXT    : OCUPADO | NO_OCUPADO | NO_CONSTA | NULL  (#17)
--
-- IF NOT EXISTS so this is safe to re-run and harmless if a prior partial
-- apply already added a column (matches the additive-column convention used by
-- 20260601_add_opens_at and 20260602_add_lote_split_provenance).
--
-- Sequencing (Ken applies): AFTER 20260602_widen_lote_number_bigint, BEFORE the
-- Whop slot. Existing rows get NULL (unknown) until the bounded backfill
-- (backfill_pujas_occupancy.py) populates the active pool. The scraper writes
-- these going-forward via the adapter's information_schema guard, so applying
-- this migration is what flips them from no-op to persisted.

ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "pujaStatus" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "currentBidAmount" BIGINT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "occupancy" TEXT;
