-- Guia article cover images (2026-07-12) — Forge.
-- Additive-ONLY. One new nullable column on "Article":
--   imageUrl — a URL/path string for the article's cover image. Pairs with the
--   existing nullable "imageAlt" (alt text). Nullable so all 55 already-published
--   rows are untouched; a cluster-themed fallback (src/lib/article-cover.ts) fills
--   the gap at render time until per-article covers are set.
--
-- CREATED, NOT APPLIED — Ken applies on the box via `prisma migrate deploy`.
-- Sequencing: AFTER 20260711_add_property_attrs_catastro (latest migration on the
-- branch). Linear history; zero data loss.
--
-- NOTE: NO authorName/category column — the byline is a fixed "SubastasActivas"
-- string rendered by Pixel via i18n, not per-article DB data.

ALTER TABLE "Article" ADD COLUMN "imageUrl" TEXT;
