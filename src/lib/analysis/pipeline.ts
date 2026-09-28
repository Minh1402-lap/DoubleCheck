import { db } from "../db";
import type { Prisma } from "@prisma/client";
import { env } from "../env";
import { GitHubCollector } from "../collector/github";
import { extractDocumentedCommands } from "../commands";
import { verifyEvidence } from "../evidence";
import { computeDecision } from "../policy";
import type { Chain, CoverageGate, NormalizedObservation } from "../types";
import { STATIC_DISCLAIMER } from "../types";
import { OpenAiProvider, type AiProvider } from "./provider";
import { envelope, prompts } from "./prompts";
import { challengeSchema, correlationSchema, fileAnalysisSchema, intentSchema, judgeSchema, mapSchema, verifierSchema } from "./schemas";

async function progress(id: string, status: "collecting"|"mapping"|"analyzing"|"correlating"|"judging"|"verifying"|"challenging", percent: number, message: string) {
  await db.repositoryScan.update({ where: { id }, data: { status, progress: percent, progressMessage: message } });
}

function batch<T>(items: T[], size: number): T[][] { const out: T[][] = []; for (let i=0;i<items.length;i+=size) out.push(items.slice(i,i+size)); return out; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

export async function processScan(scanId: string, provider?: AiProvider) {
  const scan = await db.repositoryScan.findUniqueOrThrow({ where: { id: scanId } });
  const cfg = env();
  try {
    await db.repositoryScan.update({ where: { id: scanId }, data: { startedAt: new Date() } });
    await progress(scanId, "collecting", 8, "Collecting immutable repository snapshot");
    const collected = await new GitHubCollector().collect(scan.owner, scan.repository, scan.requestedRef ?? undefined);
    if ((await db.repositoryScan.findUniqueOrThrow({ where: { id: scanId } })).cancelRequestedAt) throw new Error("CANCELLED");
    const rawDeleteAfter = new Date(Date.now() + cfg.RAW_RETENTION_HOURS * 3_600_000);
    await db.$transaction([
      db.repositoryScan.update({ where: { id: scanId }, data: { defaultBranch: collected.defaultBranch, commitSha: collected.sha } }),
      db.repositorySnapshot.create({ data: { scanId, repositoryJson: collected.repository, ownerJson: collected.owner, inventoryCount: collected.coverage.inventoryCount, inventoryBytes: collected.coverage.inventoryBytes, selectedBytes: collected.coverage.selectedBytes, skippedJson: collected.files.filter((f) => !f.selected).map(({path,size,skipReason}) => ({path,size,skipReason})), coverageJson: collected.coverage, commandsJson: [], dependenciesJson: [], mapJson: {}, intentJson: [], rawDeleteAfter } }),
      ...collected.files.map((f) => db.fileRecord.create({ data: { scanId, path: f.path, contentHash: f.hash, typeGuess: f.type, size: f.size, selected: f.selected, skipReason: f.skipReason, priorityReasons: f.priorityReasons, content: f.content, rawDeleteAfter: f.content ? rawDeleteAfter : undefined } }))
    ]);
    const ai = provider ?? new OpenAiProvider();
    const fileMap = new Map(collected.files.filter((f) => f.content !== undefined).map((f) => [f.path, f.content!]));
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
    await db.$transaction([
      ...chains.map((c) => db.evidenceChain.create({ data: { scanId, title: c.title, stepsJson: c.steps, edgesJson: c.edges, impact: correlated.chains.find((x) => x.id === c.id)?.impact ?? "", severity: c.severity, confidence: c.confidence, evidenceValid: c.evidenceValid, verificationResult: c.verifier } })),
      db.scanDecision.create({ data: { scanId, recommendation: decision.verdict, confidence: decision.confidence, decidedBy: decision.decidedBy, judgeProposal: judge.verdict, judgeConfidence: judge.confidence, judgePolicyAgreement: decision.judgePolicyAgreement, disagreementReason: decision.judgePolicyAgreement ? undefined : "The deterministic safety policy overrode the AI proposal.", primaryReason: decision.reason, decisiveFindingIds: json(judge.decisiveEvidenceIds), commandsJson: json(commands), precautionsJson: ["inspect_automatic_triggers", "use_disposable_environment"], nextStepsJson: json(judge.inspectNext), disclaimer: STATIC_DISCLAIMER, gatesJson: json({ decision, challenger, verifier: chains.map((c) => ({ id: c.id, result: c.verifier })) }) } }),
      db.repositoryScan.update({ where: { id: scanId }, data: { status: "completed", progress: 100, progressMessage: "Analysis complete", completeness: partial ? "partial" : "complete", completedAt: new Date() } })
    ]);
  } catch (error) {
    const cancelled = error instanceof Error && error.message === "CANCELLED";
    await db.repositoryScan.update({ where: { id: scanId }, data: { status: cancelled ? "cancelled" : "failed", progressMessage: cancelled ? "Scan cancelled" : "Scan failed safely", failureCode: cancelled ? "CANCELLED" : "ANALYSIS_FAILED", failureMessage: error instanceof Error && /^(PRIVATE_REPOSITORY|AI_INVALID_|CANCELLED)/.test(error.message) ? error.message : "The scan could not be completed. No repository code was executed.", completedAt: new Date() } });
  }
}
