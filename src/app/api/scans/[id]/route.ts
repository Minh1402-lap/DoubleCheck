import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessionIdentity } from "@/lib/session";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const session=await sessionIdentity();const scan=await db.repositoryScan.findFirst({where:{publicId:id,sessionHash:session.hash},select:{publicId:true,status:true,progress:true,progressMessage:true,owner:true,repository:true,commitSha:true,completeness:true,failureMessage:true}});return scan?NextResponse.json(scan):NextResponse.json({error:"Scan not found."},{status:404});}
