import {NextRequest,NextResponse} from "next/server";
import {isTrustedBillingMutation} from "@zoeskoul/platform-server/billing/platformBillingRequest";
import {SESSION_COOKIE,requestBuilderAiCreditService} from "@/lib/auth/buildHandoff";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const ATTEMPT=/^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PRICE=/^price_[A-Za-z0-9_]+$/;
const json=(code:string,status:number)=>NextResponse.json({code},{status,headers});
/** Same-origin authenticated proxy. Browser never chooses a user or Stripe mode. */
export async function POST(request:NextRequest){
  const origin=process.env.NEXT_PUBLIC_ZOEBUILD_ORIGIN?.trim()||process.env.ZOEBUILD_ORIGIN?.trim();
  if(!isTrustedBillingMutation(request,origin))return json("BILLING_ORIGIN_MISMATCH",403);
  const token=request.cookies.get(SESSION_COOKIE)?.value;
  if(!token)return json("SESSION_EXPIRED",401);
  try{
    if(Number(request.headers.get("content-length")||0)>1024)return json("REQUEST_TOO_LARGE",413);
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>1024)return json("REQUEST_TOO_LARGE",413);
    const input:unknown=JSON.parse(raw);
    if(!input||typeof input!=="object"||Array.isArray(input))return json("INVALID_REQUEST",400);
    const body=input as Record<string,unknown>;
    if((body.action!=="status"&&body.action!=="release"&&body.action!=="cancel")||
       typeof body.checkoutAttemptId!=="string"||!ATTEMPT.test(body.checkoutAttemptId)||
       !(body.purchaseKind==="custom"?
         (typeof body.amountUsdMinor==="number"&&Number.isSafeInteger(body.amountUsdMinor)&&
          body.amountUsdMinor>=500&&body.amountUsdMinor<=50000&&body.priceId===undefined):
         (body.purchaseKind==="fixed"&&typeof body.priceId==="string"&&
          PRICE.test(body.priceId)&&body.amountUsdMinor===undefined)))
      return json("INVALID_REQUEST",400);
    const forward=body.purchaseKind==="custom"?
      {action:body.action,purchaseKind:"custom",checkoutAttemptId:body.checkoutAttemptId,amountUsdMinor:body.amountUsdMinor}:
      {action:body.action,purchaseKind:"fixed",checkoutAttemptId:body.checkoutAttemptId,priceId:body.priceId};
    const upstream=await requestBuilderAiCreditService(token,
      forward as unknown as Parameters<typeof requestBuilderAiCreditService>[1]);
    if(!upstream||upstream.status===401)return json("SESSION_EXPIRED",401);
    if(!upstream.ok){const failure:unknown=await upstream.json().catch(()=>null);
      const code=failure&&typeof failure==="object"&&"code" in failure&&
        typeof failure.code==="string"&&/^[A-Z_]{3,70}$/.test(failure.code)
        ?failure.code:"CREDIT_CHECKOUT_RECOVERY_UNAVAILABLE";
      return json(code,upstream.status===409?409:503);
    }
    const payload:unknown=await upstream.json();
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw Error("Invalid authority reply");
    const data=payload as Record<string,unknown>;
    if(body.action==="cancel"){
      if(data.safeToRelease!==true)return json("CHECKOUT_NOT_SAFE_TO_CANCEL",409);
      return NextResponse.json({safeToRelease:true,wasFunded:data.wasFunded===true},{headers});
    }
    if(body.action==="release"){
      if(data.released!==true)return json("CREDIT_CHECKOUT_RECOVERY_UNAVAILABLE",503);
      return NextResponse.json({released:true},{headers});
    }
    if(!["open","expired_unpaid","completed","funded","unresolved"].includes(String(data.state)))
      throw Error("Invalid authority state");
    if(data.state==="open"){
      if(typeof data.url!=="string")throw Error("Missing resume URL");
      const url=new URL(data.url);
      if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com"||
        url.username||url.password)throw Error("Invalid resume URL");
      return NextResponse.json({state:"open",url:url.href},{headers});
    }
    return NextResponse.json({state:data.state},{headers});
  }catch{return json("CREDIT_CHECKOUT_RECOVERY_UNAVAILABLE",503);}
}
