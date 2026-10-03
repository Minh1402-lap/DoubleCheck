import {describe,expect,it} from "vitest";
import {findingNarrative,reportVerdict,type ReportFinding} from "../src/lib/report-language";
import {publicScanFailure} from "../src/lib/public-errors";

const credential:ReportFinding={rule:"CREDENTIAL_ACCESS",severity:"medium",confidence:"medium",explanation:"Reads values",filePath:"app/config.py",lineStart:4,lineEnd:8,excerpt:'SECRET_KEY = os.environ.get("SECRET_KEY")'};
describe("plain-language report verdicts",()=>{
 it("uses low-concern wording without contradictory review language",()=>{const verdict=reportVerdict({recommendation:"run",score:8},1);expect(verdict.title).toBe("Low concern");expect(`${verdict.summary} ${findingNarrative(credential,"run").assessment}`.toLowerCase()).not.toContain("requires review");expect(verdict.summary).toContain("One behavior")});
 it("uses review wording for the review recommendation",()=>expect(reportVerdict({recommendation:"review",score:28},2)).toMatchObject({title:"Review before running"}));
 it("uses stop language for a high-risk recommendation",()=>{const verdict=reportVerdict({recommendation:"avoid",score:80},1);expect(verdict.title).toBe("High risk");expect(verdict.summary).toContain("Do not run")});
 it("explains credential access without claiming malicious intent",()=>{const narrative=findingNarrative(credential,"run");expect(narrative).toMatchObject({title:"Reads sensitive application configuration",assessment:"Likely normal configuration"});expect(narrative.why).toContain("Malicious code sometimes");expect(narrative.meaning).toContain("did not find evidence");expect(narrative.action).toContain("secret manager")});
});
describe("public scan errors",()=>{it("never exposes an unknown internal exception",()=>{const message=publicScanFailure("STATIC_ANALYSIS_FAILED","Unique constraint failed on RepositorySnapshot_scanId_key");expect(message).not.toContain("Unique constraint");expect(message).toContain("stopped safely")});it("keeps an actionable allowlisted rate-limit message",()=>expect(publicScanFailure("GITHUB_PRIMARY_RATE_LIMIT","GitHub limit resets at 12:00 UTC")).toContain("12:00 UTC"))});
