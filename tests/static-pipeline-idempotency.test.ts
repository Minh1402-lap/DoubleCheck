import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({scanUpdate:vi.fn(),snapshotUpsert:vi.fn(),filesDelete:vi.fn(),filesCreateMany:vi.fn(),cacheFind:vi.fn(),collect:vi.fn()}));
vi.mock("../src/lib/db",()=>({db:{repositoryScan:{findUniqueOrThrow:vi.fn().mockResolvedValue({id:"scan-1",publicId:"public-1",owner:"owner",repository:"repo",normalizedUrl:"https://github.com/owner/repo",requestedRef:null}),update:mocks.scanUpdate,findFirst:mocks.cacheFind},$transaction:vi.fn(async(callback:(tx:unknown)=>unknown)=>callback({repositoryScan:{update:mocks.scanUpdate},repositorySnapshot:{upsert:mocks.snapshotUpsert},fileRecord:{deleteMany:mocks.filesDelete,createMany:mocks.filesCreateMany}}))}}));
vi.mock("../src/lib/env",()=>({env:()=>({RAW_RETENTION_HOURS:24})}));
vi.mock("../src/lib/collector/github",()=>({GitHubApiError:class extends Error{},GitHubCollector:class{collect=mocks.collect}}));
vi.mock("../src/lib/static-analysis",()=>({STATIC_RULESET_VERSION:"test.v1",analyzeStatic:()=>({version:1,risk:{score:0,recommendation:"run"},findings:[]})}));

import { processStaticScan } from "../src/lib/static-pipeline";

describe("static scan persistence",()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.cacheFind.mockResolvedValue(null);mocks.collect.mockResolvedValue({defaultBranch:"main",sha:"abc",repository:{name:"repo"},owner:{login:"owner"},coverage:{inventoryCount:1,inventoryBytes:12,selectedBytes:12,inventoryTruncated:false},files:[{path:"README.md",size:12,type:"documentation",selected:true,priorityReasons:["documentation"],content:"hello",hash:"hash"}]})});
 it("replaces per-scan collection data transactionally on re-entry",async()=>{await processStaticScan("scan-1");await processStaticScan("scan-1");expect(mocks.snapshotUpsert).toHaveBeenCalledTimes(2);expect(mocks.filesDelete).toHaveBeenCalledTimes(2);expect(mocks.filesCreateMany).toHaveBeenCalledTimes(2);expect(mocks.snapshotUpsert).toHaveBeenLastCalledWith(expect.objectContaining({where:{scanId:"scan-1"},create:expect.objectContaining({scanId:"scan-1"}),update:expect.not.objectContaining({scanId:expect.anything()})}));expect(mocks.scanUpdate).toHaveBeenLastCalledWith(expect.objectContaining({where:{id:"scan-1"},data:expect.objectContaining({status:"static_complete"})}))});
});
