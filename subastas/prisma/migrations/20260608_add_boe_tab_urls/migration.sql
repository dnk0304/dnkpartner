-- BOE per-tab source URLs on "Auction" — finished full-run wave (2026-06-08) — Forge.
-- Additive ONLY. FOUR new nullable TEXT columns on "Auction", NO default.
-- CREATED, NOT APPLIED — Ken applies on the box via `prisma migrate deploy`
-- FIRST (before the 28-30 sharded workers launch and before Pixel's card-link
-- read path), mirroring the wave52 suspensionMotive / wave-valorSubasta /
-- 20260608_add_user_email_prefs pattern (schema goes live BEFORE the code that
-- writes/reads it).
--
-- WHY: Dennis wants the 4 per-tab BOE source URLs (Información general / Bienes /
-- Lotes / Pujas) persisted on every auction so Pixel can later render them as
-- outbound links on each card -> extra SEO. The backfill scraper derives all 4
-- deterministically from boeId + ver param and writes them in the same
-- idempotent fetch->enrich->upsert pass. These columns are a STORAGE SURFACE
-- ONLY in this wave — the live app does not READ them yet (Pixel's card UI is a
-- separate later task), so NO app deploy is required.
--
-- SAFE ON 221k LIVE ROWS — metadata-only catalog change, NO heap rewrite:
--   * All 4 are nullable with NO DEFAULT. In Postgres `ADD COLUMN ... TEXT`
--     (nullable, no default) updates only the catalog — it does NOT scan or
--     rewrite the 221,615 existing rows. It takes a brief ACCESS EXCLUSIVE lock
--     only long enough to update pg_attribute (sub-second). This is the one safe
--     ADD COLUMN shape at this row count.
--   * Do NOT add a non-null / volatile default — that WOULD force a full table
--     rewrite under the exclusive lock and block the live app. We want NULL
--     anyway (honest-NULL), so the default is simply omitted.
--   * NO index on these columns — they are outbound link strings, never
--     filtered/joined. Do NOT add indexes.
--
-- Idempotent (IF NOT EXISTS) so a partial prior apply or a re-deploy is a no-op.
-- Follows the convention set by:
--   20260605_add_valor_subasta
--   20260607_add_vehicle_make_model_year
--   20260608_add_user_email_prefs
--
-- Sequencing (Ken applies): AFTER 20260608_add_user_email_prefs. Independent of
-- every prior column. This is the ONLY schema change in this wave.

ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "urlInformacionGeneral" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "urlBienes" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "urlLotes" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "urlPujas" TEXT;
