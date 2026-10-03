import { db } from "./lib/db";
import { Prisma } from "@prisma/client";
import { processStaticScan } from "./lib/static-pipeline";
import { processScan } from "./lib/analysis/pipeline";
import { env } from "./lib/env";
import { claimNextJob, releaseJob, renewJobLease, WORKER_LEASE_MS } from "./lib/worker-queue";

let lastCleanup = 0;

async function cleanupExpiredData() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  const cfg = env();
  if(cfg.AI_FEATURE_MODE==="disabled")await db.repositoryScan.updateMany({where:{status:{in:["ai_queued","ai_analyzing","mapping","analyzing","correlating","judging","verifying","challenging"]},staticReportJson:{not:Prisma.JsonNull}},data:{status:"static_complete",progress:100,progressMessage:"Static report ready",aiFailureCode:"AI_DISABLED",aiFailureMessage:"Optional AI analysis is disabled in this release.",workerLeaseId:null,workerLeaseExpiresAt:null}});
  const completedBefore = new Date(now - cfg.REPORT_RETENTION_DAYS * 86_400_000);
  await db.fileRecord.updateMany({ where: { content: { not: null }, rawDeleteAfter: { lte: new Date(now) } }, data: { content: null } });
  await db.repositoryScan.deleteMany({ where: { status: { in: ["static_complete", "completed", "failed", "cancelled"] }, completedAt: { lte: completedBefore } } });
}

async function tick() {
  await cleanupExpiredData();
  const job = await claimNextJob(db,new Date(),undefined,env().AI_FEATURE_MODE!=="disabled");
  if (!job) return;
  const heartbeat = setInterval(() => { void renewJobLease(job).catch(() => undefined); }, WORKER_LEASE_MS / 3);
  heartbeat.unref();
  try { if (job.kind === "static") await processStaticScan(job.id); else await processScan(job.id); }
  finally { clearInterval(heartbeat); await releaseJob(job); }
}

async function main() {
  for (;;) { await tick(); await new Promise((resolve) => setTimeout(resolve, 1500)); }
}

main().catch((error) => { console.error("Worker stopped:", error instanceof Error ? error.message : "unknown error"); process.exit(1); });
