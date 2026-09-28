import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { env } from "../env";

export interface AiProvider {
  structured<T>(input: { stage: string; system: string; data: string; schema: ZodType<T>; model: string }): Promise<T>;
}

export class OpenAiProvider implements AiProvider {
  private client: OpenAI;
  constructor(apiKey = env().OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required outside demo mode.");
    this.client = new OpenAI({ apiKey });
  }
  async structured<T>({ stage, system, data, schema, model }: Parameters<AiProvider["structured"]>[0]): Promise<T> {
    const response = await this.client.responses.parse({
      model,
      temperature: 0,
      max_output_tokens: 8000,
      input: [{ role: "system", content: system }, { role: "user", content: data }],
      text: { format: zodTextFormat(schema, `doublecheck_${stage.replace(/[^A-Za-z0-9_]/g, "_")}`) }
    });
    const result = schema.safeParse(response.output_parsed);
    if (!result.success) throw new Error(`AI_INVALID_SCHEMA:${stage}`);
    return result.data as T;
  }
}
