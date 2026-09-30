ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'static_analyzing';
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'static_complete';
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'ai_queued';
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'ai_analyzing';
ALTER TABLE "RepositoryScan"
  ADD COLUMN "staticRulesetVersion" TEXT NOT NULL DEFAULT '2026-09-30.v1',
  ADD COLUMN "staticReportJson" JSONB,
  ADD COLUMN "staticCompletedAt" TIMESTAMP(3),
  ADD COLUMN "aiReportJson" JSONB,
  ADD COLUMN "aiFailureCode" TEXT,
  ADD COLUMN "aiFailureMessage" TEXT,
  ADD COLUMN "aiRequestedAt" TIMESTAMP(3),
  ADD COLUMN "aiCompletedAt" TIMESTAMP(3);
