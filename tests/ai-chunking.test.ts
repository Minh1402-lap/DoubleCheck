import {describe,expect,it} from "vitest";
import {fileAnalysisPayloads,mapAnalysisPayload} from "../src/lib/analysis/chunking";
import {estimatedInputTokens} from "../src/lib/analysis/usage";

describe("AI file request chunking",()=>{
  it("splits a large minified line and keeps every payload under the strict input limit",()=>{
    const system="system",limit=10_000;
    const payloads=fileAnalysisPayloads({claimedPurpose:"test"},[{path:"large.min.js",lines:[{number:1,text:"x".repeat(60_000)}]}],system,limit);
    expect(payloads.length).toBeGreaterThan(1);
    expect(payloads.every(data=>estimatedInputTokens(system,data)<=limit)).toBe(true);
  });

  it("accounts for repository-map overhead while packing files",()=>{
    const system="system",limit=8_000;
    const payloads=fileAnalysisPayloads({summary:"m".repeat(2_000)},[{path:"a.ts",lines:Array.from({length:20},(_,index)=>({number:index+1,text:"a".repeat(500)}))}],system,limit);
    expect(payloads.length).toBeGreaterThan(1);
    expect(payloads.every(data=>estimatedInputTokens(system,data)<=limit)).toBe(true);
  });

  it("keeps map inventory while bounding documentation excerpts",()=>{
    const system="map system",limit=12_000;
    const data=mapAnalysisPayload({name:"repo"},Array.from({length:50},(_,index)=>({path:`file-${index}.ts`,size:100})),[["README.md","r".repeat(20_000)],["docs/design.md","d".repeat(20_000)]],system,limit);
    expect(estimatedInputTokens(system,data)).toBeLessThanOrEqual(limit);
    expect(data).toContain("file-49.ts");
    expect(data).toContain('"truncated":true');
  });
});
