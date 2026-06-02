-- #14 multi-lot SPLIT model: provenance for lotes split into independent rows.
-- Additive + nullable + zero backfill. NULL for ordinary single auctions.
--   sourceIdSub : the umbrella BOE idSub this lote was split out of
--   loteNumber  : the &idLote=N this row came from
-- The live boeId for a split row is "<sourceIdSub>-L<loteNumber>" (self-describing),
-- but these explicit columns keep the backfill + "other lotes of this auction"
-- queries trivial. IF NOT EXISTS so it is idempotent / safe to re-run.

ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "sourceIdSub" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "loteNumber" INTEGER;

CREATE INDEX IF NOT EXISTS "Auction_sourceIdSub_idx" ON "Auction"("sourceIdSub");
