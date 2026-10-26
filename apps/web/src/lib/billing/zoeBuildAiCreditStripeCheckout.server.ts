import "server-only";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  approvedZoeBuildSandboxCreditPacks,
  approvedZoeBuildCreditPacks,
  creditFundingIsLive,
  type CreditFundingMode,
} from "./zoeBuildAiCreditStripeFunding";
import {
  createZoeBuildAiCreditTestCheckout,
  type ZoeBuildCustomCheckoutDeps,
  createZoeBuildAiCustomCheckout,
} from "./zoeBuildAiCreditStripeCheckout";

/**
 * Server-only composition. NO PUBLIC ROUTE is attached here. A future route
 * must authenticate the user and provide the server-owned userId, not a body ID.
 * No customer auto-creation or credit grants. Live checkout additionally
 * requires the explicitly reviewed production pack registry.
 */
import {claimZoeBuildAiCreditCheckoutAttempt,
  recordZoeBuildAiCreditCheckoutSession,
  claimZoeBuildCustomCheckoutAttempt, recordZoeBuildCustomCheckoutSession,
} from "./zoeBuildAiCreditCheckoutAttempt";

const deps: ZoeBuildCustomCheckoutDeps = {
  async retrievePrice(id) {
    const price = await getStripe().prices.retrieve(id);
    return {
      id: price.id, livemode: price.livemode, active: price.active,
      type: price.type, currency: price.currency,
      unitAmount: price.unit_amount, billingScheme: price.billing_scheme,
      recurring: price.recurring != null,
      customUnitAmount: price.custom_unit_amount != null,
    };
  },
  async findCustomerForUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId }, select: { stripeCustomerId: true },
    });
    return user?.stripeCustomerId ?? null;
  },
  async retrieveCustomer(id) {
    const customer = await getStripe().customers.retrieve(id);
    return {
      id: customer.id,
      livemode: "livemode" in customer && typeof customer.livemode === "boolean"
        ? customer.livemode : null,
      deleted: "deleted" in customer && customer.deleted === true,
    };
  },
  async claimAttempt(input) {
    return claimZoeBuildAiCreditCheckoutAttempt({client: prisma, ...input});
  },
  async recordSession(input) {
    return recordZoeBuildAiCreditCheckoutSession({client: prisma, ...input});
  },
  async claimCustomAttempt(input) {
    return claimZoeBuildCustomCheckoutAttempt({client:prisma,...input});
  },
  async recordCustomSession(input) {
    return recordZoeBuildCustomCheckoutSession({client:prisma,...input});
  },
  async retrieveSession(sessionId) {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return {id: session.id, livemode: session.livemode, mode: session.mode,
      status: session.status ?? "unknown",
      customer: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      url: session.url, metadata: session.metadata};
  },
  async listSessions(customerId) {
    const response = await getStripe().checkout.sessions.list({
      customer: customerId, limit: 100,
    });
    return {hasMore: response.has_more, data: response.data.map((session) => ({
      id: session.id, livemode: session.livemode, mode: session.mode,
      status: session.status ?? "unknown",
      customer: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      url: session.url,
      metadata: session.metadata,
    }))};
  },
  async listLineItems(id) {
    const response = await getStripe().checkout.sessions.listLineItems(id, {limit: 2});
    return {hasMore: response.has_more, data: response.data.map((item) => ({
      quantity: item.quantity, priceId: item.price?.id ?? null,
      amountSubtotal: item.amount_subtotal,
    }))};
  },
  async createCustomSession(input, idempotencyKey) {
    const session=await getStripe().checkout.sessions.create({
      mode:input.mode,customer:input.customer,
      line_items:[{price_data:{currency:"usd",unit_amount:input.amountUsdMinor,
        product_data:{name:"ZoeBuild AI credit top-up",metadata:{kind:"zoebuild_ai_credits"}}},quantity:1}],
      payment_method_types:["card"],allow_promotion_codes:false,
      automatic_tax:{enabled:false},metadata:input.metadata,
      payment_intent_data:{metadata:input.metadata},
      success_url:input.successUrl,cancel_url:input.cancelUrl,
    },{idempotencyKey});
    return {id:session.id,livemode:session.livemode,mode:session.mode,
      status:session.status??"unknown",
      customer:typeof session.customer==="string"?session.customer:session.customer?.id??null,
      url:session.url,metadata:session.metadata};
  },
  async createSession(input, idempotencyKey) {
    const session = await getStripe().checkout.sessions.create({
      mode: input.mode,
      customer: input.customer,
      line_items: [{price: input.priceId, quantity: input.quantity}],
      payment_method_types: ["card"],
      allow_promotion_codes: false,
      automatic_tax: {enabled: false},
      metadata: input.metadata,
      payment_intent_data: {metadata: input.metadata},
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    }, {idempotencyKey});
    return {
      id: session.id, livemode: session.livemode, mode: session.mode,
      status: session.status ?? "unknown",
      customer: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      url: session.url,
      metadata: session.metadata,
    };
  },
};

