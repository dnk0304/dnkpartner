-- Register `auction_url_v3` with Prisma.
--
-- The table already exists in production, created by the URL-v3 mint via raw
-- DDL and holding 192,589 rows. This migration does NOT create it there; it
-- makes the migration history agree with schema.prisma, so that:
--   * a FRESH database (dev, CI, a rebuilt environment) gets the real table
--     instead of silently lacking it, and
--   * `prisma migrate deploy` in production is a clean no-op.
--
-- ⭐ EVERY STATEMENT IS IDEMPOTENT. This runs as the production container's CMD
-- (`npx prisma migrate deploy && next start`). A statement that throws because
-- an object already exists would stop the container from booting — so nothing
-- here may assume either presence or absence. Table constraints have no
-- IF NOT EXISTS form in Postgres, hence the pg_constraint guards.

CREATE TABLE IF NOT EXISTS "auction_url_v3" (
    "auction_id"      TEXT NOT NULL,
    "boe_id"          TEXT NOT NULL,
    "url"             TEXT NOT NULL,
    "province_slug"   TEXT NOT NULL,
    "town_slug"       TEXT NOT NULL,
    "town_source"     TEXT NOT NULL,
    "ine"             TEXT,
    "ref_tail"        TEXT NOT NULL,
    "descriptor"      TEXT,
    "descriptor_full" TEXT,
    "truncated"       BOOLEAN NOT NULL,
    "guard_signals"   TEXT,
    "minted_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "auction_url_v3_pkey" PRIMARY KEY ("auction_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "auction_url_v3_boe_id_key" ON "auction_url_v3" ("boe_id");
CREATE UNIQUE INDEX IF NOT EXISTS "auction_url_v3_url_key"    ON "auction_url_v3" ("url");
CREATE INDEX        IF NOT EXISTS "auction_url_v3_town_idx"   ON "auction_url_v3" ("province_slug", "town_slug");

-- Invariants enforced BY THE DATABASE, not by the minting script. They are the
-- reason a bad url cannot be stored at all: the 200-char ceiling is structural
-- (see buildAuctionPathV3), and the shape check pins the route prefix.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auction_url_v3_ceiling') THEN
        ALTER TABLE "auction_url_v3" ADD CONSTRAINT "auction_url_v3_ceiling" CHECK (length("url") <= 200);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auction_url_v3_shape') THEN
        ALTER TABLE "auction_url_v3" ADD CONSTRAINT "auction_url_v3_shape" CHECK ("url" LIKE '/subastas/%');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auction_url_v3_town_source_check') THEN
        ALTER TABLE "auction_url_v3" ADD CONSTRAINT "auction_url_v3_town_source_check"
            CHECK ("town_source" = ANY (ARRAY['cp-muni', 'stored-gazetteer']));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auction_url_v3_auction_id_fkey') THEN
        ALTER TABLE "auction_url_v3" ADD CONSTRAINT "auction_url_v3_auction_id_fkey"
            FOREIGN KEY ("auction_id") REFERENCES "Auction"("id") ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;
