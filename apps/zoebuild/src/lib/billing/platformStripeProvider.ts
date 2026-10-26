import "server-only";
import Stripe from "stripe";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { resolvePlatformBillingCatalog } from "@zoeskoul/platform-server/billing/productCatalog";
import { projectBuilderBillingPlan } from "@zoeskoul/platform-server/billing/platformBuilderPlans";
import { createPlatformBillingPortalSession } from "@zoeskoul/platform-server/billing/platformPortalLifecycle";
import { activePlatformProductSubscription } from "@zoeskoul/platform-server/billing/subscriptionProjection";
import type { PlatformStripeCustomerDeps } from "@zoeskoul/platform-server/billing/platformStripeCustomer";
import { resolveZoeBuildOrigins } from "@/lib/appOrigins";
import { requirePlatformPriceForProduct } from "@zoeskoul/platform-server/billing/productCatalog";
import { reservePlatformBillingCheckout, releasePlatformBillingCheckoutReservation, BILLING_CHECKOUT_SESSION_LIFETIME_MS } from "@zoeskoul/platform-server/billing/platformCheckoutReservation";
import { prepareReservedPlatformCheckout } from "@zoeskoul/platform-server/billing/platformReservedCheckoutGate";
import { createOrRecoverPlatformSubscriptionCheckout, findPlatformCheckoutAttemptSession } from "@zoeskoul/platform-server/billing/platformCheckoutLifecycle";
import { withValidPlatformStripeCustomer } from "@zoeskoul/platform-server/billing/platformStripeCustomer";
import { collectPlatformSubscriptionPages } from "@zoeskoul/platform-server/billing/platformSubscriptionLifecycle";
import { hasCurrentSubscriptionAccess } from "@zoeskoul/platform-server/billing/subscriptionEligibility";
import { blocksNewPlatformCheckout } from "@zoeskoul/platform-server/billing/platformStripeSubscriptionState";
import {projectStripeNextInvoice} from "@zoeskoul/platform-server/billing/platformNextInvoice";
import {registeredBuilderStripeProducts,stripePriceProductId,requireVerifiedBuilderStripePrice} from "@zoeskoul/platform-server/billing/platformStripeProductIdentity";
import { verifiedPlatformSubscriptionRows } from "@zoeskoul/platform-server/billing/platformSubscriptionOwnership";
import { classifyBuilderCheckoutSession } from "./platformBillingFlowEvidence";

let client: Stripe | null = null;
/** Same platform Stripe account/key as Zoéskoul. NEVER a merchant's Stripe key. */
function platformStripe(): Stripe {
  const secret = process.env.LEARNOIR_STRIPE_SECRET_KEY?.trim();
  if (!secret || !secret.startsWith("sk_")) throw new Error("Platform Stripe key unavailable.");
  client ??= new Stripe(secret);
  return client;
}

export async function listBuilderPlatformPlans() {
  const catalog = resolvePlatformBillingCatalog(process.env);
  const prices = catalog.filter(item => item.product === "builder_ai");
  if (!prices.length) return {configured:false, plans: []};
  const stripe = platformStripe();
  const plans = await Promise.all(prices.map(async item => {
    const price = await stripe.prices.retrieve(item.priceId);
    requireVerifiedBuilderStripePrice({catalog,priceId:price.id,
      stripeProductId:stripePriceProductId(price.product),
      builderProductIds:registeredBuilderStripeProducts(process.env)});
    return projectBuilderBillingPlan(catalog, price);
  }));
  return {configured:true, plans};
}

/** Live, read-only Stripe lifecycle for this verified customer. ZoeBuild never changes
 * subscription status, next invoices or grants. The canonical Web webhook owns writes. */
