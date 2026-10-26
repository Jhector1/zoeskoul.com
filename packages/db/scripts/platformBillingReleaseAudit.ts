/**
 * Read-only release audit for ONE existing Stripe test subscription and webhook.
 * Uses only Prisma findUnique/findMany. No payment actions, migrations or writes.
 * No customer, account, Stripe price, event IDs or secrets are printed.
 * Run with DATABASE_URL loaded in an explicitly verified test environment.
 */
import {getPrismaClient,FeatureKey} from "../src/client";

function requiredArg(flag:string):string {
  const index=process.argv.indexOf(flag);
  if(index<0 || !process.argv[index+1])throw new Error(`Missing ${flag}`);
  return process.argv[index+1]!;
}
function normalizeDbTarget():{host:string;database:string} {
  const raw=process.env.ADMIN_DATABASE_URL??process.env.WEB_DATABASE_URL??process.env.DATABASE_URL;
  if(!raw)throw new Error("Database configuration missing");
  const url=new URL(raw);
  if(!["postgresql:","postgres:"].includes(url.protocol)||!url.hostname)throw new Error("Not a PostgreSQL connection");
  const database=decodeURIComponent(url.pathname.replace(/^\//,""));
  if(!database || database.includes("/"))throw new Error("Invalid database name");
  if(url.searchParams.get("schema") && url.searchParams.get("schema")!=="public")throw new Error("Only public schema supported");
  return {host:url.hostname,database};
}
function periodEligible(status:string,period:Date|null,trial:Date|null,now:Date):boolean {
  const end=status==="trialing"?trial:period;
  return (status==="active"||status==="past_due"||status==="canceled"||status==="trialing") &&
    end instanceof Date && end.getTime()>now.getTime();
}
async function main() {
  const target=normalizeDbTarget();
  if(target.host!==requiredArg("--expect-host") || target.database!==requiredArg("--expect-database"))
    throw new Error("Database target mismatch. No connection attempted.");
  const subscriptionId=requiredArg("--subscription-id");
  const eventId=requiredArg("--event-id");
  if(!/^sub_[A-Za-z0-9_]{6,160}$/.test(subscriptionId)||!/^evt_[A-Za-z0-9_]{6,160}$/.test(eventId))
    throw new Error("Invalid Stripe identifiers");
  if(process.env.NODE_ENV==="production")throw new Error("Use a separately approved production release process");
  const db=getPrismaClient();
  try {
    const [subscription,event]=await Promise.all([
      db.subscription.findUnique({where:{stripeSubscriptionId:subscriptionId},select:{
        userId:true,stripeCustomerId:true,status:true,priceId:true,billingProduct:true,
        currentPeriodEnd:true,trialEnd:true,cancelAtPeriodEnd:true,
      }}),
      db.stripeEvent.findUnique({where:{id:eventId},select:{
        status:true,type:true,livemode:true,subscriptionId:true,
      }}),
    ]);
    if(!subscription){console.log("SUBSCRIPTION=NOT_FOUND");console.log("RELEASE_AUDIT=BLOCKED");process.exitCode=2;return;}
    const [user,related,grants]=await Promise.all([
      db.user.findUnique({where:{id:subscription.userId},select:{stripeCustomerId:true}}),
      db.subscription.findMany({where:{userId:subscription.userId,stripeCustomerId:subscription.stripeCustomerId},
        select:{stripeSubscriptionId:true,priceId:true,status:true,currentPeriodEnd:true,trialEnd:true,billingProduct:true}}),
      db.featureGrant.findMany({where:{userId:subscription.userId,type:"subscription",revokedAt:null,
        feature:{in:[FeatureKey.build_ai_generate,FeatureKey.build_ai_edit]}},
        select:{feature:true,startsAt:true,endsAt:true}}),
    ]);
    const now=new Date();
    const ownersMatch=Boolean(user?.stripeCustomerId && user.stripeCustomerId===subscription.stripeCustomerId);
    const eventMatches=event?.status==="processed"&&event.subscriptionId===subscriptionId&&event.livemode===false;
    const configured=(process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS??"").split(",").map(x=>x.trim()).filter(Boolean);
    const matchedPrice=Boolean(subscription.priceId&&configured.includes(subscription.priceId));
    const active=periodEligible(subscription.status,subscription.currentPeriodEnd,subscription.trialEnd,now);
    const activeGrants=new Set(grants.filter(g=>(!g.startsAt||g.startsAt<=now)&&(!g.endsAt||g.endsAt>now)).map(g=>g.feature));
    const bothGrants=activeGrants.has(FeatureKey.build_ai_generate)&&activeGrants.has(FeatureKey.build_ai_edit);
    const eligibleRelated=related.filter(s=>Boolean(s.priceId&&configured.includes(s.priceId))&&periodEligible(s.status,s.currentPeriodEnd,s.trialEnd,now));
    const selectedDifferent=eligibleRelated.some(s=>s.stripeSubscriptionId!==subscriptionId &&
      s.currentPeriodEnd?.getTime()!==subscription.currentPeriodEnd?.getTime());
    const product=subscription.billingProduct===null?"MISSING":subscription.billingProduct;
    console.log("=== BUILDER BILLING READ-ONLY RELEASE AUDIT ===");
    console.log("NO_DB_WRITES=YES NO_STRIPE_CALLS=YES NO_SECRET_OUTPUT=YES");
    console.log("CUSTOMER_OWNERSHIP="+(ownersMatch?"PASS":"FAIL"));
    console.log("EXACT_TEST_EVENT="+(eventMatches?"PROCESSED":"NOT_VERIFIED"));
    console.log("CURRENT_BUILDER_PRICE="+(matchedPrice?"MATCHED":"NOT_MATCHED"));
    console.log("EXISTING_SUBSCRIPTION="+(active?"ELIGIBLE":"NOT_ELIGIBLE"));
    console.log("STORED_BILLING_PRODUCT="+product);
    console.log("BOTH_SUBSCRIPTION_GRANTS="+(bothGrants?"ACTIVE":"NOT_ACTIVE"));
    console.log("ELIGIBLE_BUILDER_SUBSCRIPTION_COUNT="+eligibleRelated.length);
    console.log("DIFFERENT_ACTIVE_PERIODS="+(selectedDifferent?"YES":"NO"));
    const ok=ownersMatch&&eventMatches&&matchedPrice&&active&&bothGrants;
    const consistent=subscription.billingProduct==="builder_ai" && !selectedDifferent;
    console.log("RELEASE_AUDIT="+(ok?(consistent?"PASS":"PASS_WITH_DATA_WARNINGS"):"BLOCKED"));
    // All integrity warnings block final release sign-off until investigated.
    if(!ok || !consistent) process.exitCode=2;
  } finally {await db.$disconnect();}
}
main().catch(()=>{console.error("RELEASE_AUDIT_ABORTED: inspect configuration or database access locally; details redacted");process.exitCode=2;});
