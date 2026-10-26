import {reportCheckoutRecoveryFailure} from "@/lib/billing/zoeBuildAiCreditCheckoutDiagnostics";
import {verifyCustomCreditCheckoutForAuthenticatedUser,verifyFixedCreditCheckoutForAuthenticatedUser} from "@/lib/billing/zoeBuildAiCreditCheckoutRecovery.server";
import {isServiceAuthorized, handoffBuilderOrigin, isSha256} from "@/lib/auth/buildHandoffProtocol";
import {readLimitedHandoffJson} from "@/lib/auth/buildHandoffBody";
import {readBuildHandoffSession} from "@/lib/auth/buildHandoffStore";
import {createZoeBuildAiCreditCheckoutForAuthenticatedUser, createZoeBuildAiCustomCheckoutForAuthenticatedUser, verifiedZoeBuildAiCreditCatalog} from "@/lib/billing/zoeBuildAiCreditStripeCheckout.server";
import {approvedZoeBuildCreditPacks, validatedPackCatalog,
  type CreditFundingMode, ZoeBuildAiCreditFundingError} from "@/lib/billing/zoeBuildAiCreditStripeFunding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"no-store"};
const PRICE = /^price_[A-Za-z0-9_]+$/;
const ATTEMPT = /^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
function json(body:Record<string,unknown>,status=200) {return Response.json(body,{status,headers});}
/** Server-to-server only. Web is the sole authority for a revocable user ID,
 * approved prices, Stripe Checkout and credit grants. Nothing supplied by a
 * browser can choose a user, a currency, a Stripe mode, or an app origin. */
export async function POST(request:Request) {
  let recoveryRequest=false;
  try {
    if(!isServiceAuthorized(request.headers.get("authorization")))
      return json({code:"SERVICE_UNAUTHORIZED"},401);
    if(Number(request.headers.get("content-length")||0)>1024)
      return json({code:"REQUEST_TOO_LARGE"},413);
    const body=await readLimitedHandoffJson(request,1024);
    if(!body || !isSha256(body.sessionHash)) return json({code:"INVALID_REQUEST"},400);
    if(!["catalog","checkout","status","release","cancel"].includes(String(body.action))) return json({code:"INVALID_REQUEST"},400);
    const session=await readBuildHandoffSession(body.sessionHash);
    if(!session.authenticated || !session.user?.id) return json({code:"SESSION_EXPIRED"},401);
    const requestedMode=process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE;
    const mode:CreditFundingMode=requestedMode==="sandbox-only" || requestedMode==="live"
      ? requestedMode : "off";
    if(body.action==="status" || body.action==="release" || body.action==="cancel") {
      recoveryRequest=true;
      if(mode!=="sandbox-only")return json({code:"AI_CREDIT_CUSTOM_TOPUP_NOT_APPROVED"},409);
      if(typeof body.checkoutAttemptId!=="string"||!ATTEMPT.test(body.checkoutAttemptId)||
        !(body.purchaseKind==="custom"?
          (typeof body.amountUsdMinor==="number"&&Number.isSafeInteger(body.amountUsdMinor)&&
           body.amountUsdMinor>=500&&body.amountUsdMinor<=50000&&body.priceId===undefined):
          (body.purchaseKind==="fixed"&&typeof body.priceId==="string"&&
           PRICE.test(body.priceId)&&body.amountUsdMinor===undefined)))
        return json({code:"INVALID_REQUEST"},400);
      const result=body.purchaseKind==="custom"?
        await verifyCustomCreditCheckoutForAuthenticatedUser({
          authenticatedUserId:session.user.id,checkoutAttemptId:body.checkoutAttemptId,
          amountUsdMinor:body.amountUsdMinor as number,cancel:body.action==="cancel"}):
        await verifyFixedCreditCheckoutForAuthenticatedUser({
          authenticatedUserId:session.user.id,checkoutAttemptId:body.checkoutAttemptId,
          priceId:body.priceId as string,cancel:body.action==="cancel"});
      if(body.action==="cancel") {
        // No browser state is retired until Stripe proves the session expired
        // without payment, or a completed purchase is ledger-funded.
        return result.state==="expired_unpaid" || result.state==="funded"
          ?json({safeToRelease:true,wasFunded:result.state==="funded"}):json({code:"CHECKOUT_NOT_SAFE_TO_CANCEL"},409);
      }
      if(body.action==="release") {
        // This does not delete a durable attempt. It only authorizes the
        // browser to retire its exact local retry key after a fresh Stripe read.
        return (result.state==="expired_unpaid" || result.state==="funded")
          ?json({released:true}):json({code:"CHECKOUT_NOT_SAFE_TO_RELEASE"},409);
      }
      return json(result);
    }
    if(body.action==="catalog") {
      // Unapproved packs must never be promoted to client-visible offerings.
      if(mode==="off")return json({available:false,packs:[],mode:"off"});
      // The live and sandbox catalogs share the SAME approval and Stripe-price
      // verification pipeline. Neither an env flag nor a browser price can
      // create an offering without an independently reviewed pack.
      const catalog=validatedPackCatalog(await verifiedZoeBuildAiCreditCatalog());
      return json({available:catalog.size>0,mode,packs:[...catalog.values()].map(p=>({
        priceId:p.priceId,amountUsdMinor:p.amountUsdMinor,creditUnits:p.creditUnits,
      }))});
    }
    if(mode==="off" || approvedZoeBuildCreditPacks(mode).length===0)
      return json({code:"CREDIT_PACKS_UNAVAILABLE"},409);
    if(typeof body.checkoutAttemptId!=="string" || !ATTEMPT.test(body.checkoutAttemptId))
      return json({code:"INVALID_REQUEST"},400);
    const custom=body.purchaseKind==="custom";
    if (body.purchaseKind!==undefined && !custom) return json({code:"INVALID_REQUEST"},400);
    if (custom) {
      if (mode!=="sandbox-only") return json({code:"AI_CREDIT_CUSTOM_TOPUP_NOT_APPROVED"},409);
      if (typeof body.amountUsdMinor!=="number" || !Number.isSafeInteger(body.amountUsdMinor) ||
          body.amountUsdMinor<500 || body.amountUsdMinor>50000 || body.priceId!==undefined)
        return json({code:"INVALID_REQUEST"},400);
    } else if(typeof body.priceId!=="string" || !PRICE.test(body.priceId) || body.amountUsdMinor!==undefined)
      return json({code:"INVALID_REQUEST"},400);
    const result=custom
      ? await createZoeBuildAiCustomCheckoutForAuthenticatedUser({
          authenticatedUserId:session.user.id,amountUsdMinor:body.amountUsdMinor as number,
          checkoutAttemptId:body.checkoutAttemptId,appOrigin:handoffBuilderOrigin(),
        })
      : await createZoeBuildAiCreditCheckoutForAuthenticatedUser({
          authenticatedUserId:session.user.id,priceId:body.priceId as string,
          checkoutAttemptId:body.checkoutAttemptId,appOrigin:handoffBuilderOrigin(),
        });
    if(!result.url || result.status!=="open") return json({code:"CHECKOUT_ALREADY_COMPLETE"},409);
    return json({url:result.url,resumed:!result.created});
  }catch(error){
    if(recoveryRequest)reportCheckoutRecoveryFailure("web-route",error);
    if(error instanceof ZoeBuildAiCreditFundingError)
      return json({code:error.code},409);
    // Do not expose Stripe errors, session IDs, secrets or database exceptions.
    return json({code:"CREDIT_CHECKOUT_UNAVAILABLE"},503);
  }
}
