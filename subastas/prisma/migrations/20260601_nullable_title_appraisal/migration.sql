-- Data-pipeline integrity fix (Ghost, 2026-06-01)
-- title and appraisalValue must be nullable so the scraper can write an honest
-- NULL instead of the literal "Unknown" / a fabricated 0. The app synthesises a
-- display title from municipality+province when title IS NULL, and renders
-- "valoración no disponible" when appraisalValue IS NULL.

ALTER TABLE "Auction" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "Auction" ALTER COLUMN "appraisalValue" DROP NOT NULL;

-- Backfill: NULL out the garbage literals so the app fallback fires.
UPDATE "Auction" SET "title" = NULL WHERE "title" = 'Unknown';
UPDATE "Auction" SET "appraisalValue" = NULL WHERE "appraisalValue" = 0;
