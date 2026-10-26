import { NextResponse } from "next/server";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createBuilderPlatformBillingPortal } from "@/lib/billing/platformStripeProvider";
import { isTrustedBillingMutation, billingLocale } from "@zoeskoul/platform-server/billing/platformBillingRequest";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function json(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});}
/** Platform subscription portal only; generated-store merchants use their own payment settings. */
export async function POST(request:Request){
 const configuredOrigin = process.env.NEXT_PUBLIC_ZOEBUILD_ORIGIN?.trim() || process.env.ZOEBUILD_ORIGIN?.trim();
 if (!isTrustedBillingMutation(request, configuredOrigin))
  return json({error:"ZoeBuild billing request origin does not match the app URL. Check your browser URL and NEXT_PUBLIC_ZOEBUILD_ORIGIN (or ZOEBUILD_ORIGIN).",
    code:"BILLING_ORIGIN_MISMATCH"},403);
 const access = await loadCurrentBuildAccessSnapshot(request);
 if(!access.userId)return json({error:"Unauthorized"},401);
 if (Number(request.headers.get("content-length")??0)>1024)return json({error:"Too large"},413);
 let body:unknown;
 try{body=await request.json();}catch{return json({error:"Invalid body"},400);}
 const locale=billingLocale(body && typeof body==="object" && !Array.isArray(body) ? (body as Record<string,unknown>).locale : null);
 try{return json(await createBuilderPlatformBillingPortal(access.userId,locale));}
 catch{return json({error:"Billing portal unavailable"},503);}
}
