import "server-only";
import type Stripe from "stripe";
import {prisma} from "@/lib/prisma";
import {getStripe} from "@/lib/stripe";
import {freezeAiCreditWalletForVerifiedStripeRisk} from "@zoeskoul/platform-server/ai-credits/ledger";
import {reconcileZoeBuildStripeRiskEvent, type ZoeBuildStripeRiskDeps} from "./zoeBuildAiCreditStripeRisk";

function expandableId(v: string | {id: string} | null | undefined): string | null {
  return typeof v === "string" ? v : v?.id ?? null;
}
const deps: ZoeBuildStripeRiskDeps = {
  async retrieveRefund(id) {
    const refund = await getStripe().refunds.retrieve(id);
    return {id: refund.id,
      chargeId: expandableId(refund.charge), status: refund.status ?? null, amount: refund.amount};
  },
  async retrieveDispute(id) {
    const dispute = await getStripe().disputes.retrieve(id);
    return {id: dispute.id, livemode: dispute.livemode,
      chargeId: expandableId(dispute.charge), status: dispute.status, amount: dispute.amount};
  },
  async retrieveCharge(id) {
    const charge = await getStripe().charges.retrieve(id);
    return {id: charge.id, livemode: charge.livemode,
      paymentIntentId: expandableId(charge.payment_intent),
      paid: charge.paid, captured: charge.captured, currency: charge.currency,
      amount: charge.amount, amountRefunded: charge.amount_refunded, disputed: charge.disputed};
  },
  async findFundingLot(sourceKey) {
    const lot = await prisma.aiCreditLot.findUnique({where: {sourceKey}, select: {userId: true}});
    return lot ? {userId: lot.userId} : null;
  },
  async freezeRisk(data) {
    return freezeAiCreditWalletForVerifiedStripeRisk({client: prisma, ...data});
  },
};

/** Only entered after the signed Stripe webhook verifies event authenticity. */
export function reconcileZoeBuildStripeRiskWebhook(event: Stripe.Event) {
  return reconcileZoeBuildStripeRiskEvent({event, deps});
}
