import {describe,expect,it} from "vitest";
import {zodTextFormat} from "openai/helpers/zod";
import {fileAnalysisSchema,observationSchema} from "../src/lib/analysis/schemas";
import {prompts} from "../src/lib/analysis/prompts";
import {AiStageError,providerFailure} from "../src/lib/analysis/provider";
import {APIConnectionError,APIConnectionTimeoutError} from "openai/error";
import {scanFailureDetails} from "../src/lib/analysis/pipeline";

describe("AI structured output schema",()=>{
  it("converts the file-analysis schema without unsupported optional fields",()=>{
    expect(()=>zodTextFormat(fileAnalysisSchema,"doublecheck_file")).not.toThrow();
    const parsed=fileAnalysisSchema.parse({observations:[{filePath:"src/a.ts",lineStart:1,lineEnd:1,excerpt:"fetch(url)",id:"o1",category:"network",capability:"fetches data",basis:"observed",severity:"low",confidence:"high",trigger:null,sources:[],transforms:[],sinks:[],relatedFiles:[],benignExplanation:null,resolved:false}],requestedFiles:[]});
    expect(parsed.observations[0]).toMatchObject({trigger:null,benignExplanation:null});
  });

  it("keeps file-stage output concise in both prompt and schema",()=>{
    const observation=observationSchema.parse({filePath:"src/a.ts",lineStart:1,lineEnd:1,excerpt:"fetch(url)",id:"o1",category:"network",capability:"fetches data",basis:"observed",severity:"low",confidence:"high",trigger:null,sources:[],transforms:[],sinks:[],relatedFiles:[],benignExplanation:null,resolved:false});
    expect(prompts.file).toContain("at most 12 strongest distinct observations");
    expect(fileAnalysisSchema.safeParse({observations:Array.from({length:12},(_,index)=>({...observation,id:`o${index}`})),requestedFiles:[]}).success).toBe(true);
    expect(fileAnalysisSchema.safeParse({observations:Array.from({length:13},(_,index)=>({...observation,id:`o${index}`})),requestedFiles:[]}).success).toBe(false);
  });

  it("exposes a safe, specific failure for local schema construction",()=>{
    const failure=scanFailureDetails(new AiStageError("AI_SCHEMA_CONFIGURATION","file","gpt-5-mini"));
    expect(failure).toMatchObject({failureCode:"AI_SCHEMA_CONFIGURATION",failureMessage:"The AI request schema is incompatible with structured output."});
  });

  it("classifies transport errors without copying sensitive messages",()=>{
    const connection=providerFailure(new APIConnectionError({message:"Connection error.",cause:new Error("private transport detail")}),"file","gpt-5-mini","client-id");
    expect(connection).toMatchObject({code:"AI_PROVIDER_ERROR",stage:"file",model:"gpt-5-mini",providerRequestId:"client-id",reasonCode:"transport_connection"});
    const timeout=providerFailure(new APIConnectionTimeoutError(),"file","gpt-5-mini","timeout-id");
    expect(timeout).toMatchObject({code:"AI_RESPONSE_TIMEOUT",providerRequestId:"timeout-id",reasonCode:"transport_timeout"});
    expect(connection.message).not.toContain("private transport detail");
  });

  it("reports incomplete output separately from schema validation",()=>{
    const failure=scanFailureDetails(new AiStageError("AI_RESPONSE_INCOMPLETE","file","gpt-5-mini",undefined,"req-safe","resp-safe","response_incomplete_max_output_tokens"));
    expect(failure).toMatchObject({failureCode:"AI_RESPONSE_INCOMPLETE",failureMessage:"The AI provider response reached its output limit before structured output completed."});
  });
});
