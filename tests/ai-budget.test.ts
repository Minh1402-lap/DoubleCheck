import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ executeRaw: vi.fn(), create: vi.fn(), findMany: vi.fn(), budgetMode: "enforced" }));

vi.mock("../src/lib/env", () => ({
  env: () => ({ AI_BUDGET_MODE:mocks.budgetMode, AI_DAILY_BUDGET_USD: 0.05, AI_MAX_COST_PER_SCAN_USD: 0.25, AI_MAX_OUTPUT_TOKENS_PER_REQUEST:16_000, AI_MODEL_PRICING_JSON: { "test-model": { input: 1, cachedInput: 0.1, output: 1 }, "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 } } })
}));

vi.mock("../src/lib/db", () => ({
  db: {
    $executeRaw: mocks.executeRaw,
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ $executeRaw: mocks.executeRaw, aiUsage: { create: mocks.create, findMany: mocks.findMany } }))
  }
}));

import { calculateEstimatedCostMicrousd, modelPricing, reserveAiUsage, settleOutstandingScanReservations } from "../src/lib/analysis/usage";

describe("AI daily budget reservations", () => {
  beforeEach(() => {vi.clearAllMocks();mocks.budgetMode="enforced";});
  afterEach(()=>vi.unstubAllEnvs());

  it("allows and records a request below the budget", async () => {
    mocks.findMany.mockResolvedValue([]); mocks.executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const reservation = await reserveAiUsage({ scanId: "scan-1", stage: "map", model: "test-model", system: "system", data: "data" });
    expect(reservation.reserved).toBeGreaterThan(0n);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ scanId: "scan-1", stage: "map", model: "test-model", status: "reserved" });
  });

  it("rejects a request at the budget limit without recording it", async () => {
    mocks.findMany.mockResolvedValue([]); mocks.executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    await expect(reserveAiUsage({ scanId: "scan-2", stage: "judge", model: "test-model", system: "system", data: "data" })).rejects.toThrow("AI_DAILY_BUDGET_EXCEEDED");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a request that would exceed the per-scan cap", async () => {
    mocks.findMany.mockResolvedValue([{ status: "completed", reservedMicrousd: 245_000n, actualMicrousd: 245_000n }]);
    await expect(reserveAiUsage({ scanId: "scan-3", stage: "file", model: "test-model", system: "system", data: "data" })).rejects.toThrow("AI_SCAN_BUDGET_EXCEEDED");
    expect(mocks.executeRaw).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });

  it("records reservations without blocking in local observe mode",async()=>{
    mocks.budgetMode="observe";mocks.findMany.mockResolvedValue([{status:"completed",reservedMicrousd:245_000n,actualMicrousd:245_000n}]);mocks.executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(reserveAiUsage({scanId:"scan-observe",stage:"file",model:"test-model",system:"system",data:"data"})).resolves.toBeDefined();
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("always enforces limits in production",async()=>{
    mocks.budgetMode="observe";vi.stubEnv("NODE_ENV","production");mocks.findMany.mockResolvedValue([{status:"completed",reservedMicrousd:245_000n,actualMicrousd:245_000n}]);
    await expect(reserveAiUsage({scanId:"scan-prod",stage:"file",model:"test-model",system:"system",data:"data"})).rejects.toThrow("AI_SCAN_BUDGET_EXCEEDED");
  });

  it("settles only outstanding reservations through one idempotent database statement",async()=>{
    mocks.executeRaw.mockResolvedValue(1);
    await settleOutstandingScanReservations("scan-failed");
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
  });

  it("resolves Terra pricing with USD-per-million units", () => {
    expect(modelPricing("gpt-5.6-terra")).toEqual({ input: 2, cachedInput: 0.2, output: 12 });
  });

  it("rejects an unknown model", () => {
    expect(() => modelPricing("unknown-model")).toThrow("AI_PRICING_MISSING:unknown-model");
  });

  it("calculates the conservative Terra reservation", () => {
    expect(calculateEstimatedCostMicrousd(modelPricing("gpt-5.6-terra"), "system", "data")).toBe(194_068n);
  });
});