export async function readBuilderStripeLifecycle(customerId:string):Promise<Readonly<{
  subscriptionId:string;status:string;periodEnd:string|null;
  cancelAt:string|null;cancelAtPeriodEnd:boolean;
  nextBillingDate:string|null;nextBillingAmountMinor:number|null;nextBillingCurrency:string|null;
}>|null>{
  if(!/^cus_[A-Za-z0-9_]+$/.test(customerId))throw Error("UNVERIFIED_STRIPE_CUSTOMER");
  const catalog=resolvePlatformBillingCatalog(process.env);
  const products=registeredBuilderStripeProducts(process.env);
  if(!products.size)return null;
  const stripe=platformStripe();
  const subscriptions=await collectPlatformSubscriptionPages({listPage:async cursor=>
    stripe.subscriptions.list({customer:customerId,status:"all",limit:100,
      expand:["data.items.data.price"],...(cursor?{starting_after:cursor}:{})})});
  const eligible=subscriptions.filter(sub=>{
    const subCustomer=typeof sub.customer==="string"?sub.customer:sub.customer.id;
    if(subCustomer!==customerId || sub.livemode!==(process.env.LEARNOIR_STRIPE_SECRET_KEY?.startsWith("sk_live_")??false) ||
      sub.metadata?.billingProduct!=="builder_ai")return false;
    // Platform Builder plans are one recurring Stripe price, not mixed product carts.
    if(sub.items.data.length!==1)return false;
    const verified=sub.items.data.some(item=>{
      const priceId=item.price?.id;
      if(!priceId)return false;
      try{requireVerifiedBuilderStripePrice({catalog,priceId,
        stripeProductId:stripePriceProductId(item.price.product),builderProductIds:products});return true;}
      catch{return false;}
    });
    if(!verified)return false;
    const end=sub.items.data.map(item=>item.current_period_end).filter((v):v is number=>typeof v==="number")
      .sort((a,b)=>b-a)[0]??null;
    return hasCurrentSubscriptionAccess({status:sub.status,
      trialEnd:sub.trial_end?new Date(sub.trial_end*1000):null,
      currentPeriodEnd:end?new Date(end*1000):null});
  });
  // Detect multiple valid subscriptions but never combine their evidence.
  if(eligible.length>1)throw Error("MULTIPLE_ACTIVE_BUILDER_SUBSCRIPTIONS");
  const current=eligible[0];
  if(!current)return null;
  const periodEnd=current.items.data.map(item=>item.current_period_end).filter((v):v is number=>typeof v==="number")
    .sort((a,b)=>b-a)[0]??null;
  const cancelAt=typeof current.cancel_at==="number"?current.cancel_at:null;
  const noFutureInvoice=current.cancel_at_period_end || current.status==="canceled";
  let nextBillingDate:string|null=null,nextBillingAmountMinor:number|null=null,nextBillingCurrency:string|null=null;
  if(!noFutureInvoice){
    // Stripe's upcoming invoice preview, not a locally calculated plan price.
    try{
      const invoice=await stripe.invoices.createPreview({customer:customerId,subscription:current.id});
      const projected=projectStripeNextInvoice(invoice,Date.now(),noFutureInvoice);
      if(!cancelAt || !projected.nextBillingDate ||
        new Date(projected.nextBillingDate).getTime()<cancelAt*1000){
        nextBillingDate=projected.nextBillingDate;
        nextBillingAmountMinor=projected.nextBillingAmountMinor;
        nextBillingCurrency=projected.nextBillingCurrency;
      }
    }catch{ // No upcoming invoice / Stripe temporarily unavailable: never invent a date or amount.
    }
  }
  return {subscriptionId:current.id,status:current.status,
    periodEnd:periodEnd?new Date(periodEnd*1000).toISOString():null,
    cancelAt:cancelAt?new Date(cancelAt*1000).toISOString():null,
    cancelAtPeriodEnd:current.cancel_at_period_end,
    nextBillingDate,nextBillingAmountMinor,nextBillingCurrency};
}

const customerDeps: PlatformStripeCustomerDeps = {
  findUser: (userId) => prisma.user.findUnique({
    where:{id:userId}, select:{email:true,stripeCustomerId:true},
  }),
  setCustomerId: (userId, customerId) => prisma.user.update({
    where:{id:userId}, data:{stripeCustomerId:customerId},
  }),
  retrieveCustomer: (customerId) => platformStripe().customers.retrieve(customerId),
  createCustomer: (userId,email) => platformStripe().customers.create({
    metadata:{userId}, email:email??undefined,
  }),
};

