import { db } from "../db";
import type { Prisma } from "@prisma/client";
import { env } from "../env";
import { GitHubApiError } from "../collector/github";
import { extractDocumentedCommands } from "../commands";
import { verifyEvidence } from "../evidence";
import { computeDecision } from "../policy";
import type { Chain, CoverageGate, NormalizedObservation } from "../types";
import { STATIC_DISCLAIMER } from "../types";
import { OpenAiProvider, type AiProvider } from "./provider";
import { dailyBudgetStatus, scanUsageSummary } from "./usage";
import { envelope, prompts } from "./prompts";
import { challengeSchema, correlationSchema, fileAnalysisSchema, intentSchema, judgeSchema, mapSchema, verifierSchema } from "./schemas";

async function progress(id: string, status: "collecting"|"mapping"|"analyzing"|"correlating"|"judging"|"verifying"|"challenging", percent: number, message: string) {
  await db.repositoryScan.update({ where: { id }, data: { status, progress: percent, progressMessage: message } });
}

function batch<T>(items: T[], size: number): T[][] { const out: T[][] = []; for (let i=0;i<items.length;i+=size) out.push(items.slice(i,i+size)); return out; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

export function scanFailureDetails(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "CANCELLED") return { status: "cancelled" as const, progressMessage: "Scan cancelled", failureCode: "CANCELLED", failureMessage: "CANCELLED", budgetExceeded: false };
  if (message === "AI_DAILY_BUDGET_EXCEEDED") return { status: "failed" as const, progressMessage: "Daily AI budget reached", failureCode: "AI_DAILY_BUDGET_EXCEEDED", failureMessage: "The configured daily AI spending limit has been reached. Try again after 00:00 UTC.", budgetExceeded: true };
  if (message === "AI_SCAN_BUDGET_EXCEEDED") return { status: "failed" as const, progressMessage: "Per-scan AI budget reached", failureCode: "AI_SCAN_BUDGET_EXCEEDED", failureMessage: "Optional AI analysis stopped before exceeding the configured per-scan cost limit.", budgetExceeded: true };
  const providerStatus=typeof error==="object"&&error!==null&&"status" in error&&typeof error.status==="number"?error.status:undefined;
  if(providerStatus){const detail=message.replace(/sk-[A-Za-z0-9_-]+/g,"[redacted]").slice(0,400);return {status:"failed" as const,progressMessage:"AI provider request failed",failureCode:"AI_PROVIDER_ERROR",failureMessage:`The AI provider rejected the request (HTTP ${providerStatus}). ${detail}`,budgetExceeded:false};}
  if (error instanceof GitHubApiError) {
    const progressMessage: Record<string, string> = {
      GITHUB_TOKEN_MISSING: "GitHub token is not configured",
      GITHUB_TOKEN_INVALID: "GitHub authentication failed",
      GITHUB_PERMISSION_DENIED: "GitHub access denied",
      GITHUB_PRIMARY_RATE_LIMIT: "GitHub API rate limit reached",
      GITHUB_SECONDARY_RATE_LIMIT: "GitHub API temporarily throttled",
      GITHUB_REPOSITORY_NOT_FOUND: "Repository not found",
      GITHUB_PRIVATE_REPOSITORY: "Private repository not supported",
      GITHUB_API_ERROR: "GitHub API request failed"
    };
    return { status: "failed" as const, progressMessage: progressMessage[error.code], failureCode: error.code, failureMessage: error.message, budgetExceeded: false };
  }
  const safeMessage = /^(PRIVATE_REPOSITORY|AI_INVALID_|AI_PRICING_MISSING:)/.test(message) ? message : "The scan could not be completed. No repository code was executed.";
  return { status: "failed" as const, progressMessage: "Scan failed safely", failureCode: "ANALYSIS_FAILED", failureMessage: safeMessage, budgetExceeded: false };
}

