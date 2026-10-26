import { NextResponse } from "next/server";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { resolvePlatformBillingCatalog } from "@zoeskoul/platform-server/billing/productCatalog";
import { activePlatformProductSubscription } from "@zoeskoul/platform-server/billing/subscriptionProjection";
import { verifiedPlatformSubscriptionRows } from "@zoeskoul/platform-server/billing/platformSubscriptionOwnership";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import {readBuilderStripeLifecycle} from "@/lib/billing/platformStripeProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** ZoeBuild platform subscription status; NEVER generated-store merchant payments. */
export async function GET(req: Request) {
  const access = await loadCurrentBuildAccessSnapshot(req);
  if (!access.userId) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const catalog = resolvePlatformBillingCatalog(process.env);
    const configured = catalog.some(p => p.product === "builder_ai");
    const [user, rows] = await Promise.all([
      prisma.user.findUnique({where:{id:access.userId},select:{stripeCustomerId:true}}),
      prisma.subscription.findMany({
      where: { userId:access.userId, priceId:{ in:catalog.filter(p => p.product === "builder_ai").map(p => p.priceId) } },
      select: { stripeCustomerId:true,priceId:true,billingProduct:true,stripeSubscriptionId:true, status:true, trialEnd:true, currentPeriodEnd:true, cancelAtPeriodEnd:true },
      }),
    ]);
    const owned = verifiedPlatformSubscriptionRows({storedStripeCustomerId:user?.stripeCustomerId,rows})
      .filter(row=>row.billingProduct==="builder_ai");
    const live=user?.stripeCustomerId?await readBuilderStripeLifecycle(user.stripeCustomerId):null;
    const active = activePlatformProductSubscription({product:"builder_ai",catalog,
      subscriptions:owned.filter(row=>row.stripeSubscriptionId===live?.subscriptionId)});
    const verified=Boolean(active && live);
    return NextResponse.json({product:"builder_ai",configured,subscribed:verified,
      status:verified?live?.status:null,currentPeriodEnd:verified?live?.periodEnd:null,
      trialEnd:verified?active?.trialEnd?.toISOString():null,
      cancelAtPeriodEnd:verified?live?.cancelAtPeriodEnd:false,
      cancellationDate:verified?live?.cancelAt:null,
      nextBillingDate:verified?live?.nextBillingDate:null,
      nextBillingAmountMinor:verified?live?.nextBillingAmountMinor:null,
      nextBillingCurrency:verified?live?.nextBillingCurrency:null},
      {headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"Billing status unavailable"},{status:503});
  }
}