/** Refuse portal access without a verified Builder subscription and customer binding. */
export async function createBuilderPlatformBillingPortal(userId:string,locale:string) {
  const catalog = resolvePlatformBillingCatalog(process.env);
  const priceIds = catalog.filter(p=>p.product === "builder_ai").map(p=>p.priceId);
  if (!priceIds.length) throw new Error("BUILDER_BILLING_CATALOG_UNAVAILABLE");
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({where:{id:userId},select:{stripeCustomerId:true}}),
    prisma.subscription.findMany({where:{userId,priceId:{in:priceIds}},select:{
      stripeCustomerId:true,priceId:true,billingProduct:true,status:true,currentPeriodEnd:true,trialEnd:true,cancelAtPeriodEnd:true,
    }}),
  ]);
  const owned = verifiedPlatformSubscriptionRows({storedStripeCustomerId:user?.stripeCustomerId,rows});
  const active = activePlatformProductSubscription({product:"builder_ai",catalog,subscriptions:owned.filter(row=>row.billingProduct==="builder_ai")});
  const remote= user?.stripeCustomerId?await readBuilderStripeLifecycle(user.stripeCustomerId):null;
  if (!active || !remote) {
    throw new Error("BUILDER_BILLING_SUBSCRIPTION_REQUIRED");
  }
  const origin = resolveZoeBuildOrigins().zoebuildOrigin;
  const returnUrl = new URL(`/${locale}/billing`,origin).href;
  return createPlatformBillingPortalSession({
    userId,returnUrl,customerDeps,
    createSession: (customerId, url) => platformStripe().billingPortal.sessions.create({customer:customerId,return_url:url}),
  });
}


export type BuilderCheckoutResult = Readonly<{
  kind:"created"|"resumed"|"already_subscribed"|"conflict"|"completed"|"stale"|"missing_user";
  url?:string;
}>;

/** App-specific catalog/URL/Stripe adapter. Canonical attempt, customer, and
 * provider-state lifecycles live in platform-server. No merchant Stripe here. */
