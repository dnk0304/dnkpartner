-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('running', 'awaiting_human_gate', 'escalated', 'draft_ready', 'published', 'killed');

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "status" "RunStatus" NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactoryArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactoryArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "loop" INTEGER NOT NULL,
    "round1" JSONB NOT NULL,
    "round2" JSONB NOT NULL,
    "resolution" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "by" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Run_status_idx" ON "Run"("status");

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE INDEX "FactoryArtifact_runId_idx" ON "FactoryArtifact"("runId");

-- CreateIndex
CREATE INDEX "FactoryArtifact_runId_stage_idx" ON "FactoryArtifact"("runId", "stage");

-- CreateIndex
CREATE INDEX "GateLog_runId_idx" ON "GateLog"("runId");

-- CreateIndex
CREATE INDEX "GateLog_runId_stage_idx" ON "GateLog"("runId", "stage");

-- CreateIndex
CREATE INDEX "Decision_runId_idx" ON "Decision"("runId");

-- AddForeignKey
ALTER TABLE "FactoryArtifact" ADD CONSTRAINT "FactoryArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateLog" ADD CONSTRAINT "GateLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

