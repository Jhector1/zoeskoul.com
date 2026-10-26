import type Stripe from "stripe";

/** Provider lookups must be current, independently retrieved Stripe API records. */
export type ZoeBuildStripeRiskDeps = Readonly<{
  retrieveRefund(id: string): Promise<Readonly<{
    id: string; chargeId: string | null;
    status: string | null; amount: number;
  }>>;
  retrieveDispute(id: string): Promise<Readonly<{
    id: string; livemode: boolean; chargeId: string | null;
    amount: number; status: string;
  }>>;
  retrieveCharge(id: string): Promise<Readonly<{
    id: string; livemode: boolean; paymentIntentId: string | null;
    paid: boolean; captured: boolean; currency: string;
    amount: number; amountRefunded: number; disputed: boolean;
  }>>;
  findFundingLot(sourceKey: string): Promise<{userId: string} | null>;
  freezeRisk(input: Readonly<{
    sourceKey: string; stripeEventId: string; kind: "refund" | "dispute";
    providerObjectId: string; paymentIntentId: string; chargeId: string;
    refundedAmountUsdMinor: number; chargedAmountUsdMinor: number;
  }>): Promise<{kind: "frozen"; created: boolean} | {kind: "not_funded"}>;
}>;

export class ZoeBuildStripeRiskError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ZoeBuildStripeRiskError"; }
}
function refuse(code: string): never { throw new ZoeBuildStripeRiskError(code); }
const OBJECT = /^(?:re_|dp_|ch_)[A-Za-z0-9_]+$/;
const CHARGE = /^ch_[A-Za-z0-9_]+$/;
const PAYMENT = /^pi_[A-Za-z0-9_]+$/;

export function isZoeBuildStripeRiskEvent(event: Stripe.Event): boolean {
  return event.type.startsWith("refund.") || event.type === "charge.refunded" ||
    event.type.startsWith("charge.dispute.");
}

/**
 * Signature verification belongs to the existing webhook endpoint. Event data
 * supplies only a lookup ID; provider-managed current records prove the risk.
 * A refund/dispute of another product falls through to its existing handler.
 * This stage freezes new spend; it does NOT deduct/erase any credit units.
 */
export async function reconcileZoeBuildStripeRiskEvent(input: Readonly<{
  event: Stripe.Event;
  deps: ZoeBuildStripeRiskDeps;
}>): Promise<{kind: "frozen"; created: boolean} | {kind: "not_zoebuild"} | {kind: "no_current_risk"}> {
  const {event, deps} = input;
  if (!isZoeBuildStripeRiskEvent(event)) refuse("AI_CREDIT_NOT_A_STRIPE_RISK_EVENT");
  const obj = event.data.object as {id?: unknown};
  if (typeof obj?.id !== "string" || !OBJECT.test(obj.id) ||
      typeof event.id !== "string" || !/^evt_[A-Za-z0-9_]+$/.test(event.id)) {
    refuse("AI_CREDIT_RISK_EVENT_ID_INVALID");
  }
  let chargeId: string | null = null;
  let kind: "refund" | "dispute" = "refund";
  if (event.type.startsWith("refund.")) {
    if (!obj.id.startsWith("re_")) refuse("AI_CREDIT_RISK_EVENT_ID_INVALID");
    const refund = await deps.retrieveRefund(obj.id);
    if (refund.id !== obj.id ||
        !CHARGE.test(refund.chargeId ?? "") || !Number.isSafeInteger(refund.amount) || refund.amount <= 0 ||
        !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(refund.status ?? "")) {
      refuse("AI_CREDIT_REFUND_LOOKUP_MISMATCH");
    }
    chargeId = refund.chargeId;
    // Failed/canceled refunds cannot reverse funds, but another refund may.
    // Check the current charge's cumulative refunded amount below.
    const charge = await deps.retrieveCharge(chargeId!);
    return applyCurrentRisk({event, deps, objId: obj.id, kind,
      chargeId: chargeId!, charge,
      refundActive: refund.status !== "failed" && refund.status !== "canceled"});
  }
  if (event.type.startsWith("charge.dispute.")) {
    kind = "dispute";
    if (!obj.id.startsWith("dp_")) refuse("AI_CREDIT_RISK_EVENT_ID_INVALID");
    const dispute = await deps.retrieveDispute(obj.id);
    if (dispute.id !== obj.id || dispute.livemode !== event.livemode ||
        !CHARGE.test(dispute.chargeId ?? "") || !Number.isSafeInteger(dispute.amount) || dispute.amount <= 0 ||
        !dispute.status) refuse("AI_CREDIT_DISPUTE_LOOKUP_MISMATCH");
    chargeId = dispute.chargeId;
    const charge = await deps.retrieveCharge(chargeId!);
    return applyCurrentRisk({event, deps, objId: obj.id, kind,
      chargeId: chargeId!, charge, refundActive: true});
  }
  if (!obj.id.startsWith("ch_")) refuse("AI_CREDIT_RISK_EVENT_ID_INVALID");
  chargeId = obj.id;
  const charge = await deps.retrieveCharge(chargeId);
  return applyCurrentRisk({event, deps, objId: obj.id, kind,
    chargeId, charge, refundActive: false});
}

async function applyCurrentRisk(args: {
  event: Stripe.Event;
  deps: ZoeBuildStripeRiskDeps;
  objId: string;
  kind: "refund" | "dispute";
  chargeId: string;
  charge: Awaited<ReturnType<ZoeBuildStripeRiskDeps["retrieveCharge"]>>;
  refundActive: boolean;
}) {
  const {event, deps, charge, kind, objId, chargeId} = args;
  if (charge.id !== chargeId || charge.livemode !== event.livemode ||
      !PAYMENT.test(charge.paymentIntentId ?? "") ||
      !charge.paid || !charge.captured || charge.currency !== "usd" ||
      !Number.isSafeInteger(charge.amount) || charge.amount <= 0 ||
      !Number.isSafeInteger(charge.amountRefunded) || charge.amountRefunded < 0 ||
      charge.amountRefunded > charge.amount) refuse("AI_CREDIT_CHARGE_LOOKUP_MISMATCH");
  const sourceKey = `stripe:zoebuild:pi:${charge.paymentIntentId!}`;
  const lot = await deps.findFundingLot(sourceKey);
  if (!lot) return {kind: "not_zoebuild" as const};
  // Test and live Stripe risk events follow the SAME validated accounting path.
  // Provider mode is verified above against the independently fetched Charge
  // (and Dispute where present); only an original funded lot can be frozen.
  if (kind === "refund" && !args.refundActive && charge.amountRefunded === 0)
    return {kind: "no_current_risk" as const};
  const outcome = await deps.freezeRisk({
    sourceKey, stripeEventId: event.id, kind, providerObjectId: objId,
    paymentIntentId: charge.paymentIntentId!, chargeId,
    refundedAmountUsdMinor: charge.amountRefunded,
    chargedAmountUsdMinor: charge.amount,
  });
  return outcome.kind === "not_funded" ? {kind: "not_zoebuild" as const} : outcome;
}