export async function startBuilderPlatformCheckout(input: Readonly<{
  userId:string; priceId:string; checkoutAttemptId:string; locale:string;
}>): Promise<BuilderCheckoutResult> {
  const {userId,priceId,checkoutAttemptId,locale}=input;
  const catalog=resolvePlatformBillingCatalog(process.env);
  requirePlatformPriceForProduct({catalog,product:"builder_ai",priceId});
  const stripe=platformStripe();
  // Server-side confirmation prevents retired/non-recurring prices from being charged.
  const providerPrice=await stripe.prices.retrieve(priceId);
  requireVerifiedBuilderStripePrice({catalog,priceId,
    stripeProductId:stripePriceProductId(providerPrice.product),
    builderProductIds:registeredBuilderStripeProducts(process.env)});
  projectBuilderBillingPlan(catalog,providerPrice);
  const reservationClient=prisma as unknown as import("@zoeskoul/platform-server/billing/platformCheckoutReservation").PlatformBillingCheckoutReservationClient;
  const reserve=(u:string,a:string)=>reservePlatformBillingCheckout(u,a,{client:reservationClient});
  const release=(u:string,a:string)=>releasePlatformBillingCheckoutReservation(u,a,{client:reservationClient});
  const findSession=async(u:string,a:string)=>{
    const bound=await prisma.user.findUnique({where:{id:u},select:{stripeCustomerId:true}});
    if(!bound?.stripeCustomerId)return null;
    const pages=await collectPlatformSubscriptionPages({
      listPage:async(cursor)=>{
        const page=await stripe.checkout.sessions.list({customer:bound.stripeCustomerId!,limit:100,
          expand:["data.line_items"],...(cursor?{starting_after:cursor}:{})});
        return page;
      },
    });
    return findPlatformCheckoutAttemptSession({sessions:pages,checkoutAttemptId:a,
      statuses:["open","complete","expired"]});
  };
  const prepared=await prepareReservedPlatformCheckout({
    userId,attemptId:checkoutAttemptId,priceId,useTrial:false,reserve,release,findSession,
  });
  if(prepared.kind==="resume")return {kind:"resumed",url:verifiedCheckoutUrl(prepared.url)};
  if(prepared.kind!=="ready")return {kind:prepared.kind};
  const origin=resolveZoeBuildOrigins().zoebuildOrigin;
  const billingPath=`/${locale}/billing`;
  const successUrl=new URL(billingPath,origin);
  successUrl.searchParams.set("checkout","success");
  // Stripe requires the literal token, not the percent-encoded URLSearchParams form.
  const successHref=`${successUrl.href}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl=new URL(billingPath,origin);
  cancelUrl.searchParams.set("checkout","cancelled");
  const expireAt=Math.floor((prepared.reservedAt.getTime()+BILLING_CHECKOUT_SESSION_LIFETIME_MS)/1000);
  let deterministicCheckoutRejection=false;
  try {
    const out=await withValidPlatformStripeCustomer({userId,deps:customerDeps,operate:async(customerId)=>{
      // Stripe is authoritative. Local webhook lag must not create duplicate paid plans.
      const subscriptions=await collectPlatformSubscriptionPages({
        listPage:async(cursor)=>stripe.subscriptions.list({customer:customerId,status:"all",limit:100,
          expand:["data.items.data.price"],...(cursor?{starting_after:cursor}:{})}),
      });
      const builderPrices=new Set(catalog.filter(p=>p.product==="builder_ai").map(p=>p.priceId));
      const builderProducts=registeredBuilderStripeProducts(process.env);
      const existing=subscriptions.some(sub=>{
        // Price AND independent Stripe product ID determine duplicate billing,
        // regardless of missing/edited subscription metadata.
        const matchingItem=sub.items.data.some(item=>builderPrices.has(item.price.id)&&
          Boolean(stripePriceProductId(item.price.product)&&builderProducts.has(stripePriceProductId(item.price.product)!)));
        if(!matchingItem)return false;
        // Stripe terminal cancellation is authoritative: old period_end is NOT a duplicate.
        // Scheduled cancellation is still active in Stripe and prevents a second charge.
        return blocksNewPlatformCheckout(sub.status);
      });
      if(existing)return {kind:"already_subscribed" as const};
      const sessions=(await stripe.checkout.sessions.list({customer:customerId,limit:100,expand:["data.line_items"]})).data;
      if(findPlatformCheckoutAttemptSession({sessions,checkoutAttemptId,statuses:["complete"]}))return {kind:"completed" as const};
      const checkout=await createOrRecoverPlatformSubscriptionCheckout({
        checkoutAttemptId,priceId,useTrial:false,successUrl:successHref,
        listSessions:async()=>sessions,
        createSession:async()=>{try{return await stripe.checkout.sessions.create({
          mode:"subscription",customer:customerId,
          line_items:[{price:priceId,quantity:1}],
          client_reference_id:userId,
          success_url:successHref,cancel_url:cancelUrl.href,
          expires_at:expireAt,
          metadata:{userId,priceId,checkoutAttemptId,useTrial:"false",billingProduct:"builder_ai"},
          subscription_data:{metadata:{userId,priceId,checkoutAttemptId,billingProduct:"builder_ai"}},
        },{idempotencyKey:`platform-builder-checkout:${checkoutAttemptId}`});
        }catch(err){const e=(err&&typeof err==="object")?err as {type?:unknown;rawType?:unknown}:null;
        if(e?.type==="StripeInvalidRequestError"||e?.rawType==="invalid_request_error")deterministicCheckoutRejection=true;throw err;}},
      });
      return {kind:"created" as const,url:verifiedCheckoutUrl(checkout.url)};
    }});
    if(out.kind==="already_subscribed")await release(userId,checkoutAttemptId);
    return out;
  }catch(error){
    // Release only when Stripe conclusively rejects the POST before creation.
    if(deterministicCheckoutRejection){
      await release(userId,checkoutAttemptId).catch(()=>false);
    }
    throw error;
  }
}

function verifiedCheckoutUrl(raw:string|null):string{
  if(!raw)throw new Error("Stripe Checkout URL unavailable");
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com"||url.username||url.password){
    throw new Error("Untrusted Stripe Checkout URL");
  }
  return url.href;
}

/** Read-only session verification. A success URL is never payment evidence. */
export async function verifyBuilderPlatformCheckoutReturn(input: Readonly<{
  sessionId:string;
  userId:string;
  customerId:string;
  subscriptionIds:readonly string[];
}>): Promise<Readonly<{state:"verified" | "paid_unreconciled" | "pending" | "invalid";subscriptionId:string|null}>> {
  if (!/^cs_(?:test|live)_[A-Za-z0-9_]{4,190}$/.test(input.sessionId)) return {state:"invalid",subscriptionId:null};
  const checkout = await platformStripe().checkout.sessions.retrieve(input.sessionId);
  const customerId = typeof checkout.customer === "string" ? checkout.customer : checkout.customer?.id ?? null;
  const subscriptionId = typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription?.id ?? null;
  const catalog = resolvePlatformBillingCatalog(process.env);
  const state=classifyBuilderCheckoutSession({
    session:{mode:checkout.mode,status:checkout.status,paymentStatus:checkout.payment_status,
      livemode:checkout.livemode,userId:checkout.client_reference_id,
      billingProduct:checkout.metadata?.billingProduct ?? null,priceId:checkout.metadata?.priceId ?? null,
      customerId,subscriptionId},
    userId:input.userId,customerId:input.customerId,subscriptionIds:input.subscriptionIds,
    builderPriceIds:catalog.filter(p=>p.product==="builder_ai").map(p=>p.priceId),
    expectedLivemode:process.env.LEARNOIR_STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false,
  });
  return {state,subscriptionId:state==="verified"||state==="paid_unreconciled"?subscriptionId:null};
}

/** Reconstruct payment evidence after the Checkout return URL has been lost.
 * Stripe is the authority. Search only the exact currently eligible Builder
 * subscription; never infer payment from DB rows, grants, or a webhook alone.
 * A missing/ambiguous/unpaid session does not verify payment.
 */
export async function recoverVerifiedBuilderCheckoutForSubscription(input:Readonly<{
  userId:string;customerId:string;subscriptionId:string;subscriptionIds:readonly string[];
}>):Promise<boolean>{
  if(!/^sub_[A-Za-z0-9_]+$/.test(input.subscriptionId) ||
    !/^cus_[A-Za-z0-9_]+$/.test(input.customerId) ||
    !input.subscriptionIds.includes(input.subscriptionId))return false;
  const stripe=platformStripe();
  const page=await stripe.checkout.sessions.list({subscription:input.subscriptionId,limit:100});
  // Never mark payment verified when relevant results might be omitted.
  if(page.has_more)return false;
  const catalog=resolvePlatformBillingCatalog(process.env);
  const builderPriceIds=catalog.filter(p=>p.product==="builder_ai").map(p=>p.priceId);
  const expectedLivemode=process.env.LEARNOIR_STRIPE_SECRET_KEY?.startsWith("sk_live_")??false;
  let verifiedCount=0;
  for(const checkout of page.data){
    const customerId=typeof checkout.customer==="string"?checkout.customer:checkout.customer?.id??null;
    const subscriptionId=typeof checkout.subscription==="string"?checkout.subscription:checkout.subscription?.id??null;
    if(subscriptionId!==input.subscriptionId)continue;
    const state=classifyBuilderCheckoutSession({
      session:{mode:checkout.mode,status:checkout.status,paymentStatus:checkout.payment_status,
        livemode:checkout.livemode,userId:checkout.client_reference_id,
        billingProduct:checkout.metadata?.billingProduct??null,priceId:checkout.metadata?.priceId??null,
        customerId,subscriptionId},
      userId:input.userId,customerId:input.customerId,subscriptionIds:input.subscriptionIds,
      builderPriceIds,expectedLivemode,
    });
    if(state==="verified")verifiedCount++;
    if(verifiedCount>1)return false;
  }
  return verifiedCount===1;
}
