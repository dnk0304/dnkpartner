-- Auction-outcome registry (2026-07-18) — Forge. Precomputed outcome-stats
-- rollup for the public /resultados archive.
--
-- Additive-ONLY. One new standalone table "AuctionOutcomeStats". No change to
-- "Auction", no FK, no backfill of existing rows. Created NOT applied — Ken
-- runs `prisma migrate deploy` on the box, then the nightly scheduler job
-- (POST /api/admin/registro/recompute) populates it (or a manual --once run).
-- Idempotent guards so a local re-run is harmless. Sequencing: AFTER
-- 20260717_add_sale_results (the latest migration this branched from).
--
-- Bucket key = (period, periodBasis, province, municipality, category, outcome).
-- Empty-string sentinels ('') mark rollup levels (national geo /
-- all-municipalities / all-categories) so the UNIQUE key is deterministic —
-- SQL NULLs are distinct in a unique index and would silently allow duplicate
-- rollup rows (the RegionBenchmark lesson).
--
-- Column semantics (see src/lib/registro/outcome-stats.ts + the canonical
-- taxonomy src/lib/seo/auction-outcome.ts):
--   "count"                        — auctions in this bucket (always emitted).
--   "soldPriceMedianCents"/P25/P75 — VENDIDA-only money medians, in CENTS,
--                                    NULL below the min-sample floor (honest-NULL).
--   "discountToAppraisalMedian"    — median % sold below Tasación (VENDIDA only).
--   "discountToValorSubastaMedian" — median % sold below Valor subasta (VENDIDA only).

CREATE TABLE IF NOT EXISTS "AuctionOutcomeStats" (
  "id"                           TEXT NOT NULL,
  "period"                       TEXT NOT NULL,
  "periodBasis"                  TEXT NOT NULL,
  "province"                     TEXT NOT NULL DEFAULT '',
  "municipality"                 TEXT NOT NULL DEFAULT '',
  "category"                     TEXT NOT NULL DEFAULT '',
  "outcome"                      TEXT NOT NULL,
  "count"                        INTEGER NOT NULL,
  "soldPriceMedianCents"         BIGINT,
  "soldPriceP25Cents"            BIGINT,
  "soldPriceP75Cents"            BIGINT,
  "discountToAppraisalMedian"    DOUBLE PRECISION,
  "discountToValorSubastaMedian" DOUBLE PRECISION,
  "computedAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuctionOutcomeStats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuctionOutcomeStats_period_periodBasis_province_municipality_category_outcome_key"
  ON "AuctionOutcomeStats" ("period", "periodBasis", "province", "municipality", "category", "outcome");
CREATE INDEX IF NOT EXISTS "AuctionOutcomeStats_periodBasis_province_category_outcome_idx"
  ON "AuctionOutcomeStats" ("periodBasis", "province", "category", "outcome");
CREATE INDEX IF NOT EXISTS "AuctionOutcomeStats_province_municipality_idx"
  ON "AuctionOutcomeStats" ("province", "municipality");
CREATE INDEX IF NOT EXISTS "AuctionOutcomeStats_outcome_idx"
  ON "AuctionOutcomeStats" ("outcome");

-- Additive composite index on the existing Auction table for the registry
-- /resultados browse query (filter concluded rows by province + category +
-- terminal status, ordered by sale date). Plain CREATE INDEX (not CONCURRENTLY)
-- — safe at ~237k rows (seconds), and Prisma runs migrations in a txn where
-- CONCURRENTLY is illegal. IF NOT EXISTS keeps re-runs harmless.
CREATE INDEX IF NOT EXISTS "Auction_province_category_status_soldDate_idx"
  ON "Auction" ("province", "category", "status", "soldDate");
