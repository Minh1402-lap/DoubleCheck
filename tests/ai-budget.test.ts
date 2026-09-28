import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ executeRaw: vi.fn(), create: vi.fn() }));

vi.mock("../src/lib/env", () => ({
  env: () => ({ MAX_DAILY_AI_USD: 0.05, AI_MODEL_PRICING_JSON: { "test-model": { input: 1, cachedInput: 0.1, output: 1 } } })
}));

vi.mock("../src/lib/db", () => ({
  db: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ $executeRaw: mocks.executeRaw, aiUsage: { create: mocks.create } }))
  }
}));

import { reserveAiUsage } from "../src/lib/analysis/usage";

describe("AI daily budget reservations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows and records a request below the budget", async () => {
    mocks.executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const reservation = await reserveAiUsage({ scanId: "scan-1", stage: "map", model: "test-model", system: "system", data: "data" });
    expect(reservation.reserved).toBeGreaterThan(0n);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ scanId: "scan-1", stage: "map", model: "test-model", status: "reserved" });
  });

  it("rejects a request at the budget limit without recording it", async () => {
    mocks.executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    await expect(reserveAiUsage({ scanId: "scan-2", stage: "judge", model: "test-model", system: "system", data: "data" })).rejects.toThrow("AI_DAILY_BUDGET_EXCEEDED");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
