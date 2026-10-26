import {NextResponse} from "next/server";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";
import {startBuilderPlatformCheckout} from "@/lib/billing/platformStripeProvider";
import {isTrustedBillingMutation,billingLocale} from "@zoeskoul/platform-server/billing/platformBillingRequest";
import {isPlatformCheckoutAttemptId} from "@zoeskoul/platform-server/billing/platformCheckoutReservation";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const MAX_BODY=2048;
function json(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});}
/** ZoeBuild SaaS Checkout only; no generated-store customer/order/payment routes. */
export async function POST(request:Request){
 const configuredOrigin = process.env.NEXT_PUBLIC_ZOEBUILD_ORIGIN?.trim() || process.env.ZOEBUILD_ORIGIN?.trim();
 if (!isTrustedBillingMutation(request, configuredOrigin))
  return json({error:"ZoeBuild billing request origin does not match the app URL. Check your browser URL and NEXT_PUBLIC_ZOEBUILD_ORIGIN (or ZOEBUILD_ORIGIN).",
    code:"BILLING_ORIGIN_MISMATCH"},403);
 const access=await loadCurrentBuildAccessSnapshot(request);
 if(!access.userId)return json({error:"Unauthorized"},401);
 let body:unknown;
 try{
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>MAX_BODY)return json({error:"Request too large"},413);
  body=JSON.parse(raw);
 }catch{return json({error:"Invalid JSON"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"Invalid request"},400);
 const payload=body as Record<string,unknown>;
 if(typeof payload.priceId!=="string"||!/^price_[A-Za-z0-9_]+$/.test(payload.priceId)||
    !isPlatformCheckoutAttemptId(payload.checkoutAttemptId))return json({error:"Invalid billing selection"},400);
 const locale=billingLocale(payload.locale);
 try{
  const out=await startBuilderPlatformCheckout({userId:access.userId,
    priceId:payload.priceId,checkoutAttemptId:payload.checkoutAttemptId,locale});
  if(out.kind==="created"||out.kind==="resumed")return json({url:out.url,resumed:out.kind==="resumed"});
  if(out.kind==="missing_user")return json({error:"Account unavailable",code:"ACCOUNT_NOT_FOUND"},404);
  if(out.kind==="already_subscribed")return json({error:"Builder subscription already exists",code:"SUBSCRIPTION_ALREADY_ACTIVE"},409);
  if(out.kind==="completed")return json({error:"Checkout completed; subscription confirming",code:"CHECKOUT_RECONCILING"},409);
  return json({error:"An earlier checkout must be resolved",code:out.kind==="stale"?"CHECKOUT_ATTEMPT_EXPIRED":"CHECKOUT_ALREADY_IN_PROGRESS"},409);
 }catch(error){
  if(error instanceof Error&&error.message==="BILLING_PRODUCT_PRICE_NOT_ALLOWED")return json({error:"Plan not available"},400);
  return json({error:"Checkout unavailable; retry the same attempt",code:"CHECKOUT_UNAVAILABLE"},503);
 }
}
