import { describe, expect, it } from "vitest";
import { aggregateAiUsage, calculateActualCostMicrousd, calculateEstimatedCostMicrousd } from "../src/lib/analysis/usage";
import { scanFailureDetails } from "../src/lib/analysis/pipeline";
import { GitHubApiError } from "../src/lib/collector/github";

describe("AI usage costing", () => {
  const pricing = { input: 2.5, cachedInput: 1.25, output: 10 };

  it("charges cached input and output at their configured rates", () => {
    expect(calculateActualCostMicrousd(pricing, {
      input_tokens: 1_000,
      input_tokens_details: { cached_tokens: 400 },
      output_tokens: 200,
      output_tokens_details: { reasoning_tokens: 50 },
      total_tokens: 1_200
    })).toBe(4_000n);
  });

  it("reserves the full output allowance and a conservative input bound", () => {
    const reserved = calculateEstimatedCostMicrousd(pricing, "system", "data");
    expect(reserved).toBeGreaterThanOrEqual(160_000n);
  });

  it("uses the configured output ceiling in the reservation estimate",()=>{
    expect(calculateEstimatedCostMicrousd(pricing,"system","data",8_000)).toBeLessThan(calculateEstimatedCostMicrousd(pricing,"system","data",16_000));
  });

  it("aggregates usage and preserves per-stage estimated costs", () => {
    const summary = aggregateAiUsage([
      { stage: "map", model: "model-a", status: "completed", inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, reasoningTokens: 5, totalTokens: 130, reservedMicrousd: 900n, actualMicrousd: 400n },
      { stage: "judge", model: "model-b", status: "completed", inputTokens: 200, cachedInputTokens: 0, outputTokens: 40, reasoningTokens: 10, totalTokens: 240, reservedMicrousd: 1_100n, actualMicrousd: 600n },
      { stage: "file", model: "model-a", status: "estimated_failure", inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, reservedMicrousd: 700n, actualMicrousd: 700n },
      { stage: "verify", model: "model-b", status: "reserved", inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, reservedMicrousd: 300n, actualMicrousd: null }
    ]);
    expect(summary).toMatchObject({inputTokens:300,outputTokens:70,reasoningTokens:15,totalTokens:370,estimatedCostMicrousd:"3000",reservedCostMicrousd:"300",providerConfirmedActualCostMicrousd:"1000",conservativeEstimatedFailureCostMicrousd:"700",applicationCommittedCostMicrousd:"2000",actualCostMicrousd:"1000"});
    expect(summary.stages[0]).toMatchObject({stage:"map",model:"model-a",estimatedCostMicrousd:"900",providerConfirmedActualCostMicrousd:"400",conservativeEstimatedFailureCostMicrousd:"0",actualCostMicrousd:"400"});
    expect(summary.stages[2]).toMatchObject({status:"estimated_failure",providerConfirmedActualCostMicrousd:"0",conservativeEstimatedFailureCostMicrousd:"700",actualCostMicrousd:null});
  });

  it("maps budget rejection to a stable safe scan failure", () => {
    expect(scanFailureDetails(new Error("AI_DAILY_BUDGET_EXCEEDED"))).toEqual({
      status: "failed",
      progressMessage: "Daily AI budget reached",
      failureCode: "AI_DAILY_BUDGET_EXCEEDED",
      failureMessage: "The configured daily AI spending limit has been reached. Try again after 00:00 UTC.",
      budgetExceeded: true
    });
  });
});

describe("GitHub collection failures", () => {
  it("keeps a primary GitHub rate-limit reset time actionable and safe", () => {
    const error = new GitHubApiError("GITHUB_PRIMARY_RATE_LIMIT", "GitHub's primary API rate limit has been reached. The limit resets at 2026-09-30T12:00:00.000Z.", { resetAt: "2026-09-30T12:00:00.000Z" });

    expect(scanFailureDetails(error)).toEqual({
      status: "failed",
      progressMessage: "GitHub API rate limit reached",
      failureCode: "GITHUB_PRIMARY_RATE_LIMIT",
      failureMessage: "GitHub's primary API rate limit has been reached. The limit resets at 2026-09-30T12:00:00.000Z.",
      budgetExceeded: false
    });
  });
});
