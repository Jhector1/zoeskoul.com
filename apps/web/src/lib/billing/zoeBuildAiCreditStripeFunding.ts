import { assertZoeCommercialPack } from "@zoeskoul/platform-server/ai-credits/math";
import {
  assertZoeBuildLivePackReleased,
  ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS,
} from "./zoeBuildAiCreditLiveReleasePolicy";
import type Stripe from "stripe";
import { quoteZoeTopUpUsdMinor, ZOE_TOP_UP_POLICY, ZOE_CUSTOM_TOPUP_MARKER } from "@zoeskoul/platform-server/ai-credits/customCreditTopUp";

/**
 * Explicit, compiled approval list. EMPTY until separately reviewed.
 * NEVER infer packs from Zoéskoul learning/tutoring prices or client metadata.
 */
export type ApprovedZoeBuildCreditPack = Readonly<{
  priceId: string;
  amountUsdMinor: number;
  creditUnits: string;
}>;

export const APPROVED_ZOEBUILD_AI_CREDIT_PACKS: readonly ApprovedZoeBuildCreditPack[] = [];

/** V12J.15A: one approved $5 / 500-credit sandbox acceptance pack.
 * Registration is disabled until the Web operator explicitly configures a
 * Stripe TEST secret, a signed-webhook secret, the reviewed test Price ID,
 * and sandbox-only funding mode. Production/livemode cannot register it.
 * No NODE_ENV branch and no alternate wallet or grant semantics are used.
 */
export function approvedZoeBuildSandboxCreditPacks(config: Readonly<{
  mode?: string; stripeKey?: string; webhookSecret?: string; priceId?: string;
}> = {
  mode: process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE,
  stripeKey: process.env.LEARNOIR_STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  priceId: process.env.ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID,
}): readonly ApprovedZoeBuildCreditPack[] {
  if (config.mode !== "sandbox-only" ||
      !config.stripeKey?.startsWith("sk_test_") || config.stripeKey.length < 24 ||
      !config.webhookSecret?.startsWith("whsec_") || config.webhookSecret.length < 18 ||
      !config.priceId || !/^price_[A-Za-z0-9_]+$/.test(config.priceId)) {
    return APPROVED_ZOEBUILD_AI_CREDIT_PACKS;
  }
  return Object.freeze([{priceId:config.priceId, amountUsdMinor:500, creditUnits:"500000"}]);
}


/** Same payment, ledger, and reversal rules in both Stripe environments. */
export type CreditFundingMode = "off" | "sandbox-only" | "live";
export function creditFundingIsLive(mode: CreditFundingMode): boolean | null {
  return mode === "live" ? true : mode === "sandbox-only" ? false : null;
}

/** Deliberately EMPTY pending independent production pack economics and Stripe
 * live Price review. Environment variables alone cannot authorize credit sales. */
export const APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS: readonly ApprovedZoeBuildCreditPack[] = Object.freeze([]);

/** Apply the exact reviewed pack registry for the Stripe environment. */
export function approvedZoeBuildCreditPacks(mode: CreditFundingMode): readonly ApprovedZoeBuildCreditPack[] {
  if (mode === "sandbox-only") return approvedZoeBuildSandboxCreditPacks();
  if (mode === "live") {
    if (!process.env.LEARNOIR_STRIPE_SECRET_KEY?.startsWith("sk_live_") ||
        !process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) return [];
    // Even after an operator separately approves live Stripe Price IDs,
    // refuse any compiled live pack that violates the owner-approved target.
    for (const pack of APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS) {
      assertZoeCommercialPack(pack);
      // A reviewed price allowlist alone never enables charging. Demand the
      // separate merchant-fee and live operations sign-off for the same price.
      assertZoeBuildLivePackReleased({
        pack, reviews: ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS,
        occurredAt: new Date(),
      });
    }
    return APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS;
  }
  return [];
}
export type CreditCheckoutResult =
  | { kind: "funded"; created: boolean }
  | { kind: "pending" };

