-- Email preferences on "User" — account panel wave 1 (2026-06-08) — Forge.
-- Additive ONLY. THREE new Boolean columns on "User", each DEFAULT true.
-- CREATED, NOT APPLIED — Ken applies on the box via `prisma migrate deploy`
-- FIRST (before Pixel's UI wave rebases on it), mirroring the wave52
-- suspensionMotive / wave-valorSubasta pattern.
--
-- WHY: the account panel ("Mi cuenta" → /subscription) has a "Preferencias de
-- email" section with 3 checkboxes (boletín de novedades / aviso semanal sin
-- nuevas subastas / radar de subastas). There was NO storage for these prefs
-- anywhere in schema.prisma. These columns are a SETTINGS SURFACE ONLY — they
-- are read/written by GET+PUT /api/user/email-preferences but are NOT yet wired
-- into any email send-path in this wave (wiring is a later wave).
--
-- DEFAULT true on every column means all existing rows are opted-in by the
-- column default — NO data backfill required.
--
-- Idempotent (IF NOT EXISTS) so a partial prior apply or a local re-run is a
-- no-op. Follows the convention set by:
--   20260604_add_suspension_motive
--   20260605_add_valor_subasta
--   20260607_add_vehicle_make_model_year
--
-- Sequencing (Ken applies): AFTER 20260607_add_vehicle_make_model_year.
-- Independent of every prior wave's columns. This is the ONLY schema change in
-- this wave; everything else is new routes (no schema) or column-reuse
-- (Subscription period columns already exist).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "prefNewsletter"  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "prefWeeklyNoNew" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "prefRadar"       BOOLEAN NOT NULL DEFAULT true;
