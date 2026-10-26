import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { purgeExpiredAiCreditResults } from "@/lib/build/aiCreditResultRetention";

/**
 * V12J.11C: bounded non-financial result retention entrypoint for the EXISTING
 * platform scheduler. This does not register/activate a new scheduler.
 * Never invoke from browser UI and never return user, result or provider data.
 */
export const runtime="nodejs";
export const dynamic="force-dynamic";
const CAP=100;
function authorized(req:Request):boolean {
  const secret=process.env.ZOEBUILD_AI_RESULT_RETENTION_SECRET;
  if(typeof secret!=="string"||secret.length<32 || secret.length>256)return false;
  const auth=req.headers.get("authorization");
  if(!auth||!auth.startsWith("Bearer "))return false;
  const supplied=auth.slice(7);
  // Constant-time comparison prevents response timing from leaking a prefix.
  const a=Buffer.from(supplied,"utf8"),b=Buffer.from(secret,"utf8");
  return a.length===b.length && timingSafeEqual(a,b);
}
export async function POST(req:Request){
  const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
  if(!authorized(req))return NextResponse.json({ok:false,code:"MAINTENANCE_UNAUTHORIZED"},{status:401,headers});
  try {
    const deleted=await purgeExpiredAiCreditResults({client:prisma,batchSize:CAP});
    return NextResponse.json({ok:true,deleted,batchCap:CAP},{headers});
  }catch(e){
    // Never expose DB details, identifiers, ciphertext or credentials.
    console.error("[ZoeBuild AI result retention] execution refused",{reason:e instanceof Error?e.name:"UnknownError"});
    return NextResponse.json({ok:false,code:"MAINTENANCE_UNAVAILABLE"},{status:503,headers});
  }
}
