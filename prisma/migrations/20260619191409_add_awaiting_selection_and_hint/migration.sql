-- AlterEnum
ALTER TYPE "RunStatus" ADD VALUE 'awaiting_selection';

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "hint" TEXT;