export async function processScan(scanId: string, provider?: AiProvider) {
  const scan = await db.repositoryScan.findUniqueOrThrow({ where: { id: scanId } });
  const cfg = env();
  try {
    if (!scan.staticReportJson || !scan.commitSha) throw new Error("STATIC_REPORT_REQUIRED");
    await db.repositoryScan.update({ where: { id: scanId }, data: { status:"ai_analyzing", progress: 5, progressMessage:"Optional AI analysis started", aiFailureCode:null, aiFailureMessage:null } });
    const records=await db.fileRecord.findMany({where:{scanId}}); const snap=await db.repositorySnapshot.findUniqueOrThrow({where:{scanId}});
    type AiCollected={defaultBranch:string|null;sha:string;repository:unknown;owner:unknown;coverage:{inventoryCount:number;inventoryBytes:number;selectedBytes:number;inventoryTruncated:boolean};unclassified:string[];files:Array<{path:string;size:number;type:string;selected:boolean;priorityReasons:string[];skipReason:string|null;content:string|null;hash:string|null}>};
    const collected:AiCollected={defaultBranch:scan.defaultBranch,sha:scan.commitSha,repository:snap.repositoryJson,owner:snap.ownerJson,coverage:snap.coverageJson as AiCollected["coverage"],unclassified:[],files:records.map(f=>({path:f.path,size:f.size,type:f.typeGuess,selected:f.selected,priorityReasons:Array.isArray(f.priorityReasons)?f.priorityReasons.filter((x):x is string=>typeof x==="string"):[],skipReason:f.skipReason,content:f.content,hash:f.contentHash}))};
    if ((await db.repositoryScan.findUniqueOrThrow({ where: { id: scanId } })).cancelRequestedAt) throw new Error("CANCELLED");
    const ai = provider ?? new OpenAiProvider(scanId);
    const fileMap = new Map<string,string>(collected.files.filter((f) => typeof f.content === "string").map((f) => [f.path, f.content as string]));
    const commands = [...fileMap].flatMap(([path, content]) => extractDocumentedCommands(path, content));
    await db.repositorySnapshot.update({ where: { scanId }, data: { commandsJson: json(commands) } });

    await progress(scanId, "mapping", 22, "Mapping project intent and execution instructions");
    const map = await ai.structured({ stage: "map", system: prompts.map, model: cfg.AI_ANALYSIS_MODEL, schema: mapSchema, data: envelope({ metadata: collected.repository, inventory: collected.files.map(({path,size,type,selected,priorityReasons}) => ({path,size,type,selected,priorityReasons})), documentation: [...fileMap].filter(([p]) => /readme|\.md$/i.test(p)).slice(0,20) }) });
    await db.repositorySnapshot.update({ where: { scanId }, data: { mapJson: json(map) } });

    await progress(scanId, "analyzing", 38, "Reviewing security-relevant files");
    const observations: NormalizedObservation[] = [];
    for (const group of batch([...fileMap].map(([path, content]) => ({ path, lines: content.split("\n").map((text, i) => ({ number: i + 1, text })) })), 8)) {
      const result = await ai.structured({ stage: "file", system: prompts.file, model: cfg.AI_ANALYSIS_MODEL, schema: fileAnalysisSchema, data: envelope({ repositoryMap: map, files: group }) });
      for (const item of result.observations) observations.push({ ...item, sources: item.sources ?? [], transforms: item.transforms ?? [], sinks: item.sinks ?? [], relatedFiles: item.relatedFiles ?? [], resolved: item.resolved ?? false, evidenceValid: verifyEvidence(item, fileMap) });
    }
    const validObservations = observations.filter((o) => o.evidenceValid);
    await db.$transaction(validObservations.map((o) => db.observation.create({ data: { scanId, filePath: o.filePath, lineStart: o.lineStart, lineEnd: o.lineEnd, excerpt: o.excerpt, category: o.category, capability: o.capability, basis: o.basis, severity: o.severity, confidence: o.confidence, detailsJson: json(o), evidenceValid: true } })));

    await progress(scanId, "correlating", 61, "Connecting behavior across files");
    const correlated = await ai.structured({ stage: "correlate", system: prompts.correlate, model: cfg.AI_ANALYSIS_MODEL, schema: correlationSchema, data: envelope({ map, observations: validObservations }) });
    const intent = await ai.structured({ stage: "intent", system: prompts.intent, model: cfg.AI_ANALYSIS_MODEL, schema: intentSchema, data: envelope({ claimedPurpose: map.claimedPurpose, observations: validObservations, chains: correlated.chains }) });
    await db.repositorySnapshot.update({ where: { scanId }, data: { intentJson: json(intent) } });
    const chains: Chain[] = correlated.chains.map((c) => ({ ...c, evidenceValid: c.steps.every((s) => validObservations.some((o) => o.id === s.evidenceId)), verifier: "unavailable", materialStepsIntact: false }));

    await progress(scanId, "judging", 74, "Producing an evidence-based proposal");
    const judge = await ai.structured({ stage: "judge", system: prompts.judge, model: cfg.AI_ANALYSIS_MODEL, schema: judgeSchema, data: envelope({ map, observations: validObservations, chains, coverage: collected.coverage }) });
    const avoidCandidates = chains.filter((c) => ["high","critical"].includes(c.severity) && c.confidence === "high" && c.evidenceValid && c.edges.every((e) => e.status === "confirmed"));
    if (avoidCandidates.length) {
      await progress(scanId, "verifying", 82, "Independently verifying high-risk evidence");
      for (const candidate of avoidCandidates) {
        const result = await ai.structured({ stage: "verify", system: prompts.verify, model: cfg.AI_VERIFIER_MODEL, schema: verifierSchema, data: envelope({ chain: candidate, evidence: validObservations.filter((o) => candidate.steps.some((s) => s.evidenceId === o.id)) }) });
        candidate.verifier = result.result; candidate.materialStepsIntact = result.materialStepsIntact;
      }
    }
    const partial = collected.coverage.inventoryTruncated || collected.files.some((f) => !f.selected && f.priorityReasons.length > 0);
    const coverage: CoverageGate = { surfacesInventoried: !collected.coverage.inventoryTruncated, automaticTriggersAnalyzed: !collected.files.some((f) => !f.selected && f.priorityReasons.includes("automatic_or_configuration_surface")), workflowsAnalyzed: !collected.files.some((f) => !f.selected && f.path.startsWith(".github/workflows/")), documentationAnalyzed: !collected.files.some((f) => !f.selected && /readme|\.md$/i.test(f.path)), executionPathsAnalyzed: !partial, selectedByteRatio: collected.coverage.inventoryBytes ? collected.coverage.selectedBytes / collected.coverage.inventoryBytes : 1, unclassifiedAutoRunCount: collected.unclassified.length, partial, dependencyIntelligence: "unavailable", blockers: [] };
    let challenger: "run_supported"|"run_blocked"|"insufficient_coverage"|"unavailable" = "unavailable";
    if (!avoidCandidates.some((c) => c.verifier === "confirmed" || (c.verifier === "partially_confirmed" && c.materialStepsIntact))) {
      await progress(scanId, "challenging", 88, "Challenging the proposed Run decision");
      const audit = collected.files.filter((f) => !f.selected && !f.skipReason?.includes("binary")).sort((a,b) => a.path.localeCompare(b.path)).slice(0,15);
      const challenge = await ai.structured({ stage: "challenge", system: prompts.challenge, model: cfg.AI_VERIFIER_MODEL, schema: challengeSchema, data: envelope({ proposed: judge, map, observations: validObservations, coverage, unselected: collected.files.filter((f) => !f.selected).map(({path,size,type,skipReason}) => ({path,size,type,skipReason})), unclassified: collected.unclassified, seededAuditSample: audit.map(({path,size,type}) => ({path,size,type})), seed: scanId }) });
      challenger = challenge.result;
    }
    const decision = computeDecision({ chains, observations: validObservations, coverage, challenger, judge, promptInjectionFound: validObservations.some((o) => o.category === "prompt_injection_attempt"), trustSignalCount: 0, pressureAndNewOwner: false });
    const usage = await scanUsageSummary(scanId);const budget = await dailyBudgetStatus(false);
    const aiReport=json({version:1,models:{analysis:cfg.AI_ANALYSIS_MODEL,verifier:cfg.AI_VERIFIER_MODEL},map,observations:validObservations,chains,decision,judge,usage});
    await db.$transaction([
      ...chains.map((c) => db.evidenceChain.create({ data: { scanId, title: c.title, stepsJson: c.steps, edgesJson: c.edges, impact: correlated.chains.find((x) => x.id === c.id)?.impact ?? "", severity: c.severity, confidence: c.confidence, evidenceValid: c.evidenceValid, verificationResult: c.verifier } })),
      db.scanDecision.create({ data: { scanId, recommendation: decision.verdict, confidence: decision.confidence, decidedBy: decision.decidedBy, judgeProposal: judge.verdict, judgeConfidence: judge.confidence, judgePolicyAgreement: decision.judgePolicyAgreement, disagreementReason: decision.judgePolicyAgreement ? undefined : "The deterministic safety policy overrode the AI proposal.", primaryReason: decision.reason, decisiveFindingIds: json(judge.decisiveEvidenceIds), commandsJson: json(commands), precautionsJson: ["inspect_automatic_triggers", "use_disposable_environment"], nextStepsJson: json(judge.inspectNext), disclaimer: STATIC_DISCLAIMER, gatesJson: json({ decision, challenger, verifier: chains.map((c) => ({ id: c.id, result: c.verifier })) }) } }),
      db.repositoryScan.update({ where: { id: scanId }, data: { status: "completed", progress: 100, progressMessage: "Optional AI analysis complete", completeness: partial ? "partial" : "complete", completedAt: new Date(), aiCompletedAt:new Date(), aiReportJson:aiReport, usageJson: json(usage), budgetJson: json(budget) } })
    ]);
  } catch (error) {
    const failure = scanFailureDetails(error);
    console.error(`[worker] Scan ${scan.publicId} failed: ${failure.failureCode}`);
    const usage = await scanUsageSummary(scanId);
    const budget = await dailyBudgetStatus(failure.budgetExceeded);
    await db.repositoryScan.update({ where: { id: scanId }, data: { status: scan.staticReportJson?"static_complete":failure.status, progress:100, progressMessage: scan.staticReportJson?"Static report ready; optional AI failed":failure.progressMessage, aiFailureCode:failure.failureCode, aiFailureMessage:failure.failureMessage, usageJson: json(usage), budgetJson: json(budget), aiCompletedAt:new Date() } });
  }
}
