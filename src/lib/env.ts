import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  GITHUB_TOKEN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_ANALYSIS_MODEL: z.string().default(""),
  AI_VERIFIER_MODEL: z.string().default(""),
  AI_FEATURE_MODE: z.enum(["disabled", "local", "server"]).default("disabled"),
  AI_MAX_COST_PER_SCAN_USD: z.coerce.number().positive().default(0.25),
  AI_DAILY_BUDGET_USD: z.coerce.number().positive().default(1),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  AI_MODEL_PRICING_JSON: z.string().min(1).optional().default("{}").transform((raw, ctx) => {
    try {
      return z.record(z.object({
        input: z.number().positive(),
        cachedInput: z.number().nonnegative(),
        output: z.number().positive()
      })).parse(JSON.parse(raw));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "AI_MODEL_PRICING_JSON must map model IDs to positive input/output and non-negative cachedInput USD-per-million prices" });
      return z.NEVER;
    }
  }),
  RAW_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  REPORT_RETENTION_DAYS: z.coerce.number().int().positive().catch(30)
});

export type AppEnv = z.infer<typeof schema>;
export function parseEnv(input: Record<string, string | undefined>): AppEnv { return schema.parse(input); }
let cached: AppEnv | undefined;
export function env(): AppEnv { return cached ??= parseEnv(process.env); }