/** The webhook MUST verify its Stripe signature before invoking this function. */
export function isZoeBuildAiCreditCheckoutEvent(event: Stripe.Event): boolean {
  if (event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded") return false;
  const session = event.data.object as Stripe.Checkout.Session;
  return session.mode === "payment" &&
    (session.metadata?.zoebuildAiCreditPurchase === "v1" ||
     session.metadata?.zoebuildAiCreditPurchase === "v2");
}

type StripeCheckout = Readonly<{
  id: string; livemode: boolean; status: string | null; mode: string;
  payment_status: string; customer: string | null; payment_intent: string | null;
  currency: string | null; amount_total: number | null; amount_subtotal: number | null;
  metadata: Readonly<Record<string, string>> | null;
  total_details: Readonly<{ amount_discount: number; amount_tax: number }> | null;
}>;
type StripeLineItem = Readonly<{
  quantity: number | null; priceId: string | null;
  amount_total: number; amount_subtotal: number;
}>;
type StripePayment = Readonly<{
  id: string; livemode: boolean; status: string; currency: string;
  amount: number; amount_received: number;
  latestCharge: null | Readonly<{
    paymentIntentId: string | null; paid: boolean; captured: boolean;
    refunded: boolean; disputed: boolean; amount: number;
    amount_refunded: number; currency: string;
  }>;
}>;
export type ZoeBuildAiCreditCheckoutProof = Readonly<{
  attemptId: string;
  userId: string;
  priceId: string;
  customerId: string;
  stripeSessionId: string | null;
  amountUsdMinor?: number | null;
  creditUnits?: bigint | null;
  pricingVersion?: string | null;
}>;
export type ZoeBuildAiCreditStripeDeps = Readonly<{
  retrieveSession(id: string): Promise<StripeCheckout>;
  listLineItems(id: string): Promise<Readonly<{ data: readonly StripeLineItem[]; has_more: boolean }>>;
  retrievePaymentIntent(id: string): Promise<StripePayment>;
  findUserIdByCustomerId(customerId: string): Promise<string | null>;
  /** Durable server DB identity established BEFORE Stripe session creation. */
  findCheckoutAttempt(attemptId: string): Promise<ZoeBuildAiCreditCheckoutProof | null>;
  grantPurchasedCredits(input: Readonly<{
    userId: string; sourceKey: string; units: string;
  }>): Promise<{ created: boolean }>;
}>;

const STRIPE_ID = /^(?:cs_(?:test|live)_[A-Za-z0-9_]+|pi_[A-Za-z0-9_]+|cus_[A-Za-z0-9_]+)$/;
const PRICE_ID = /^price_[A-Za-z0-9_]+$/;
const CHECKOUT_ATTEMPT = /^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,18}$/;

export class ZoeBuildAiCreditFundingError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ZoeBuildAiCreditFundingError"; }
}
function refuse(code: string): never { throw new ZoeBuildAiCreditFundingError(code); }

export function validatedPackCatalog(packs: readonly ApprovedZoeBuildCreditPack[]) {
  const map = new Map<string, ApprovedZoeBuildCreditPack>();
  for (const pack of packs) {
    if (!PRICE_ID.test(pack.priceId) || !Number.isSafeInteger(pack.amountUsdMinor) ||
        pack.amountUsdMinor <= 0 || !POSITIVE_INTEGER.test(pack.creditUnits) ||
        BigInt(pack.creditUnits) > 9223372036854775807n || map.has(pack.priceId)) {
      refuse("AI_CREDIT_PACK_CATALOG_INVALID");
    }
    map.set(pack.priceId, pack);
  }
  return map;
}

/**
 * Exact server-verified fulfillment; no metadata-selected price, user, units,
 * provider billing assumption, or event ID is used to decide the grant.
 * Authenticated checkout events are processed at least once, so the wallet
 * sourceKey is payment-intent based and the ledger guarantees idempotency.
 * Live funding additionally requires an independently approved live pack registry.
 */
