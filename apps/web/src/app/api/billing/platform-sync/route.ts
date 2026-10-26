/**
 * Authenticated Stripe-to-platform reconciliation independent of Learning plan
 * presentation. Stripe is the only billing authority; the canonical Web writer
 * persists subscriptions and reconciles product-scoped grants.
 *
 * Read-through synchronization is idempotent and does not initiate payments,
 * cancellations, price changes, or grant writes outside the canonical writer.
 */
import {NextResponse} from "next/server";
import {FeatureKey} from "@zoeskoul/db";
import {auth} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {syncSubscriptionsForUser} from "@/lib/billing/stripeService";
import {resolvePlatformBillingCatalog} from "@zoeskoul/platform-server/billing/productCatalog";
import {registeredBuilderStripeProducts} from "@zoeskoul/platform-server/billing/platformStripeProductIdentity";
import {activePlatformProductSubscription} from "@zoeskoul/platform-server/billing/subscriptionProjection";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const responseHeaders={"Cache-Control":"no-store"};
function json(body:Record<string,unknown>,status=200){
  return NextResponse.json(body,{status,headers:responseHeaders});
}

export async function GET(){
  const session=await auth();
  const userId=session?.user?.id;
  if(typeof userId!=="string"||!userId.trim())return json({error:"Unauthorized"},401);
  try{
    // Deliberately do not call billingConfig() or getPricePresentation().
    // Learning pricing and AUTH_URL are irrelevant to this platform sync.
    await syncSubscriptionsForUser(userId);
    const catalog=resolvePlatformBillingCatalog(process.env);
    const prices=catalog.filter(item=>item.product==="builder_ai");
    const configured=prices.length>0 && registeredBuilderStripeProducts(process.env).size>0;
    const [user,rows,grants]=await Promise.all([
      prisma.user.findUnique({where:{id:userId},select:{stripeCustomerId:true}}),
      prisma.subscription.findMany({where:{userId,billingProduct:"builder_ai",priceId:{in:prices.map(p=>p.priceId)}},select:{
        stripeCustomerId:true,priceId:true,billingProduct:true,status:true,
        currentPeriodEnd:true,trialEnd:true,cancelAtPeriodEnd:true,
      }}),
      prisma.featureGrant.findMany({where:{userId,type:"subscription",revokedAt:null,
        feature:{in:[FeatureKey.build_ai_generate,FeatureKey.build_ai_edit]}},select:{
        feature:true,startsAt:true,endsAt:true,
      }}),
    ]);
    const customerId=user?.stripeCustomerId?.trim();
    const owned=configured && customerId
      ? rows.filter(row=>row.stripeCustomerId===customerId && row.billingProduct==="builder_ai")
      : [];
    const active=activePlatformProductSubscription({product:"builder_ai",catalog,subscriptions:owned});
    const now=new Date();
    const validGrants=new Set(grants.filter(g=>(!g.startsAt||g.startsAt<=now)&&(!g.endsAt||g.endsAt>now)).map(g=>g.feature));
    return json({stripeSynchronized:true,builderProductConfigured:configured,
      builderSubscriptionActive:Boolean(active),
      builderGenerateGrant:Boolean(active)&&validGrants.has(FeatureKey.build_ai_generate),
      builderEditGrant:Boolean(active)&&validGrants.has(FeatureKey.build_ai_edit)});
  }catch{
    // Never claim reconciliation on failed Stripe/DB reads; avoid leaking PII.
    return json({error:"Platform subscription synchronization unavailable"},503);
  }
}
