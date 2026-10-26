import {NextRequest,NextResponse} from "next/server";
import {isTrustedBillingMutation} from "@zoeskoul/platform-server/billing/platformBillingRequest";
import {SESSION_COOKIE,requestBuilderAiCreditService} from "@/lib/auth/buildHandoff";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const ATTEMPT=/^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PRICE=/^price_[A-Za-z0-9_]+$/;
const json=(code:string,status:number)=>NextResponse.json({code},{status,headers});
/** Buy only Web-reviewed Stripe test credit packs; user identity comes from
 * the revocable host-only session, not a browser-supplied user ID. */
export async function POST(request:NextRequest){
  const origin=process.env.NEXT_PUBLIC_ZOEBUILD_ORIGIN?.trim() || process.env.ZOEBUILD_ORIGIN?.trim();
  if(!isTrustedBillingMutation(request,origin))return json("BILLING_ORIGIN_MISMATCH",403);
  const token=request.cookies.get(SESSION_COOKIE)?.value;
  if(!token)return json("SESSION_EXPIRED",401);
  try{
    if(Number(request.headers.get("content-length")||0)>1024)return json("REQUEST_TOO_LARGE",413);
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>1024)return json("REQUEST_TOO_LARGE",413);
    const body:unknown=JSON.parse(raw);
    if(!body || typeof body!=="object" || Array.isArray(body))return json("INVALID_REQUEST",400);
    const data=body as Record<string,unknown>;
    if(typeof data.checkoutAttemptId!=="string" || !ATTEMPT.test(data.checkoutAttemptId))
      return json("INVALID_REQUEST",400);
    const custom=data.purchaseKind==="custom";
    if(data.purchaseKind!==undefined&&!custom)return json("INVALID_REQUEST",400);
    if(custom){
      if(typeof data.amountUsdMinor!=="number" || !Number.isSafeInteger(data.amountUsdMinor) ||
         data.amountUsdMinor<500 || data.amountUsdMinor>50000 || data.priceId!==undefined)
        return json("INVALID_REQUEST",400);
    }else if(typeof data.priceId!=="string" || !PRICE.test(data.priceId) || data.amountUsdMinor!==undefined)
      return json("INVALID_REQUEST",400);
    const upstream=await requestBuilderAiCreditService(token,custom?{
      action:"checkout",purchaseKind:"custom",amountUsdMinor:data.amountUsdMinor as number,
      checkoutAttemptId:data.checkoutAttemptId,
    }:{action:"checkout",priceId:data.priceId as string,checkoutAttemptId:data.checkoutAttemptId});
    if(!upstream)return json("SESSION_EXPIRED",401);
    if(upstream.status===401)return json("SESSION_EXPIRED",401);
    if(!upstream.ok) {
      const failure:unknown=await upstream.json().catch(()=>null);
      const code=failure && typeof failure==="object" && "code" in failure &&
        typeof failure.code==="string" && /^[A-Z_]{3,70}$/.test(failure.code)
        ? failure.code : "CREDIT_CHECKOUT_UNAVAILABLE";
      return json(code,upstream.status===409?409:503);
    }
    const result:unknown=await upstream.json();
    if(!result || typeof result!=="object" || Array.isArray(result))throw new Error("Invalid authority response");
    const out=result as {url?:unknown;resumed?:unknown};
    if(typeof out.url!=="string" || typeof out.resumed!=="boolean")throw new Error("Invalid authority response");
    const target=new URL(out.url);
    if(target.protocol!=="https:" || target.hostname!=="checkout.stripe.com" ||
       target.username || target.password)throw new Error("Invalid checkout host");
    return NextResponse.json({url:target.href,resumed:out.resumed},{headers});
  }catch{return json("CREDIT_CHECKOUT_UNAVAILABLE",503);}
}