export async function reconcileZoeBuildAiCreditCheckout(input: Readonly<{
  event: Stripe.Event;
  deps: ZoeBuildAiCreditStripeDeps;
  mode: CreditFundingMode;
  approvedPacks: readonly ApprovedZoeBuildCreditPack[];
}>): Promise<CreditCheckoutResult> {
  const { event, deps } = input;
  if (!isZoeBuildAiCreditCheckoutEvent(event)) refuse("AI_CREDIT_NOT_A_CHECKOUT");
  const live = creditFundingIsLive(input.mode);
  if (live === null) refuse("AI_CREDIT_FUNDING_DISABLED");
  if (event.livemode !== live) refuse("AI_CREDIT_STRIPE_MODE_MISMATCH");
  const catalog = validatedPackCatalog(input.approvedPacks);
  if (!catalog.size) refuse("AI_CREDIT_PACK_CATALOG_EMPTY");
  const eventSession = event.data.object as Stripe.Checkout.Session;
  if (eventSession.livemode !== live ||
      typeof eventSession.id !== "string" || !STRIPE_ID.test(eventSession.id) ||
      !eventSession.id.startsWith(live ? "cs_live_" : "cs_test_")) refuse("AI_CREDIT_SESSION_INVALID");

  // Never trust the snapshot embedded in a webhook to describe final payment.
  const session = await deps.retrieveSession(eventSession.id);
  if (session.id !== eventSession.id || session.livemode !== live ||
      session.status !== "complete" || session.mode !== "payment" ||
      (session.metadata?.zoebuildAiCreditPurchase !== "v1" &&
       session.metadata?.zoebuildAiCreditPurchase !== "v2") ||
      session.metadata?.zoebuildAiCreditPurchase !== eventSession.metadata?.zoebuildAiCreditPurchase ||
      !session.customer || !session.customer.startsWith("cus_") ||
      !STRIPE_ID.test(session.customer) ||
      !session.payment_intent || !STRIPE_ID.test(session.payment_intent) ||
      !session.payment_intent.startsWith("pi_")) refuse("AI_CREDIT_SESSION_MISMATCH");
  if (session.payment_status === "unpaid") return { kind: "pending" };
  if (session.payment_status !== "paid") refuse("AI_CREDIT_NOT_PAID");

  const custom=session.metadata?.zoebuildAiCreditPurchase==="v2";
  // v2 grants are bound to the persisted local attempt, not a Stripe-generated
  // ephemeral price or user-controlled metadata. No live custom authorization.
  if (custom && live) refuse("AI_CREDIT_CUSTOM_TOPUP_NOT_APPROVED");
  let customProof:ZoeBuildAiCreditCheckoutProof|null=null;
  let customUserId:string|null=null;
  let customQuote:ReturnType<typeof quoteZoeTopUpUsdMinor>|null=null;
  if (custom) {
    const id=session.metadata?.checkoutAttemptId;
    if (!id || !CHECKOUT_ATTEMPT.test(id) ||
        session.metadata?.purchaseKind!==ZOE_CUSTOM_TOPUP_MARKER)
      refuse("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
    customUserId=await deps.findUserIdByCustomerId(session.customer);
    if (!customUserId) refuse("AI_CREDIT_CUSTOMER_NOT_MAPPED");
    customProof=await deps.findCheckoutAttempt(id);
    if (!customProof || customProof.attemptId!==id ||
        customProof.userId!==customUserId || customProof.customerId!==session.customer ||
        customProof.priceId!==ZOE_CUSTOM_TOPUP_MARKER ||
        customProof.stripeSessionId!==session.id)
      refuse("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
    try { customQuote=quoteZoeTopUpUsdMinor(customProof.amountUsdMinor); }
    catch { return refuse("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH"); }
    if (customProof.creditUnits!==BigInt(customQuote.creditUnits) ||
        customProof.pricingVersion!==ZOE_TOP_UP_POLICY.version ||
        session.metadata?.amountUsdMinor!==String(customQuote.amountUsdMinor) ||
        session.metadata?.creditUnits!==customQuote.creditUnits ||
        session.metadata?.pricingVersion!==ZOE_TOP_UP_POLICY.version)
      refuse("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
  }
  const lines = await deps.listLineItems(session.id);
  if (lines.has_more || lines.data.length !== 1) refuse("AI_CREDIT_LINE_ITEMS_INVALID");
  const line = lines.data[0]!;
  const pack = !custom && line.priceId ? catalog.get(line.priceId) : undefined;
  const amount = custom ? customQuote!.amountUsdMinor : pack?.amountUsdMinor;
  if ((!custom && !pack) || (custom && (!line.priceId || !PRICE_ID.test(line.priceId))) ||
      line.quantity !== 1 || session.currency !== "usd" ||
      session.amount_subtotal !== amount || session.amount_total !== amount ||
      session.total_details?.amount_discount !== 0 ||
      session.total_details?.amount_tax !== 0 ||
      line.amount_subtotal !== amount || line.amount_total !== amount)
    refuse("AI_CREDIT_PRICE_OR_AMOUNT_MISMATCH");

  // A paid checkout snapshot can outlive a refund or charge dispute in EITHER
  // Stripe environment. Independently re-read current payment and charge.
  const payment = await deps.retrievePaymentIntent(session.payment_intent);
  const charge = payment.latestCharge;
  if (payment.id !== session.payment_intent || payment.livemode !== live ||
      payment.status !== "succeeded" || payment.currency !== "usd" ||
      payment.amount !== amount ||
      payment.amount_received !== amount || !charge ||
      charge.paymentIntentId !== payment.id || !charge.paid || !charge.captured ||
      charge.refunded || charge.disputed || charge.amount_refunded !== 0 ||
      charge.currency !== "usd" || charge.amount !== amount) {
    refuse("AI_CREDIT_PAYMENT_NOT_CLEAR");
  }

  // Fixed packs retain the original immutable Price ID proof, while a custom
  // purchase uses the verified durable v2 snapshot loaded above.
  let userId:string;
  let grantUnits:string;
  if (custom) {
    userId=customUserId!;
    grantUnits=customQuote!.creditUnits;
  } else {
    userId=await deps.findUserIdByCustomerId(session.customer) ?? "";
    if (!userId) refuse("AI_CREDIT_CUSTOMER_NOT_MAPPED");
    const checkoutAttemptId=session.metadata?.checkoutAttemptId;
    const checkoutPriceId=session.metadata?.creditPackPriceId;
    if (!checkoutAttemptId || !CHECKOUT_ATTEMPT.test(checkoutAttemptId) ||
        checkoutPriceId!==pack!.priceId) refuse("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
    const proof=await deps.findCheckoutAttempt(checkoutAttemptId);
    if (!proof || proof.attemptId!==checkoutAttemptId || proof.userId!==userId ||
        proof.customerId!==session.customer || proof.priceId!==pack!.priceId ||
        proof.stripeSessionId!==session.id) refuse("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
    grantUnits=pack!.creditUnits;
  }
  const sourceKey = `stripe:zoebuild:pi:${payment.id}`;
  if (sourceKey.length > 160) refuse("AI_CREDIT_PAYMENT_ID_TOO_LONG");
  const grant = await deps.grantPurchasedCredits({
    userId, sourceKey, units: grantUnits,
  });
  return { kind: "funded", created: grant.created };
}
