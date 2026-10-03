import { z } from "zod";
import { confidences, severities } from "../types";

const evidenceObject = z.object({
  filePath: z.string().min(1).max(500), lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(), excerpt: z.string().max(8000)
});
export const evidenceSchema = evidenceObject;

export const mapSchema = z.object({
  claimedPurpose: z.string().max(2000), projectType: z.string().max(200),
  technologies: z.array(z.string().max(100)).max(40),
  documentedCommands: z.array(evidenceSchema).max(50),
  entryPoints: z.array(z.string().max(500)).max(100),
  externalServices: z.array(z.string().max(300)).max(50),
  reviewFiles: z.array(z.string().max(500)).max(200),
  missingContext: z.array(z.string().max(500)).max(50)
});

export const observationSchema = evidenceObject.extend({
  id: z.string().min(1).max(100), category: z.string().min(1).max(100),
  capability: z.string().min(1).max(1000), basis: z.enum(["observed", "inferred", "unknown"]),
  severity: z.enum(severities), confidence: z.enum(confidences), trigger: z.string().max(1000).nullable(),
  sources: z.array(z.string().max(500)).max(30).default([]), transforms: z.array(z.string().max(500)).max(30).default([]),
  sinks: z.array(z.string().max(500)).max(30).default([]), relatedFiles: z.array(z.string().max(500)).max(30).default([]),
  benignExplanation: z.string().max(2000).nullable(), resolved: z.boolean().default(false)
});
export const fileAnalysisSchema = z.object({ observations: z.array(observationSchema).max(12), requestedFiles: z.array(z.string()).max(30) });

export const chainSchema = z.object({
  id: z.string(), title: z.string(), severity: z.enum(severities), confidence: z.enum(confidences),
  steps: z.array(z.object({ evidenceId: z.string(), description: z.string() })).min(1).max(30),
  edges: z.array(z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), status: z.enum(["confirmed", "uncertain"]) })).max(30),
  impact: z.string(), materialStepsIntact: z.boolean().default(false)
});
export const correlationSchema = z.object({ chains: z.array(chainSchema).max(30), contradictions: z.array(z.string()).max(30) });

export const intentSchema = z.object({
  comparisons: z.array(z.object({ capability: z.string(), classification: z.enum(["expected", "review", "unexpected", "strongly_inconsistent", "unknown"]), reason: z.string(), evidenceIds: z.array(z.string()) })).max(100)
});

export const judgeSchema = z.object({ verdict: z.enum(["run", "review", "avoid"]), confidence: z.enum(confidences), decisiveEvidenceIds: z.array(z.string()).max(30), reason: z.string(), inspectNext: z.array(z.string()).max(20) });
export const verifierSchema = z.object({ result: z.enum(["confirmed", "partially_confirmed", "not_confirmed"]), unsupportedSteps: z.array(z.string()), benignAlternatives: z.array(z.string()), recommendedSeverity: z.enum(severities), recommendedVerdict: z.enum(["run", "review", "avoid"]), confidence: z.enum(confidences), materialStepsIntact: z.boolean() });
export const challengeSchema = z.object({ result: z.enum(["run_supported", "run_blocked", "insufficient_coverage"]), reasons: z.array(z.string()), evidenceIds: z.array(z.string()) });

export type RepositoryMap = z.infer<typeof mapSchema>;
export type FileAnalysis = z.infer<typeof fileAnalysisSchema>;
