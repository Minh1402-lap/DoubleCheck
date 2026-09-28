import { describe, expect, it } from "vitest";
import { aggregateAiUsage, calculateActualCostMicrousd, calculateEstimatedCostMicrousd } from "../src/lib/analysis/usage";
import { scanFailureDetails } from "../src/lib/analysis/pipeline";

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
    expect(reserved).toBeGreaterThanOrEqual(80_000n);
  });

  it("aggregates usage and preserves per-stage estimated costs", () => {
    const summary = aggregateAiUsage([
      { stage: "map", model: "model-a", status: "completed", inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, reasoningTokens: 5, totalTokens: 130, reservedMicrousd: 900n, actualMicrousd: 400n },
      { stage: "judge", model: "model-b", status: "completed", inputTokens: 200, cachedInputTokens: 0, outputTokens: 40, reasoningTokens: 10, totalTokens: 240, reservedMicrousd: 1_100n, actualMicrousd: 600n }
    ]);
    expect(summary).toMatchObject({ inputTokens: 300, outputTokens: 70, reasoningTokens: 15, totalTokens: 370, estimatedCostMicrousd: "2000", actualCostMicrousd: "1000" });
    expect(summary.stages[0]).toMatchObject({ stage: "map", model: "model-a", estimatedCostMicrousd: "900", actualCostMicrousd: "400" });
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
