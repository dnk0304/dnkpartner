-- CreateTable: NoticiaMonthly — auto-generated monthly per-province recap article.
-- Additive, standalone (no FK), mirrors AuctionOutcomeStats. Safe metadata-only
-- create at current row counts. Ken applies with the wave127 idle-in-transaction
-- pre-check, before the app image flips.
CREATE TABLE "NoticiaMonthly" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "proseEs" TEXT NOT NULL,
    "proseEn" TEXT NOT NULL,
    "statsJson" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticiaMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoticiaMonthly_period_province_key" ON "NoticiaMonthly"("period", "province");

-- CreateIndex
CREATE INDEX "NoticiaMonthly_province_period_idx" ON "NoticiaMonthly"("province", "period");

-- CreateIndex
CREATE INDEX "NoticiaMonthly_period_idx" ON "NoticiaMonthly"("period");

-- CreateIndex
CREATE INDEX "NoticiaMonthly_published_period_idx" ON "NoticiaMonthly"("published", "period");
