import type { PolicyDecision, PolicyInput } from "./types";

const rank = { informational: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;

export function computeDecision(input: PolicyInput): PolicyDecision {
  const avoidChain = input.chains.find((chain) =>
    rank[chain.severity] >= rank.high &&
    chain.confidence === "high" &&
    chain.edges.every((edge) => edge.status === "confirmed") &&
    chain.evidenceValid &&
    (chain.verifier === "confirmed" || (chain.verifier === "partially_confirmed" && chain.materialStepsIntact))
  );

  if (avoidChain) {
    const verdict = "avoid" as const;
    return {
      verdict,
      confidence: "high",
      decidedBy: "avoid_gate",
      reason: `Verified ${avoidChain.severity} evidence chain: ${avoidChain.title}`,
      avoidGatePassed: true,
      runGateResults: {},
      judgePolicyAgreement: input.judge.verdict === verdict
    };
  }

  const unresolvedHigh = input.observations.some((o) => !o.resolved && rank[o.severity] >= rank.high);
  const unexplainedMedium = input.observations.some((o) => o.severity === "medium" && !o.benignExplanation);
  const gate: Record<string, boolean> = {
    surfaces_inventoried: input.coverage.surfacesInventoried,
    automatic_triggers_analyzed: input.coverage.automaticTriggersAnalyzed,
    workflows_analyzed: input.coverage.workflowsAnalyzed,
    documentation_analyzed: input.coverage.documentationAnalyzed,
    execution_paths_analyzed: input.coverage.executionPathsAnalyzed,
    selected_byte_ratio: input.coverage.selectedByteRatio >= 0.95,
    no_unclassified_autorun: input.coverage.unclassifiedAutoRunCount === 0,
    complete_scan: !input.coverage.partial,
    no_unresolved_high: !unresolvedHigh,
    no_unexplained_medium: !unexplainedMedium,
    challenger_passed: input.challenger === "run_supported",
    no_prompt_injection: !input.promptInjectionFound,
    judge_agrees: input.judge.verdict === "run"
  };
  const failed = Object.entries(gate).find(([, passed]) => !passed);
  if (failed) {
    const verdict = "review" as const;
    return {
      verdict,
      confidence: unresolvedHigh ? "high" : "medium",
      decidedBy: `run_gate_blocker:${failed[0]}`,
      reason: `Run is blocked because ${failed[0].replaceAll("_", " ")} did not pass.`,
      avoidGatePassed: false,
      runGateResults: gate,
      judgePolicyAgreement: input.judge.verdict === verdict
    };
  }

  const confidence = input.coverage.dependencyIntelligence === "complete" &&
    input.trustSignalCount === 0 && !input.pressureAndNewOwner ? "high" : "medium";
  return {
    verdict: "run",
    confidence,
    decidedBy: "run_gate",
    reason: "All deterministic Run gates passed and the independent challenge found no supported blocker.",
    avoidGatePassed: false,
    runGateResults: gate,
    judgePolicyAgreement: true
  };
}
