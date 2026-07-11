-- Property-portal Phase 1 (2026-07-11) — Ghost.
-- Additive-ONLY. Ten new nullable columns on "Auction":
--   Leg A (prose parser):  bedrooms, bathrooms, hasTerrace, hasGarden,
--                          hasGarage, hasStorageRoom, floorLevel
--   Leg B (Catastro DNPRC): catastroYearBuilt, catastroUse, catastroCheckedAt
--
-- CREATED, NOT APPLIED — Ken applies on the box via `prisma migrate deploy`
-- FIRST (before the scheduler rebuild), mirroring the wave52 suspensionMotive /
-- wave54 valorSubasta / 20260619 surfaceM2 pattern. Sequencing: AFTER
-- 20260621_notification_dedup_unique (latest migration on the branch).
--
-- WHY (feasibility: ken/PROJECTS/dnksubastas/property-portal-feasibility/
-- GHOST-FINDINGS.md): portal cross-matching is dead; the cheap wins are
--   (A) parse attributes from prose we already store — on the data we scrape
--       today ~30% of active Viviendas state a bedroom count, ~24% a bathroom
--       count, terraza/garaje/trastero/jardín/planta appear in the same
--       registry prose (numbers included: "TRES DORMITORIOS"), zero external
--       calls; and
--   (B) enrich año-construcción / uso / superficie from the free OVC
--       Consulta_DNPRC web service keyed by the 20-char cadastralRef (99% sfc /
--       89% año / 100% uso on rows that have a ref).
--
-- LEG A — SEMANTICS (all HONEST-NULL; absence of a mention is NULL, never
-- 0 / false):
--   "bedrooms"       INT   — dormitorio / alcoba / (numbered) habitación. A bare
--                            singular counts as 1 ONLY inside a distribución
--                            enumeration; an unqualified plural with no number is
--                            NULL (we cannot know how many). e.g. "tres
--                            dormitorios" -> 3.
--   "bathrooms"      INT   — baño + aseo, summed when both enumerated ("baño,
--                            aseo" -> 2; "un cuarto de baño" -> 1).
--   "hasTerrace"     BOOL  — terraza.
--   "hasGarden"      BOOL  — jardín / zona ajardinada.
--   "hasGarage"      BOOL  — garaje / aparcamiento / parking / cochera.
--   "hasStorageRoom" BOOL  — trastero.
--   Booleans persist an explicit FALSE only on a negated mention ("sin garaje");
--   otherwise NULL (no mention ≠ false). NEVER fabricated.
--   "floorLevel"     TEXT  — planta / piso ("bajo", "1", "atico", "sotano"…);
--                            first clear "planta/piso <ordinal|number>" anchor.
--
-- LEG B — SEMANTICS (Catastro; free reuse under Ley 18/2015, attribution DG
-- Catastro):
--   "catastroYearBuilt" INT      — año de construcción (debi.ant).
--   "catastroUse"       TEXT     — uso principal (debi.luso; "Residencial",
--                                  "Almacén-Estacionamiento", …).
--   "catastroCheckedAt" TIMESTAMP — last DNPRC lookup; set on EVERY resolved
--                                  fetch AND on structured errors (cod 4
--                                  malformed / cod 5 no existe) so dead refs are
--                                  not re-hammered daily (re-checked weekly at
--                                  most). superficie (debi.sfc) is written into
--                                  the EXISTING "surfaceM2" ONLY where currently
--                                  NULL — scraped surfaces are never overwritten
--                                  — so it needs no new column here.
--
-- Idempotent (IF NOT EXISTS) so a partial prior apply / local re-run is a no-op.
-- Types match the schema.prisma fields exactly (Int -> INTEGER, Boolean ->
-- BOOLEAN, String -> TEXT, DateTime -> TIMESTAMP(3) to match Prisma's default).
-- The scraper adapter's information_schema guard makes writes safe pre/post
-- migration; existing rows get NULL until Ghost's backfill runs the ACTIVE pool.

-- Leg A — prose attributes
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "bedrooms" INTEGER;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "bathrooms" INTEGER;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "hasTerrace" BOOLEAN;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "hasGarden" BOOLEAN;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "hasGarage" BOOLEAN;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "hasStorageRoom" BOOLEAN;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "floorLevel" TEXT;

-- Leg B — Catastro DNPRC enrichment
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "catastroYearBuilt" INTEGER;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "catastroUse" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "catastroCheckedAt" TIMESTAMP(3);
