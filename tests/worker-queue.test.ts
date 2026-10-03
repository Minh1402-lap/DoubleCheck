import { describe, expect, it, vi } from "vitest";
import { claimNextJob, releaseJob, renewJobLease, WORKER_LEASE_MS } from "../src/lib/worker-queue";

function client(candidate: {id:string;status:string;staticReportJson:unknown}|null, counts:number[]) {
  return { repositoryScan: { findFirst: vi.fn().mockResolvedValue(candidate), updateMany: vi.fn().mockImplementation(async()=>({count:counts.shift()??0})) } };
}

describe("worker queue leases",()=>{
  it("claims a queued scan with one compare-and-set update",async()=>{const db=client({id:"scan-1",status:"queued",staticReportJson:null},[1]);const now=new Date("2026-10-01T00:00:00Z");await expect(claimNextJob(db,now,"lease-a")).resolves.toEqual({id:"scan-1",kind:"static",leaseId:"lease-a"});expect(db.repositoryScan.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"scan-1",status:"queued"}),data:expect.objectContaining({workerLeaseId:"lease-a",workerAttempt:{increment:1},workerLeaseExpiresAt:new Date(now.getTime()+WORKER_LEASE_MS)})}))});
  it("does not return a job when another worker wins the claim",async()=>{const db=client({id:"scan-1",status:"queued",staticReportJson:null},[0,0,0,0]);await expect(claimNextJob(db,new Date(),"lease-b")).resolves.toBeNull()});
  it("classifies a stale in-progress AI scan for safe re-entry",async()=>{const db=client({id:"scan-2",status:"mapping",staticReportJson:{version:1}},[1]);await expect(claimNextJob(db,new Date(),"lease-c")).resolves.toMatchObject({id:"scan-2",kind:"ai"})});
  it("queries only static statuses when AI is disabled",async()=>{const db=client(null,[]);await expect(claimNextJob(db,new Date(),"lease-static",false)).resolves.toBeNull();expect(db.repositoryScan.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({status:{in:["queued","collecting","static_analyzing"]}})}))});
  it("renews and releases only the matching lease",async()=>{const db=client(null,[1,1]);const job={id:"scan-3",kind:"static" as const,leaseId:"lease-d"};await expect(renewJobLease(job,db)).resolves.toBe(true);await releaseJob(job,db);expect(db.repositoryScan.updateMany).toHaveBeenLastCalledWith({where:{id:"scan-3",workerLeaseId:"lease-d"},data:{workerLeaseId:null,workerLeaseExpiresAt:null}})});
});
