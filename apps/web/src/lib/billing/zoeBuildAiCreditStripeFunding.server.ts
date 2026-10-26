import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { grantAiCreditLot } from "@zoeskoul/platform-server/ai-credits/ledger";
import {
  approvedZoeBuildCreditPacks,
  reconcileZoeBuildAiCreditCheckout,
  type CreditFundingMode,
  type ZoeBuildAiCreditStripeDeps,
} from "./zoeBuildAiCreditStripeFunding";

const deps: ZoeBuildAiCreditStripeDeps = {
  async retrieveSession(id) {
    const session = await getStripe().checkout.sessions.retrieve(id);
    return {
      id: session.id, livemode: session.livemode,
      status: session.status, mode: session.mode,
      payment_status: session.payment_status,
      customer: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      payment_intent: typeof session.payment_intent === "string"
        ? session.payment_intent : session.payment_intent?.id ?? null,
      currency: session.currency, amount_total: session.amount_total,
      amount_subtotal: session.amount_subtotal,
      metadata: session.metadata, total_details: session.total_details,
    };
  },
  async listLineItems(id) {
    const items = await getStripe().checkout.sessions.listLineItems(id, { limit: 2 });
    return { has_more: items.has_more, data: items.data.map((item) => ({
      quantity: item.quantity,
      priceId: item.price?.id ?? null,
      amount_subtotal: item.amount_subtotal,
      amount_total: item.amount_total,
    })) };
  },
  async retrievePaymentIntent(id) {
    const payment = await getStripe().paymentIntents.retrieve(id, { expand: ["latest_charge"] });
    const charge = typeof payment.latest_charge === "object" ? payment.latest_charge : null;
    return {
      id: payment.id, livemode: payment.livemode,
      status: payment.status, currency: payment.currency,
      amount: payment.amount, amount_received: payment.amount_received,
      latestCharge: charge ? {
        paymentIntentId: typeof charge.payment_intent === "string"
          ? charge.payment_intent : charge.payment_intent?.id ?? null,
        paid: charge.paid, captured: charge.captured,
        refunded: charge.refunded, disputed: charge.disputed,
        amount: charge.amount, amount_refunded: charge.amount_refunded,
        currency: charge.currency,
      } : null,
    };
  },
  async findUserIdByCustomerId(customerId) {
    const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
    return user?.id ?? null;
  },
  async findCheckoutAttempt(attemptId) {
    const row = await prisma.zoeBuildAiCreditCheckoutAttempt.findUnique({
      where: { attemptId },
      select: { attemptId: true, userId: true, priceId: true,
        customerId: true, stripeSessionId: true, amountUsdMinor:true,
        creditUnits:true,pricingVersion:true },
    });
    return row;
  },
  async grantPurchasedCredits({userId, sourceKey, units}) {
    return grantAiCreditLot({client: prisma, userId, sourceKey, units,
      kind: "purchased", origin: "verified-stripe-payment", expiresAt: null });
  },
};

/** Only the signed existing Stripe webhook calls this. No public grant route. */
export async function reconcileZoeBuildAiCreditCheckoutEvent(event: Stripe.Event) {
  const rawMode = process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE;
  const mode: CreditFundingMode = rawMode === "sandbox-only" || rawMode === "live" ? rawMode : "off";
  return reconcileZoeBuildAiCreditCheckout({
    event, deps, mode, approvedPacks: approvedZoeBuildCreditPacks(mode),
  });
}
