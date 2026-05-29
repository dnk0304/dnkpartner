-- pg_trgm GIN indexes for keyword search at scale (229k rows).
-- Audit §5 required these; Prisma can't express pg_trgm/gin_trgm_ops natively.
-- Idempotent: extensions and indexes use IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE INDEX IF NOT EXISTS "Auction_title_trgm_idx"
  ON "Auction" USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Auction_propertyDescription_trgm_idx"
  ON "Auction" USING gin ("propertyDescription" gin_trgm_ops);
