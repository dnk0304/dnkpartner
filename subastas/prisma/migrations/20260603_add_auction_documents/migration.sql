-- Document-archive wave (2026-06-03) — Forge.
-- Additive ONLY. New "AuctionDocument" table + 7 new nullable columns on
-- "Auction". CREATED, NOT APPLIED — Ken applies on the box during deploy.
--
-- Idempotent (IF NOT EXISTS) so a partial prior apply or local re-run is a
-- no-op. Follows the convention set by:
--   20260601_add_opens_at
--   20260602_add_lote_split_provenance
--   20260602_add_pujas_occupancy
--   20260602_add_article_blog
--
-- Sequencing (Ken applies): AFTER 20260602_add_pujas_occupancy and the most
-- recent Whop/article slots; the AuctionDocument table is independent of any
-- prior wave's columns. Existing rows get NULL on all new Auction columns
-- until Ghost backfills via the adapter's information_schema guard.

-- ---------------------------------------------------------------------------
-- 1. New "AuctionDocument" table (1:N from Auction).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AuctionDocument" (
  "id"          TEXT NOT NULL,
  "auctionId"   TEXT NOT NULL,
  "docType"     TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "officialUrl" TEXT,
  "idDoc"       TEXT,
  "storedPath"  TEXT,
  "kind"        TEXT NOT NULL DEFAULT 'download',
  "mimeType"    TEXT,
  "sizeBytes"   INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuctionDocument_pkey" PRIMARY KEY ("id")
);

-- FK to Auction with ON DELETE CASCADE. DO block makes the constraint add
-- idempotent (PG has no ADD CONSTRAINT IF NOT EXISTS until 16+).
DO $$ BEGIN
  ALTER TABLE "AuctionDocument"
    ADD CONSTRAINT "AuctionDocument_auctionId_fkey"
    FOREIGN KEY ("auctionId") REFERENCES "Auction"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Dedup: one row per (auction, BOE idDoc). Snapshots dedup via the sentinel
-- idDoc='SNAPSHOT'. Note: PG treats NULLs as distinct in UNIQUE indexes, so a
-- row with idDoc IS NULL bypasses the constraint — Ghost MUST always write a
-- non-null idDoc (real BOE idDoc for downloads, 'SNAPSHOT' for snapshots).
CREATE UNIQUE INDEX IF NOT EXISTS "AuctionDocument_auctionId_idDoc_key"
  ON "AuctionDocument" ("auctionId", "idDoc");

CREATE INDEX IF NOT EXISTS "AuctionDocument_auctionId_idx"
  ON "AuctionDocument" ("auctionId");

-- ---------------------------------------------------------------------------
-- 2. New nullable columns on "Auction" — discrete "Datos del bien" fields
--    Ghost will populate going forward. All nullable, no defaults, no
--    backfill in this migration.
-- ---------------------------------------------------------------------------

ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "postalCode"          TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "idufir"              TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "registryInscription" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "legalTitle"          TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "bienLocalidad"       TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "bienProvincia"       TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "viviendaHabitual"    BOOLEAN;
