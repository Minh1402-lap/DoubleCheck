-- DropForeignKey
ALTER TABLE "AiUsage" DROP CONSTRAINT "AiUsage_scanId_fkey";

-- DropForeignKey
ALTER TABLE "EvidenceChain" DROP CONSTRAINT "EvidenceChain_scanId_fkey";

-- DropForeignKey
ALTER TABLE "FileRecord" DROP CONSTRAINT "FileRecord_scanId_fkey";

-- DropForeignKey
ALTER TABLE "Finding" DROP CONSTRAINT "Finding_scanId_fkey";

-- DropForeignKey
ALTER TABLE "Observation" DROP CONSTRAINT "Observation_scanId_fkey";

-- DropForeignKey
ALTER TABLE "RepositorySnapshot" DROP CONSTRAINT "RepositorySnapshot_scanId_fkey";

-- DropForeignKey
ALTER TABLE "ScanDecision" DROP CONSTRAINT "ScanDecision_scanId_fkey";

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepositoryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositorySnapshot" ADD CONSTRAINT "RepositorySnapshot_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepositoryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileRecord" ADD CONSTRAINT "FileRecord_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepositoryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepositoryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceChain" ADD CONSTRAINT "EvidenceChain_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepositoryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepositoryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanDecision" ADD CONSTRAINT "ScanDecision_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepositoryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ExternalIntelligenceResult_provider_queryType_subject_expiresAt" RENAME TO "ExternalIntelligenceResult_provider_queryType_subject_expir_idx";
