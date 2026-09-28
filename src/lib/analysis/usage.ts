import { randomUUID } from "node:crypto";
import type { ResponseUsage } from "openai/resources/responses/responses";
import type { AiUsage } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";

const MAX_OUTPUT_TOKENS = 8000;
const INPUT_TOKEN_OVERHEAD = 1024;
export type AiModelPricing = { input: number; cachedInput: number; output: number };

export class AiBudgetExceededError extends Error {
  constructor() { super("AI_DAILY_BUDGET_EXCEEDED"); }
}

function utcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function capMicrousd() {
  return BigInt(Math.floor(env().MAX_DAILY_AI_USD * 1_000_000));
}

function prices(model: string) {
  const value = env().AI_MODEL_PRICING_JSON[model];
  if (!value) throw new Error(`AI_PRICING_MISSING:${model}`);
  return value;
}

function estimatedInputTokens(system: string, data: string) {
  return Buffer.byteLength(system, "utf8") + Buffer.byteLength(data, "utf8") + INPUT_TOKEN_OVERHEAD;
}

export function calculateEstimatedCostMicrousd(price: AiModelPricing, system: string, data: string) {
  return BigInt(Math.ceil(estimatedInputTokens(system, data) * price.input + MAX_OUTPUT_TOKENS * price.output));
}

export function calculateActualCostMicrousd(price: AiModelPricing, usage: ResponseUsage) {
  const cached = usage.input_tokens_details.cached_tokens;
  const uncached = Math.max(0, usage.input_tokens - cached);
  return BigInt(Math.ceil(uncached * price.input + cached * price.cachedInput + usage.output_tokens * price.output));
}

export async function reserveAiUsage(input: { scanId: string; stage: string; model: string; system: string; data: string }) {
  const day = utcDay();
  const reserved = calculateEstimatedCostMicrousd(prices(input.model), input.system, input.data);
  const id = randomUUID();
  const acquired = await db.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "AiDailyBudget" ("day", "spentMicrousd", "reservedMicrousd", "updatedAt") VALUES (${day}, 0, 0, NOW()) ON CONFLICT ("day") DO NOTHING`;
    const changed = await tx.$executeRaw`UPDATE "AiDailyBudget" SET "reservedMicrousd" = "reservedMicrousd" + ${reserved}, "updatedAt" = NOW() WHERE "day" = ${day} AND "spentMicrousd" + "reservedMicrousd" + ${reserved} <= ${capMicrousd()}`;
    if (changed !== 1) return false;
    await tx.aiUsage.create({ data: { id, scanId: input.scanId, day, stage: input.stage, model: input.model, status: "reserved", reservedMicrousd: reserved } });
    return true;
  });
  if (!acquired) throw new AiBudgetExceededError();
  return { id, day, reserved, model: input.model };
}

export async function completeAiUsage(reservation: Awaited<ReturnType<typeof reserveAiUsage>>, usage: ResponseUsage, responseId?: string, requestId?: string) {
  const actual = calculateActualCostMicrousd(prices(reservation.model), usage);
  await db.$transaction([
    db.aiDailyBudget.update({ where: { day: reservation.day }, data: { reservedMicrousd: { decrement: reservation.reserved }, spentMicrousd: { increment: actual } } }),
    db.aiUsage.update({ where: { id: reservation.id }, data: { status: "completed", inputTokens: usage.input_tokens, cachedInputTokens: usage.input_tokens_details.cached_tokens, outputTokens: usage.output_tokens, reasoningTokens: usage.output_tokens_details.reasoning_tokens, totalTokens: usage.total_tokens, actualMicrousd: actual, providerResponseId: responseId, providerRequestId: requestId, completedAt: new Date() } })
  ]);
}

// A dispatched request may still be billed even when no response reaches us.
export async function chargeFailedAiUsage(reservation: Awaited<ReturnType<typeof reserveAiUsage>>) {
  await db.$transaction([
    db.aiDailyBudget.update({ where: { day: reservation.day }, data: { reservedMicrousd: { decrement: reservation.reserved }, spentMicrousd: { increment: reservation.reserved } } }),
    db.aiUsage.update({ where: { id: reservation.id }, data: { status: "estimated_failure", actualMicrousd: reservation.reserved, completedAt: new Date() } })
  ]);
}

export function aggregateAiUsage(rows: Pick<AiUsage, "stage"|"model"|"status"|"inputTokens"|"cachedInputTokens"|"outputTokens"|"reasoningTokens"|"totalTokens"|"reservedMicrousd"|"actualMicrousd">[]) {
  return {
    inputTokens: rows.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
    cachedInputTokens: rows.reduce((sum, row) => sum + (row.cachedInputTokens ?? 0), 0),
    outputTokens: rows.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
    totalTokens: rows.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
    reasoningTokens: rows.reduce((sum, row) => sum + (row.reasoningTokens ?? 0), 0),
    estimatedCostMicrousd: rows.reduce((sum, row) => sum + row.reservedMicrousd, 0n).toString(),
    actualCostMicrousd: rows.reduce((sum, row) => sum + (row.actualMicrousd ?? 0n), 0n).toString(),
    stages: rows.map((row) => ({ stage: row.stage, model: row.model, status: row.status, inputTokens: row.inputTokens, cachedInputTokens: row.cachedInputTokens, outputTokens: row.outputTokens, reasoningTokens: row.reasoningTokens, totalTokens: row.totalTokens, estimatedCostMicrousd: row.reservedMicrousd.toString(), actualCostMicrousd: row.actualMicrousd?.toString() ?? null }))
  };
}

export async function scanUsageSummary(scanId: string) {
  return aggregateAiUsage(await db.aiUsage.findMany({ where: { scanId }, orderBy: { createdAt: "asc" } }));
}

export async function dailyBudgetStatus(blocked: boolean) {
  const day = utcDay();
  const budget = await db.aiDailyBudget.findUnique({ where: { day } });
  const cap = capMicrousd();
  const spent = budget?.spentMicrousd ?? 0n;
  const reserved = budget?.reservedMicrousd ?? 0n;
  const remaining = cap > spent + reserved ? cap - spent - reserved : 0n;
  return { day: day.toISOString().slice(0, 10), accountingTimezone: "UTC", maxMicrousd: cap.toString(), spentMicrousd: spent.toString(), reservedMicrousd: reserved.toString(), remainingMicrousd: remaining.toString(), blocked };
}
