import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeGitHubUrl } from "@/lib/github-url";
import { rateLimit } from "@/lib/rate-limit";
import { sessionIdentity, setSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({error:"Expected JSON."},{status:415});
  const origin=request.headers.get("origin"); if(origin && origin!==request.nextUrl.origin) return NextResponse.json({error:"Cross-origin request blocked."},{status:403});
  const identity=await sessionIdentity(); const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"local";
  if(!rateLimit(`${ip}:${identity.hash}`)) return NextResponse.json({error:"Scan limit reached. Try again later."},{status:429});
  try {
    const body=z.object({url:z.string().max(500)}).parse(await request.json()); const repo=normalizeGitHubUrl(body.url); const cfg=env();
    const scan=await db.repositoryScan.create({data:{publicId:nanoid(24),sessionHash:identity.hash,normalizedUrl:repo.normalizedUrl,owner:repo.owner,repository:repo.repository,requestedRef:repo.requestedRef,analysisModel:cfg.AI_ANALYSIS_MODEL,verifierModel:cfg.AI_VERIFIER_MODEL}});
    const response=NextResponse.json({id:scan.publicId},{status:202}); if(identity.isNew) response.headers.set("Set-Cookie",setSessionCookie(identity.raw)); return response;
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Invalid request."},{status:400}); }
}
