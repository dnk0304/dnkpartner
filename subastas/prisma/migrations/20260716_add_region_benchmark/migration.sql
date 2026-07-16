-- Property-portal Phase 3 (2026-07-16) — Forge. Region €/m² benchmark.
--
-- Additive-ONLY. One new standalone table "RegionBenchmark" (precomputed
-- value-signal buckets). No change to "Auction", no FK, no backfill of
-- existing rows. Created NOT applied — Ken runs `prisma migrate deploy` on the
-- box, then POST /api/admin/benchmark/recompute to populate it. Idempotent
-- guards so a local re-run is harmless. Sequencing: AFTER
-- 20260712_add_article_image_url (latest migration on the branch).
--
-- Bucket key = (province, category, municipality). municipality = '' (empty
-- string, NOT NULL) marks a PROVINCE-LEVEL bucket so the UNIQUE key is
-- deterministic and the recompute upsert works (SQL NULLs are distinct in a
-- unique index and would silently allow duplicate province-level rows).
--
-- Column semantics (see src/lib/benchmark.ts):
--   "sampleSize"  — comparables behind the median AFTER outlier trimming
--                   (plausibility band + 1.5×IQR). A bucket is only written
--                   when sampleSize >= 5 (min-sample honesty).
--   "medianEurM2" — MEDIAN €/m² (whole euros). Never a mean.
--   "p25/p75/min/maxEurM2" — spread context, nullable.

CREATE TABLE IF NOT EXISTS "RegionBenchmark" (
  "id"           TEXT NOT NULL,
  "province"     TEXT NOT NULL,
  "category"     TEXT NOT NULL,
  "municipality" TEXT NOT NULL DEFAULT '',
  "sampleSize"   INTEGER NOT NULL,
  "medianEurM2"  DOUBLE PRECISION NOT NULL,
  "p25EurM2"     DOUBLE PRECISION,
  "p75EurM2"     DOUBLE PRECISION,
  "minEurM2"     DOUBLE PRECISION,
  "maxEurM2"     DOUBLE PRECISION,
  "computedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RegionBenchmark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RegionBenchmark_province_category_municipality_key"
  ON "RegionBenchmark" ("province", "category", "municipality");
CREATE INDEX IF NOT EXISTS "RegionBenchmark_province_category_idx"
  ON "RegionBenchmark" ("province", "category");
