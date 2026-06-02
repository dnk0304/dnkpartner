-- wave13-hotfix: widen Auction.loteNumber INTEGER -> BIGINT
--
-- BOE legacy lote identifiers can be 15-digit numbers (e.g. 120240073010647)
-- that overflow PG int4 (max 2,147,483,647). Wave13 bounded backfill hit 32
-- `integer out of range` errors on umbrella SUB-RC-2026-0155000330073 (16
-- lotes with 15-digit ids). Widening to BIGINT is additive + lossless:
-- existing int4 values fit in int8 with no data loss.
--
-- Idempotent re-run safe: ALTER COLUMN TYPE BIGINT is a no-op if already
-- bigint. Lands BEFORE the next pending migration on wave14 boot.

ALTER TABLE "Auction" ALTER COLUMN "loteNumber" TYPE BIGINT;
