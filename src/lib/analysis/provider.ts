import OpenAI from "openai";
import {APIConnectionError,APIConnectionTimeoutError,APIError,ContentFilterFinishReasonError,LengthFinishReasonError} from "openai/error";
import {randomUUID} from "node:crypto";
import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { env } from "../env";
import { chargeFailedAiUsage, completeAiUsage, estimatedInputTokens, reserveAiUsage } from "./usage";

export interface AiProvider {
  structured<T>(input: { stage: string; system: string; data: string; schema: ZodType<T>; model: string }): Promise<T>;
}

export class AiStageError extends Error {
  constructor(
    public readonly code: "AI_SCHEMA_CONFIGURATION"|"AI_INPUT_LIMIT_EXCEEDED"|"AI_PROVIDER_ERROR"|"AI_RESPONSE_TIMEOUT"|"AI_RESPONSE_INCOMPLETE"|"AI_USAGE_MISSING"|"AI_SCHEMA_PARSE_FAILED"|"AI_USAGE_PERSISTENCE_FAILED",
    public readonly stage: string,
    public readonly model: string,
    public readonly httpStatus?: number,
    public readonly providerRequestId?: string,
    public readonly providerResponseId?: string,
    public readonly reasonCode: string="unknown"
  ) { super(code); }
}

export function providerFailure(error: unknown, stage: string, model: string, clientRequestId:string) {
  const value = typeof error === "object" && error !== null ? error as {status?:unknown;request_id?:unknown;requestID?:unknown;response_id?:unknown} : {};
  const status = typeof value.status === "number" ? value.status : undefined;
  const requestId = typeof value.request_id === "string" ? value.request_id : typeof value.requestID === "string"?value.requestID:clientRequestId;
  const responseId=typeof value.response_id==="string"?value.response_id:undefined;
  if(error instanceof APIConnectionTimeoutError)return new AiStageError("AI_RESPONSE_TIMEOUT",stage,model,status,requestId,responseId,"transport_timeout");
  if(error instanceof APIConnectionError)return new AiStageError("AI_PROVIDER_ERROR",stage,model,status,requestId,responseId,"transport_connection");
  if(error instanceof LengthFinishReasonError)return new AiStageError("AI_SCHEMA_PARSE_FAILED",stage,model,status,requestId,responseId,"response_incomplete_max_output");
  if(error instanceof ContentFilterFinishReasonError)return new AiStageError("AI_SCHEMA_PARSE_FAILED",stage,model,status,requestId,responseId,"response_content_filter");
  if(error instanceof APIError)return new AiStageError("AI_PROVIDER_ERROR",stage,model,status,requestId,responseId,"provider_http_error");
  return new AiStageError("AI_PROVIDER_ERROR",stage,model,status,requestId,responseId,"sdk_response_handling");
}

export class OpenAiProvider implements AiProvider {
  private client: OpenAI;
  constructor(private scanId: string, apiKey = env().OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required outside demo mode.");
    this.client = new OpenAI({ apiKey });
  }
  async structured<T>({ stage, system, data, schema, model }: Parameters<AiProvider["structured"]>[0]): Promise<T> {
    let format;
    try {
      format = zodTextFormat(schema, `doublecheck_${stage.replace(/[^A-Za-z0-9_]/g, "_")}`);
    } catch {
      throw new AiStageError("AI_SCHEMA_CONFIGURATION", stage, model,undefined,undefined,undefined,"schema_preflight");
    }
    if(estimatedInputTokens(system,data)>env().AI_MAX_INPUT_TOKENS_PER_REQUEST)throw new AiStageError("AI_INPUT_LIMIT_EXCEEDED",stage,model,undefined,undefined,undefined,"input_limit_exceeded");
    const reservation = await reserveAiUsage({ scanId: this.scanId, stage, model, system, data });
    const clientRequestId=randomUUID();
    let response;
    try {
      response = await this.client.responses.create({
        model,
        max_output_tokens: env().AI_MAX_OUTPUT_TOKENS_PER_REQUEST,
        input: [{ role: "system", content: system }, { role: "user", content: data }],
        text: { format }
      },{headers:{"X-Client-Request-Id":clientRequestId}});
    } catch (error) {
      await chargeFailedAiUsage(reservation);
      throw providerFailure(error, stage, model,clientRequestId);
    }
    if (!response.usage) {
      await chargeFailedAiUsage(reservation);
      throw new AiStageError("AI_USAGE_MISSING", stage, model,undefined,response._request_id??clientRequestId,response.id,"usage_missing");
    }
    try{await completeAiUsage(reservation,response.usage,response.id,response._request_id??undefined);}catch{throw new AiStageError("AI_USAGE_PERSISTENCE_FAILED",stage,model,undefined,response._request_id??clientRequestId,response.id,"usage_persistence");}
    if(response.status==="incomplete")throw new AiStageError("AI_RESPONSE_INCOMPLETE",stage,model,undefined,response._request_id??clientRequestId,response.id,`response_incomplete_${response.incomplete_details?.reason??"unknown"}`);
    if(response.status==="failed")throw new AiStageError("AI_PROVIDER_ERROR",stage,model,undefined,response._request_id??clientRequestId,response.id,`response_failed_${response.error?.code??"unknown"}`);
    if(!response.output_text)throw new AiStageError("AI_SCHEMA_PARSE_FAILED",stage,model,undefined,response._request_id??clientRequestId,response.id,"response_no_output");
    let decoded:unknown;
    try{decoded=JSON.parse(response.output_text)}catch{throw new AiStageError("AI_SCHEMA_PARSE_FAILED",stage,model,undefined,response._request_id??clientRequestId,response.id,"response_json_parse");}
    const result = schema.safeParse(decoded);
    if (!result.success) throw new AiStageError("AI_SCHEMA_PARSE_FAILED", stage, model, undefined, response._request_id ?? clientRequestId,response.id,"application_schema_validation");
    return result.data as T;
  }
}
