export const severities = ["informational", "low", "medium", "high", "critical"] as const;
export const confidences = ["low", "medium", "high"] as const;
export type Severity = (typeof severities)[number];
export type Confidence = (typeof confidences)[number];
export type Verdict = "run" | "review" | "avoid";

export interface EvidenceRef {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  excerpt: string;
}

export interface NormalizedObservation extends EvidenceRef {
  id: string;
  category: string;
  capability: string;
  basis: "observed" | "inferred" | "unknown";
  severity: Severity;
  confidence: Confidence;
  trigger?: string;
  sources: string[];
  transforms: string[];
  sinks: string[];
  relatedFiles: string[];
  benignExplanation?: string;
  evidenceValid: boolean;
  resolved: boolean;
}

export interface Chain {
  id: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  steps: Array<{ evidenceId: string; description: string }>;
  edges: Array<{ from: number; to: number; status: "confirmed" | "uncertain" }>;
  evidenceValid: boolean;
  verifier: "confirmed" | "partially_confirmed" | "not_confirmed" | "unavailable";
  materialStepsIntact: boolean;
}

export interface CoverageGate {
  surfacesInventoried: boolean;
  automaticTriggersAnalyzed: boolean;
  workflowsAnalyzed: boolean;
  documentationAnalyzed: boolean;
  executionPathsAnalyzed: boolean;
  selectedByteRatio: number;
  unclassifiedAutoRunCount: number;
  partial: boolean;
  dependencyIntelligence: "complete" | "unavailable" | "partial";
  blockers: string[];
}

export interface PolicyInput {
  chains: Chain[];
  observations: NormalizedObservation[];
  coverage: CoverageGate;
  challenger: "run_supported" | "run_blocked" | "insufficient_coverage" | "unavailable";
  judge: { verdict: Verdict; confidence: Confidence };
  promptInjectionFound: boolean;
  trustSignalCount: number;
  pressureAndNewOwner: boolean;
}

export interface PolicyDecision {
  verdict: Verdict;
  confidence: Confidence;
  decidedBy: string;
  reason: string;
  avoidGatePassed: boolean;
  runGateResults: Record<string, boolean>;
  judgePolicyAgreement: boolean;
}

export const STATIC_DISCLAIMER =
  "DoubleCheck performs static AI-assisted analysis and may miss malicious, generated, encrypted, binary, runtime-only, or environment-dependent behavior. A Run recommendation is not a guarantee of safety.";
