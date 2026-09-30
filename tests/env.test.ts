import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const base = {
  DATABASE_URL: "postgresql://postgres:password@127.0.0.1:5432/doublecheck",
  AI_ANALYSIS_MODEL: "gpt-5.6-terra",
  AI_VERIFIER_MODEL: "gpt-5-mini",
  SESSION_SECRET: "a-secure-test-session-secret-over-32-characters",
  DEMO_MODE: "false",
  AI_MODEL_PRICING_JSON: '{"gpt-5.6-terra":{"input":2,"cachedInput":0.2,"output":12},"gpt-5-mini":{"input":0.25,"cachedInput":0.025,"output":2}}'
};

describe("AI model pricing environment", () => {
  it("allows static-only startup without AI models or a key", () => {
    const parsed=parseEnv({DATABASE_URL:base.DATABASE_URL,SESSION_SECRET:base.SESSION_SECRET,DEMO_MODE:"false"});expect(parsed.AI_FEATURE_MODE).toBe("disabled");expect(parsed.AI_ANALYSIS_MODEL).toBe("");expect(parsed.AI_VERIFIER_MODEL).toBe("");
  });
  it("parses pricing for both configured models", () => {
    const parsed = parseEnv(base);
    expect(parsed.AI_MODEL_PRICING_JSON[parsed.AI_ANALYSIS_MODEL]).toEqual({ input: 2, cachedInput: 0.2, output: 12 });
    expect(parsed.AI_MODEL_PRICING_JSON[parsed.AI_VERIFIER_MODEL]).toEqual({ input: 0.25, cachedInput: 0.025, output: 2 });
  });

  it("rejects malformed pricing JSON", () => {
    expect(() => parseEnv({ ...base, AI_MODEL_PRICING_JSON: "{" })).toThrow("AI_MODEL_PRICING_JSON must map model IDs");
  });
});
