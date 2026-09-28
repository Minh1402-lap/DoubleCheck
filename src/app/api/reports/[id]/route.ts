import { NextRequest,NextResponse } from "next/server";
import {db} from "@/lib/db";
import {sessionIdentity} from "@/lib/session";

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(request.headers.get("origin")&&request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Cross-origin request blocked."},{status:403});
  const {id}=await params;const session=await sessionIdentity();
  const result=await db.repositoryScan.deleteMany({where:{publicId:id,sessionHash:session.hash}});
  return result.count?NextResponse.json({deleted:true}):NextResponse.json({error:"Report not found."},{status:404});
}
