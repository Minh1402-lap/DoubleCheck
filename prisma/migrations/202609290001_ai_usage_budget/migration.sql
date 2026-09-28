CREATE TABLE "AiDailyBudget" (
  "day" DATE PRIMARY KEY,
  "spentMicrousd" BIGINT NOT NULL DEFAULT 0,
  "reservedMicrousd" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "AiUsage" (
  "id" TEXT PRIMARY KEY,
  "scanId" TEXT NOT NULL REFERENCES "RepositoryScan"("id") ON DELETE CASCADE,
  "day" DATE NOT NULL,
  "stage" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "inputTokens" INTEGER,
  "cachedInputTokens" INTEGER,
  "outputTokens" INTEGER,
  "reasoningTokens" INTEGER,
  "totalTokens" INTEGER,
  "reservedMicrousd" BIGINT NOT NULL,
  "actualMicrousd" BIGINT,
  "providerResponseId" TEXT,
  "providerRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

CREATE INDEX "AiUsage_scanId_createdAt_idx" ON "AiUsage"("scanId", "createdAt");
CREATE INDEX "AiUsage_day_status_idx" ON "AiUsage"("day", "status");
