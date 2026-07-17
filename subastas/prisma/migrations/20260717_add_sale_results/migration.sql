-- Sale-result capture (2026-07-17) — Forge. Additive-ONLY.
--
-- One new enum "SaleResult" + five nullable columns on "Auction". No change to
-- existing columns, no FK, no index, no backfill. Created NOT applied — Ken
-- runs `prisma migrate deploy` on the box. Sequencing: AFTER
-- 20260716_add_region_benchmark (latest migration on the branch).
--
-- The scraper's result-check code is column-guarded; these column names and the
-- enum labels are reproduced VERBATIM from the merged-pending Python adapter.
--
-- Rewrite-safety on the ~237k-row "Auction" table:
--   * ADD COLUMN <nullable>            — metadata-only, no table rewrite.
--   * ADD COLUMN INTEGER NOT NULL DEFAULT 0 — on PG11+ a CONSTANT default is
--     also metadata-only (no rewrite; the default is stored in the catalog).
-- So this migration is instant regardless of table size.
--
-- Column semantics:
--   "saleResult"          — ADJUDICADA | DESIERTA | SIN_RESULTADO; NULL until determined.
--   "soldPrice"           — winning bid in CENTS (BIGINT); NULL for DESIERTA / amount-hidden.
--   "soldDate"            — = endsAt (BOE exposes no true sale timestamp).
--   "resultCheckedAt"     — now() on every result-check pass; also the backfill resume cursor.
--   "resultCheckAttempts" — running attempt count; at attempt-cap the pass sets saleResult=SIN_RESULTADO.

-- CreateEnum
CREATE TYPE "SaleResult" AS ENUM ('ADJUDICADA', 'DESIERTA', 'SIN_RESULTADO');

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "saleResult" "SaleResult",
ADD COLUMN     "soldPrice" BIGINT,
ADD COLUMN     "soldDate" TIMESTAMP(3),
ADD COLUMN     "resultCheckedAt" TIMESTAMP(3),
ADD COLUMN     "resultCheckAttempts" INTEGER NOT NULL DEFAULT 0;
