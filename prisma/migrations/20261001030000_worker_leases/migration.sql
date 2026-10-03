ALTER TABLE "RepositoryScan"
  ADD COLUMN "workerLeaseId" TEXT,
  ADD COLUMN "workerLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "workerAttempt" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "RepositoryScan_status_workerLeaseExpiresAt_updatedAt_idx"
  ON "RepositoryScan"("status", "workerLeaseExpiresAt", "updatedAt");
