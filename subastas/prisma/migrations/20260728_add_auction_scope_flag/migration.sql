-- wave155 (2026-07-28) — scope-enforcement soft-hide flag.
--
-- ADDITIVE + NON-DESTRUCTIVE: two nullable-safe columns + one index. No data
-- is deleted or rewritten. Every existing row defaults to inScope = true, so
-- applying this migration alone changes NOTHING that is visible — the catalog
-- keeps showing exactly what it shows today. The reversible backfill
-- (scripts/backfill_scope_flag.py, run separately by Ken with count
-- verification) is what flips the out-of-scope / empty-shell rows to false.
--
-- Reversibility: a wrong classification is undone with a single
--   UPDATE "Auction" SET "inScope" = true, "scopeReason" = NULL WHERE ...
-- Nothing here drops or mutates existing data.

ALTER TABLE "Auction" ADD COLUMN "inScope" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Auction" ADD COLUMN "scopeReason" TEXT;

-- Partial-friendly plain index; the catalog gate is `WHERE ... AND "inScope" = true`.
CREATE INDEX "Auction_inScope_idx" ON "Auction"("inScope");
