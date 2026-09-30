import { db } from "./lib/db";
import { processStaticScan } from "./lib/static-pipeline";
import { processScan } from "./lib/analysis/pipeline";
import { env } from "./lib/env";

let lastCleanup = 0;

async function cleanupExpiredData() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  const cfg = env();
  const completedBefore = new Date(now - cfg.REPORT_RETENTION_DAYS * 86_400_000);
  await db.fileRecord.updateMany({ where: { content: { not: null }, rawDeleteAfter: { lte: new Date(now) } }, data: { content: null } });
  await db.repositoryScan.deleteMany({ where: { status: { in: ["static_complete", "completed", "failed", "cancelled"] }, completedAt: { lte: completedBefore } } });
}

async function tick() {
  await cleanupExpiredData();
  const job = await db.repositoryScan.findFirst({ where: { status: { in:["queued","ai_queued"] } }, orderBy: { updatedAt: "asc" } });
  if (job) { if (job.status==="queued") await processStaticScan(job.id); else await processScan(job.id); }
}

async function main() {
  for (;;) { await tick(); await new Promise((resolve) => setTimeout(resolve, 1500)); }
}

main().catch((error) => { console.error("Worker stopped:", error instanceof Error ? error.message : "unknown error"); process.exit(1); });
