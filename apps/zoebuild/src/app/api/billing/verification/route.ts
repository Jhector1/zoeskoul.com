import {NextResponse} from "next/server";
import {FeatureKey} from "@zoeskoul/db";
import {prisma} from "@zoeskoul/platform-server/prisma";
import {resolvePlatformBillingCatalog} from "@zoeskoul/platform-server/billing/productCatalog";
import {registeredBuilderStripeProducts} from "@zoeskoul/platform-server/billing/platformStripeProductIdentity";
import {activePlatformProductSubscription} from "@zoeskoul/platform-server/billing/subscriptionProjection";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";
import {verifyBuilderPlatformCheckoutReturn,readBuilderStripeLifecycle,recoverVerifiedBuilderCheckoutForSubscription} from "@/lib/billing/platformStripeProvider";
import {builderSandboxMode,type BuilderBillingEvidence,type BuilderCheckoutReturnState} from "@/lib/billing/platformBillingFlowEvidence";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});

/** Account-bound, read-only verification. Never returns IDs, billing secrets or third-party data. */
export async function GET(request:Request){
  let access: Awaited<ReturnType<typeof loadCurrentBuildAccessSnapshot>>;
  try { access = await loadCurrentBuildAccessSnapshot(request, {requireAuthority:true}); }
  catch { return json({code:"SESSION_AUTHORITY_UNAVAILABLE"},503); }
  if(!access.userId)return json({error:"Unauthorized"},401);
  try{
    const mode=builderSandboxMode(process.env.LEARNOIR_STRIPE_SECRET_KEY);
    const catalog=resolvePlatformBillingCatalog(process.env);
    const builderPrices=catalog.filter(item=>item.product==="builder_ai").map(item=>item.priceId);
    const now=new Date();
    const [user,subscriptions,grants]=await Promise.all([
      prisma.user.findUnique({where:{id:access.userId},select:{stripeCustomerId:true}}),
      prisma.subscription.findMany({where:{userId:access.userId,priceId:{in:builderPrices}},select:{
        stripeCustomerId:true,stripeSubscriptionId:true,priceId:true,billingProduct:true,status:true,
        currentPeriodEnd:true,trialEnd:true,cancelAtPeriodEnd:true,
      }}),
      prisma.featureGrant.findMany({where:{userId:access.userId,type:"subscription",revokedAt:null,
        feature:{in:[FeatureKey.build_ai_generate,FeatureKey.build_ai_edit]}},
        select:{feature:true,startsAt:true,endsAt:true}}),
    ]);
    const customerId=user?.stripeCustomerId?.trim() || null;
    const owned=customerId?subscriptions.filter(row=>row.stripeCustomerId===customerId&&row.billingProduct==="builder_ai"):[];
    const live=customerId?await readBuilderStripeLifecycle(customerId):null;
    const active=activePlatformProductSubscription({product:"builder_ai",catalog,
      subscriptions:owned.filter(row=>row.stripeSubscriptionId===live?.subscriptionId)});
    const activeMatchesLive=Boolean(active&&live);
    const currentGrants=grants.filter(grant=>(!grant.startsAt||grant.startsAt<=now) && (!grant.endsAt||grant.endsAt>now));
    const ids=owned.map(row=>row.stripeSubscriptionId).filter(Boolean);
    const sessionId=new URL(request.url).searchParams.get("session_id");
    let checkoutReturn:BuilderCheckoutReturnState="not_checked";
    let verifiedSessionSubscriptionId:string|null=null;
    if(sessionId!==null){
      if(sessionId.length>230 || !customerId || mode==="missing")checkoutReturn="invalid";
      else{
        try{
          const session=await verifyBuilderPlatformCheckoutReturn({
            sessionId,userId:access.userId,customerId,subscriptionIds:ids,
          });
          checkoutReturn=session.state;
          verifiedSessionSubscriptionId=(session.state==="verified"||session.state==="paid_unreconciled")?session.subscriptionId:null;
        }catch{checkoutReturn="unavailable";}
      }
    }
    // When the return URL is lost (e.g. later page navigation), independently
    // recover only an exact, paid Stripe Checkout on this same live, DB-owned
    // Builder subscription. Never infer payment from access or event state.
    if(sessionId===null && activeMatchesLive && live && customerId && mode!=="missing"){
      try{
        const recovered=await recoverVerifiedBuilderCheckoutForSubscription({
          userId:access.userId,customerId,subscriptionId:live.subscriptionId,subscriptionIds:ids,
        });
        checkoutReturn=recovered?"verified":"not_checked";
        if(recovered)verifiedSessionSubscriptionId=live.subscriptionId;
      }catch{checkoutReturn="unavailable";}
    }
    // A Stripe-verified paid Checkout identifies the exact authenticated customer
    // and subscription, even if the webhook has not inserted the DB row yet.
    // Match ledger events against THAT ID, not unrelated previous purchases.
    // An owner can hold more than one eligible Builder subscription. The UI's
    // selected subscription may not be the one whose event just reconciled.
    // Only consider current, customer-owned Builder records for independent
    // webhook evidence. Never use an unrelated product or another customer.
    const activeIds=activeMatchesLive&&live?[live.subscriptionId]:[];
    // When a Checkout session is supplied, require its exact verified Stripe
    // subscription ID; do not fall back to unrelated older webhook evidence.
    const eventIds=sessionId!==null
      ? verifiedSessionSubscriptionId&&live&&verifiedSessionSubscriptionId===live.subscriptionId
        ? [verifiedSessionSubscriptionId]:[]
      : activeIds;
    const event=eventIds.length?await prisma.stripeEvent.findFirst({where:{
      subscriptionId:{in:eventIds},status:"processed",livemode:mode==="live",
      type:{in:["checkout.session.completed","customer.subscription.created","customer.subscription.updated",
        "customer.subscription.resumed","invoice.paid","invoice.payment_succeeded"]},
    },orderBy:{processedAt:"desc"},select:{processedAt:true}}):null;
    const payload:BuilderBillingEvidence={
      mode,planConfigured:builderPrices.length>0 && registeredBuilderStripeProducts(process.env).size>0,customerLinked:Boolean(customerId),
      subscriptionRecorded:owned.length>0,subscriptionActive:activeMatchesLive,
      subscriptionStatus:live?.status ?? null,
      currentPeriodEnd:live?.periodEnd ?? null,
      cancelAtPeriodEnd:live?.cancelAtPeriodEnd ?? false,
      cancellationDate:live?.cancelAt??null,
      nextBillingDate:live?.nextBillingDate??null,
      nextBillingAmountMinor:live?.nextBillingAmountMinor??null,
      nextBillingCurrency:live?.nextBillingCurrency??null,
      webhookProcessed:Boolean(event),webhookProcessedAt:event?.processedAt?.toISOString() ?? null,
      // Diagnostic grant flags must never claim subscription access when the
      // current Stripe subscription is absent, canceled, or foreign. A stale
      // local grant alone is not valid provider-backed billing evidence.
      generateGrant:activeMatchesLive && currentGrants.some(g=>g.feature===FeatureKey.build_ai_generate) && access.entitlements.includes("build_ai_generate"),
      editGrant:activeMatchesLive && currentGrants.some(g=>g.feature===FeatureKey.build_ai_edit) && access.entitlements.includes("build_ai_edit"),
      checkoutReturn:checkoutReturn==="verified" && verifiedSessionSubscriptionId!==live?.subscriptionId
        ? "invalid":checkoutReturn,checkedAt:now.toISOString(),
    };
    return json(payload);
  }catch{
    return json({error:"Billing verification unavailable"},503);
  }
}
