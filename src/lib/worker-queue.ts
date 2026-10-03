import { randomUUID } from "node:crypto";
import { db } from "./db";

const STATIC_STATUSES = ["queued", "collecting", "static_analyzing"] as const;
const AI_STATUSES = ["ai_queued", "ai_analyzing", "mapping", "analyzing", "correlating", "judging", "verifying", "challenging"] as const;

type Candidate = { id: string; status: string; staticReportJson: unknown };
type QueueClient = {
  repositoryScan: {
    findFirst(args: unknown): Promise<Candidate | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

export type ClaimedJob = { id: string; kind: "static" | "ai"; leaseId: string };
export const WORKER_LEASE_MS = 120_000;

const availableLease = (now: Date) => ({ OR: [{ workerLeaseId: null }, { workerLeaseExpiresAt: { lte: now } }] });

export async function claimNextJob(client: QueueClient = db, now = new Date(), leaseId: string = randomUUID(), includeAi = true): Promise<ClaimedJob | null> {
  const activeStatuses=includeAi?[...STATIC_STATUSES,...AI_STATUSES]:[...STATIC_STATUSES];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = await client.repositoryScan.findFirst({
      where: { status: { in: activeStatuses }, ...availableLease(now) },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, status: true, staticReportJson: true }
    });
    if (!candidate) return null;
    const claimed = await client.repositoryScan.updateMany({
      where: { id: candidate.id, status: candidate.status, ...availableLease(now) },
      data: { workerLeaseId: leaseId, workerLeaseExpiresAt: new Date(now.getTime() + WORKER_LEASE_MS), workerAttempt: { increment: 1 } }
    });
    if (claimed.count === 1) return { id: candidate.id, kind: candidate.staticReportJson ? "ai" : "static", leaseId };
  }
  return null;
}

export async function renewJobLease(job: ClaimedJob, client: QueueClient = db, now = new Date()) {
  const result = await client.repositoryScan.updateMany({
    where: { id: job.id, workerLeaseId: job.leaseId },
    data: { workerLeaseExpiresAt: new Date(now.getTime() + WORKER_LEASE_MS) }
  });
  return result.count === 1;
}

export async function releaseJob(job: ClaimedJob, client: QueueClient = db) {
  await client.repositoryScan.updateMany({
    where: { id: job.id, workerLeaseId: job.leaseId },
    data: { workerLeaseId: null, workerLeaseExpiresAt: null }
  });
}
