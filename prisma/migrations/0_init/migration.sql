-- BASELINE migration (Forge, 2026-06-18). Represents the pre-existing
-- auth-only schema that prod already has via `prisma db push`. On the
-- existing prod DB this migration must NOT run (User already exists).
--
-- PROD DEPLOY (Ken): run ONCE before the first `migrate deploy`:
--     npx prisma migrate resolve --applied 0_init
-- which records this baseline as already-applied. Then `migrate deploy`
-- runs only 20260618083000_add_factory_runs (the factory tables).
-- On a FRESH DB both migrations run in order, no resolve needed.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "googleId" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'email',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");