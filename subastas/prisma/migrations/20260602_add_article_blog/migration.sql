-- Feature #9 (Blog) — Phase 9a — Forge
-- Article model + ArticleStatus enum. Created NOT applied (Ken applies as slot #1).
-- Idempotent guards so re-running this migration locally is harmless.

DO $$ BEGIN
  CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Article" (
  "id"                TEXT NOT NULL,
  "slug"              TEXT NOT NULL,
  "title"             TEXT NOT NULL,
  "seoTitle"          TEXT,
  "metaDescription"   TEXT,
  "primaryKeyword"    TEXT,
  "secondaryKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "canonicalUrl"      TEXT,
  "cluster"           TEXT,
  "imageAlt"          TEXT,
  "bodyMarkdown"      TEXT NOT NULL,
  "status"            "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt"       TIMESTAMP(3),
  "authorEmail"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Article_slug_key"               ON "Article" ("slug");
CREATE INDEX        IF NOT EXISTS "Article_status_idx"             ON "Article" ("status");
CREATE INDEX        IF NOT EXISTS "Article_publishedAt_idx"        ON "Article" ("publishedAt");
CREATE INDEX        IF NOT EXISTS "Article_status_publishedAt_idx" ON "Article" ("status", "publishedAt" DESC);
