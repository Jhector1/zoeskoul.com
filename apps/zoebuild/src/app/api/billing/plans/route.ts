import { NextResponse } from "next/server";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { listBuilderPlatformPlans } from "@/lib/billing/platformStripeProvider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function json(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});}
/** Builder SaaS plans; this endpoint never reads merchant commerce providers. */
export async function GET(request:Request){
 let access: Awaited<ReturnType<typeof loadCurrentBuildAccessSnapshot>>;
 try { access = await loadCurrentBuildAccessSnapshot(request, {requireAuthority:true}); }
 catch { return json({code:"SESSION_AUTHORITY_UNAVAILABLE"},503); }
 if(!access.userId)return json({error:"Unauthorized"},401);
 try {return json(await listBuilderPlatformPlans());}
 catch{return json({error:"Builder plans unavailable"},503);}
}