export async function createZoeBuildAiCreditCheckoutForAuthenticatedUser(args: Readonly<{
  authenticatedUserId: string;
  priceId: string;
  checkoutAttemptId: string;
  appOrigin: string;
}>) {
  const mode: CreditFundingMode =
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE === "sandbox-only" ||
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE === "live"
      ? process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE : "off";
  return createZoeBuildAiCreditTestCheckout({
    deps,
    userId: args.authenticatedUserId,
    priceId: args.priceId,
    checkoutAttemptId: args.checkoutAttemptId,
    appOrigin: args.appOrigin,
    mode,
    approvedPacks: approvedZoeBuildCreditPacks(mode),
  });
}

/** The browser catalog never offers a price by environment flag alone.
 * Query the actual Stripe TEST Price; Checkout will independently recheck.
 * This legacy test-only listing remains used by the current billing screen,
 * which must be wired to verifiedZoeBuildAiCreditCatalog for live display.
 */
export async function verifiedZoeBuildAiSandboxCatalog() {
  const reviewed = approvedZoeBuildSandboxCreditPacks();
  if (reviewed.length !== 1) return [];
  const pack = reviewed[0]!;
  const actual = await deps.retrievePrice(pack.priceId);
  if (actual.id !== pack.priceId || actual.livemode !== false ||
      actual.active !== true || actual.type !== "one_time" ||
      actual.currency !== "usd" || actual.unitAmount !== pack.amountUsdMinor ||
      actual.billingScheme !== "per_unit" || actual.recurring ||
      actual.customUnitAmount) return [];
  return reviewed;
}

/** Mode-bound catalog for the authenticated billing route. No live catalog
 * can appear until the independently reviewed live pack registry is compiled.
 * Server re-fetches the Stripe Price even after approval. */
export async function verifiedZoeBuildAiCreditCatalog() {
  const mode: CreditFundingMode =
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE === "sandbox-only" ||
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE === "live"
      ? process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE : "off";
  const expectedLive = creditFundingIsLive(mode);
  if (expectedLive === null) return [];
  const reviewed = approvedZoeBuildCreditPacks(mode);
  if (reviewed.length === 0) return [];
  const output = [];
  for (const pack of reviewed) {
    const actual = await deps.retrievePrice(pack.priceId);
    if (actual.id !== pack.priceId || actual.livemode !== expectedLive ||
        actual.active !== true || actual.type !== "one_time" ||
        actual.currency !== "usd" || actual.unitAmount !== pack.amountUsdMinor ||
        actual.billingScheme !== "per_unit" || actual.recurring ||
        actual.customUnitAmount) return [];
    output.push(pack);
  }
  return output;
}


/** V12J.28C: TEST-only custom top-up. Live review registry remains empty. */
export async function createZoeBuildAiCustomCheckoutForAuthenticatedUser(args:Readonly<{
  authenticatedUserId:string; amountUsdMinor:number;checkoutAttemptId:string;appOrigin:string;
}>) {
  const mode:CreditFundingMode=process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE==="sandbox-only"
    ? "sandbox-only":process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE==="live"?"live":"off";
  return createZoeBuildAiCustomCheckout({deps,userId:args.authenticatedUserId,
    amountUsdMinor:args.amountUsdMinor,checkoutAttemptId:args.checkoutAttemptId,
    appOrigin:args.appOrigin,mode,approvedPacks:approvedZoeBuildCreditPacks(mode)});
}
