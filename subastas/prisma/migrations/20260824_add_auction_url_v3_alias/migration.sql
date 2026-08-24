-- 301 alias layer for `auction_url_v3` (url-street-fullword, 2026-08-24).
--
-- Holds OLD urls that have been re-minted to a new form, mapping each to its
-- auction so the resolver can 301 the old url to the auction's CURRENT url.
-- The re-mint writes rows here in the SAME transaction as it updates
-- `auction_url_v3.url`, so an old url never 404s.
--
-- ⭐ EVERY STATEMENT IS IDEMPOTENT. This runs as the production container's CMD
-- (`npx prisma migrate deploy && next start`), so nothing here may assume the
-- table/constraint is absent — a statement that throws on a re-run would stop
-- the container from booting. Postgres has no IF NOT EXISTS for constraints,
-- hence the pg_constraint guards.

CREATE TABLE IF NOT EXISTS "auction_url_v3_alias" (
    "old_url"    TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "auction_url_v3_alias_pkey" PRIMARY KEY ("old_url")
);

-- Reverse lookups (all aliases for an auction) + cleanup.
CREATE INDEX IF NOT EXISTS "auction_url_v3_alias_auction_idx"
    ON "auction_url_v3_alias" ("auction_id");

-- Invariants enforced BY THE DATABASE. The shape check pins the route prefix so
-- a malformed old url can never be stored; the FK keeps aliases pointing at a
-- real auction and cascades a delete.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auction_url_v3_alias_shape') THEN
        ALTER TABLE "auction_url_v3_alias"
            ADD CONSTRAINT "auction_url_v3_alias_shape" CHECK ("old_url" LIKE '/subastas/%');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auction_url_v3_alias_auction_id_fkey') THEN
        ALTER TABLE "auction_url_v3_alias"
            ADD CONSTRAINT "auction_url_v3_alias_auction_id_fkey"
            FOREIGN KEY ("auction_id") REFERENCES "Auction"("id") ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;
