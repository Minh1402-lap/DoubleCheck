import { Prisma } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { GitHubApiError, GitHubCollector } from "./collector/github";
import { analyzeStatic, STATIC_RULESET_VERSION } from "./static-analysis";
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function processStaticScan(scanId:string){const scan=await db.repositoryScan.findUniqueOrThrow({where:{id:scanId}});try{
 await db.repositoryScan.update({where:{id:scanId},data:{status:"collecting",progress:8,progressMessage:"Collecting immutable repository snapshot",startedAt:new Date(),failureCode:null,failureMessage:null}});
 const c=await new GitHubCollector().collect(scan.owner,scan.repository,scan.requestedRef??undefined); const rawDeleteAfter=new Date(Date.now()+env().RAW_RETENTION_HOURS*3600000);
 const snapshot={repositoryJson:json(c.repository),ownerJson:json(c.owner),inventoryCount:c.coverage.inventoryCount,inventoryBytes:c.coverage.inventoryBytes,selectedBytes:c.coverage.selectedBytes,skippedJson:json(c.files.filter(f=>!f.selected).map(({path,size,skipReason})=>({path,size,skipReason}))),coverageJson:json(c.coverage),commandsJson:json([]),dependenciesJson:json([]),mapJson:json({}),intentJson:json([]),rawDeleteAfter};
 await db.$transaction(async tx=>{await tx.repositoryScan.update({where:{id:scanId},data:{defaultBranch:c.defaultBranch,commitSha:c.sha}});await tx.repositorySnapshot.upsert({where:{scanId},create:{scanId,...snapshot},update:snapshot});await tx.fileRecord.deleteMany({where:{scanId}});await tx.fileRecord.createMany({data:c.files.map(f=>({scanId,path:f.path,contentHash:f.hash,typeGuess:f.type,size:f.size,selected:f.selected,skipReason:f.skipReason,priorityReasons:json(f.priorityReasons),content:f.content,rawDeleteAfter:f.content?rawDeleteAfter:null}))});});
 await db.repositoryScan.update({where:{id:scanId},data:{status:"static_analyzing",progress:70,progressMessage:"Running deterministic static rules"}});
 const cached=await db.repositoryScan.findFirst({where:{id:{not:scanId},normalizedUrl:scan.normalizedUrl,commitSha:c.sha,staticRulesetVersion:STATIC_RULESET_VERSION,staticReportJson:{not:Prisma.JsonNull}},orderBy:{staticCompletedAt:"desc"}});
 const report=cached?.staticReportJson??analyzeStatic({owner:scan.owner,repository:scan.repository,url:scan.normalizedUrl,sha:c.sha,files:c.files,coverage:c.coverage});
 await db.repositoryScan.update({where:{id:scanId},data:{status:"static_complete",progress:100,progressMessage:cached?"Static report complete (cached)":"Static report complete",completeness:c.coverage.inventoryTruncated?"partial":"complete",staticRulesetVersion:STATIC_RULESET_VERSION,staticReportJson:json(report),staticCompletedAt:new Date(),completedAt:new Date()}});
 }catch(e){const code=e instanceof GitHubApiError?e.code:"STATIC_ANALYSIS_FAILED"; const msg=e instanceof Error?e.message:"Static scan failed"; console.error(`[worker] Static scan ${scan.publicId} failed: ${code}`); await db.repositoryScan.update({where:{id:scanId},data:{status:"failed",progressMessage:"Static scan failed safely",failureCode:code,failureMessage:msg,completedAt:new Date()}});}}
