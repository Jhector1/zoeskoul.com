import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { ZoeBuildAiCreditCheckoutProof } from "./zoeBuildAiCreditStripeFunding";
import {
  isZoeBuildAiCreditCheckoutEvent,
  reconcileZoeBuildAiCreditCheckout,
  type ZoeBuildAiCreditStripeDeps,
  type ApprovedZoeBuildCreditPack,
} from "./zoeBuildAiCreditStripeFunding";

const checkoutAttemptId = "zb-ai-123e4567-e89b-12d3-a456-426614174000";
const pack: ApprovedZoeBuildCreditPack = {
  priceId: "price_zoebuild_test_001", amountUsdMinor: 1200, creditUnits: "1200000",
};
const session = {
  id: "cs_test_12345", livemode: false, status: "complete", mode: "payment",
  payment_status: "paid", customer: "cus_12345", payment_intent: "pi_12345",
  currency: "usd", amount_total: 1200, amount_subtotal: 1200,
  total_details: { amount_discount: 0, amount_tax: 0 },
  metadata: { zoebuildAiCreditPurchase: "v1", userId: "forged-user",
    checkoutAttemptId, creditPackPriceId: pack.priceId },
};
const line = { quantity: 1, priceId: pack.priceId, amount_total: 1200, amount_subtotal: 1200 };
const payment = { id: "pi_12345", livemode: false, status: "succeeded", currency: "usd",
  amount: 1200, amount_received: 1200, latestCharge: {
    paymentIntentId: "pi_12345", paid: true, captured: true, refunded: false,
    disputed: false, amount: 1200, amount_refunded: 0, currency: "usd",
  } };
const event = {
  id: "evt_123", type: "checkout.session.completed", livemode: false,
  data: { object: { ...session } },
} as unknown as Stripe.Event;
function setup(options: {
  session?: Partial<Omit<typeof session, "metadata">> & { metadata?: Record<string, string> }; line?: Partial<typeof line>;
  payment?: Partial<typeof payment>; event?: Stripe.Event;
  userId?: string | null; packs?: readonly ApprovedZoeBuildCreditPack[];
  mode?: "off" | "sandbox-only"; hasMore?: boolean;
  proof?: ZoeBuildAiCreditCheckoutProof | null;
} = {}) {
  const currentSession = { ...session, ...options.session };
  const currentLine = { ...line, ...options.line };
  const currentPayment = { ...payment, ...options.payment };
  const grantPurchasedCredits = vi.fn(async () => ({created:true}));
  const deps = {
    retrieveSession: vi.fn(async () => currentSession),
    listLineItems: vi.fn(async () => ({ data: [currentLine], has_more: options.hasMore ?? false })),
    retrievePaymentIntent: vi.fn(async () => currentPayment),
    findUserIdByCustomerId: vi.fn(async () => options.userId === undefined ? "server-owner" : options.userId),
    findCheckoutAttempt: vi.fn(async () => options.proof === undefined
      ? {attemptId: checkoutAttemptId, userId: "server-owner", priceId: pack.priceId,
          customerId: "cus_12345", stripeSessionId: session.id}
      : options.proof),
    grantPurchasedCredits,
  } as ZoeBuildAiCreditStripeDeps;
  const input = {event: options.event ?? event, deps, mode: options.mode ?? "sandbox-only",
    approvedPacks: options.packs ?? [pack]};
  return {deps, grantPurchasedCredits, input};
}

describe("E16C5A sandbox-only Stripe credit fulfillment", () => {
  it("grants exact reviewed pack once by payment intent using DB-resolved owner", async () => {
    const {input, grantPurchasedCredits, deps} = setup();
    expect(isZoeBuildAiCreditCheckoutEvent(event)).toBe(true);
    await expect(reconcileZoeBuildAiCreditCheckout(input)).resolves.toEqual({kind:"funded",created:true});
    expect(grantPurchasedCredits).toHaveBeenCalledWith({
      userId:"server-owner",sourceKey:"stripe:zoebuild:pi:pi_12345",units:"1200000",
    });
    expect(deps.findUserIdByCustomerId).toHaveBeenCalledWith("cus_12345");
  });
  it("fails closed when funding is off or live, without any provider or grant call", async () => {
    const off = setup({mode:"off"});
    await expect(reconcileZoeBuildAiCreditCheckout(off.input))
      .rejects.toThrow("AI_CREDIT_FUNDING_DISABLED");
    expect(off.deps.retrieveSession).not.toHaveBeenCalled();
    const live = setup({event:{...event,livemode:true} as Stripe.Event});
    await expect(reconcileZoeBuildAiCreditCheckout(live.input))
      .rejects.toThrow("AI_CREDIT_STRIPE_MODE_MISMATCH");
    expect(live.deps.retrieveSession).not.toHaveBeenCalled();
  });
  it("refuses empty or duplicate/invalid pack catalogs before provider calls", async () => {
    for (const packs of [[],[pack,pack],[{...pack,creditUnits:"-1"}]]) {
      const x=setup({packs});
      await expect(reconcileZoeBuildAiCreditCheckout(x.input)).rejects.toThrow();
      expect(x.deps.retrieveSession).not.toHaveBeenCalled();
    }
  });
  it("refuses forged checkout mode, mismatched session identity or live session", async () => {
    const invalidEvent={...event,data:{object:{...session,mode:"subscription"}}} as unknown as Stripe.Event;
    expect(isZoeBuildAiCreditCheckoutEvent(invalidEvent)).toBe(false);
    const x=setup({session:{id:"cs_test_another"}});
    await expect(reconcileZoeBuildAiCreditCheckout(x.input))
      .rejects.toThrow("AI_CREDIT_SESSION_MISMATCH");
    const y=setup({session:{livemode:true}});
    await expect(reconcileZoeBuildAiCreditCheckout(y.input))
      .rejects.toThrow("AI_CREDIT_SESSION_MISMATCH");
  });
  it("never grants a checkout while payment is unpaid", async () => {
    const x=setup({session:{payment_status:"unpaid"}});
    expect(await reconcileZoeBuildAiCreditCheckout(x.input)).toEqual({kind:"pending"});
    expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
    expect(x.deps.listLineItems).not.toHaveBeenCalled();
  });
  it("rejects wrong line price, unexpected quantity and additional line items", async () => {
    for (const opts of [
      {line:{priceId:"price_wrong"}}, {line:{quantity:2}}, {hasMore:true},
    ]) {
      const x=setup(opts);
      await expect(reconcileZoeBuildAiCreditCheckout(x.input)).rejects.toThrow(
        opts.hasMore ? "AI_CREDIT_LINE_ITEMS_INVALID" : "AI_CREDIT_PRICE_OR_AMOUNT_MISMATCH");
      expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
    }
  });
  it("rejects discounted, taxed, altered totals and incorrect currency", async () => {
    for (const patch of [
      {currency:"eur"}, {amount_total:600}, {amount_subtotal:1100},
      {total_details:{amount_discount:100,amount_tax:0}},
      {total_details:{amount_discount:0,amount_tax:100}},
    ]) {
      const x=setup({session:patch});
      await expect(reconcileZoeBuildAiCreditCheckout(x.input)).rejects.toThrow("AI_CREDIT_PRICE_OR_AMOUNT_MISMATCH");
      expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
    }
  });
  it("rejects refunded, disputed, uncaptured or altered charges", async () => {
    for (const chargePatch of [
      {refunded:true},{amount_refunded:200},{disputed:true},{paid:false},
      {captured:false},{paymentIntentId:"pi_wrong"},{amount:800},
    ]) {
      const x=setup({payment:{latestCharge:{...payment.latestCharge,...chargePatch}}});
      await expect(reconcileZoeBuildAiCreditCheckout(x.input)).rejects.toThrow("AI_CREDIT_PAYMENT_NOT_CLEAR");
      expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
    }
  });
  it("rejects incorrect payment intent amount, mode and live billing", async () => {
    for (const patch of [{amount_received:600},{status:"requires_capture"},
      {livemode:true},{currency:"eur"}]) {
      const x=setup({payment:patch});
      await expect(reconcileZoeBuildAiCreditCheckout(x.input)).rejects.toThrow("AI_CREDIT_PAYMENT_NOT_CLEAR");
      expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
    }
  });
  it("refuses missing customer mapping and never trusts session user metadata", async () => {
    const x=setup({userId:null});
    await expect(reconcileZoeBuildAiCreditCheckout(x.input)).rejects.toThrow("AI_CREDIT_CUSTOMER_NOT_MAPPED");
    expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
  });
  it("never issues credits for paid Stripe sessions not tied to the durable checkout claim", async () => {
    for (const proof of [null, {attemptId:checkoutAttemptId,userId:"other-user",
        priceId:pack.priceId,customerId:"cus_12345",stripeSessionId:session.id},
      {attemptId:checkoutAttemptId,userId:"server-owner",priceId:"price_wrong",
        customerId:"cus_12345",stripeSessionId:session.id},
      {attemptId:checkoutAttemptId,userId:"server-owner",priceId:pack.priceId,
        customerId:"cus_wrong",stripeSessionId:session.id},
      {attemptId:checkoutAttemptId,userId:"server-owner",priceId:pack.priceId,
        customerId:"cus_12345",stripeSessionId:"cs_test_elsewhere"}]) {
      const x=setup({proof});
      await expect(reconcileZoeBuildAiCreditCheckout(x.input))
        .rejects.toThrow("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
      expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
    }
  });
  it("rejects missing, forged or price-mismatched checkout identity metadata", async () => {
    for(const metadata of [
      {zoebuildAiCreditPurchase:"v1",checkoutAttemptId:"bad",creditPackPriceId:pack.priceId},
      {zoebuildAiCreditPurchase:"v1",creditPackPriceId:pack.priceId},
      {zoebuildAiCreditPurchase:"v1",checkoutAttemptId,creditPackPriceId:"price_else"},
    ]) {
      const x=setup({session:{metadata: metadata as Record<string,string>}});
      await expect(reconcileZoeBuildAiCreditCheckout(x.input))
        .rejects.toThrow("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
      expect(x.deps.findCheckoutAttempt).not.toHaveBeenCalled();
      expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
    }
  });
  it("propagates checkout-claim database outages for webhook retries", async () => {
    const x=setup();
    vi.mocked(x.deps.findCheckoutAttempt).mockRejectedValueOnce(new Error("claim-db-down"));
    await expect(reconcileZoeBuildAiCreditCheckout(x.input)).rejects.toThrow("claim-db-down");
    expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
  });
  it("allows async success event using the same canonical payment-intent source key", async () => {
    const x=setup({event:{...event,type:"checkout.session.async_payment_succeeded"} as Stripe.Event});
    await reconcileZoeBuildAiCreditCheckout(x.input);
    expect(x.grantPurchasedCredits).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey:"stripe:zoebuild:pi:pi_12345",
    }));
  });
  it("recognizes a duplicate successful payment without creating a second grant", async () => {
    const x=setup();
    vi.mocked(x.deps.grantPurchasedCredits).mockResolvedValue({created:false});
    await expect(reconcileZoeBuildAiCreditCheckout(x.input))
      .resolves.toEqual({kind:"funded",created:false});
    expect(x.grantPurchasedCredits).toHaveBeenCalledTimes(1);
    expect(x.grantPurchasedCredits).toHaveBeenCalledWith({
      userId:"server-owner",sourceKey:"stripe:zoebuild:pi:pi_12345",units:"1200000",
    });
  });
  it("refuses refunded payment evidence before invoking the grant writer", async () => {
    const x=setup({payment:{latestCharge:{...payment.latestCharge,amount_refunded:1}}});
    await expect(reconcileZoeBuildAiCreditCheckout(x.input))
      .rejects.toThrow("AI_CREDIT_PAYMENT_NOT_CLEAR");
    expect(x.grantPurchasedCredits).not.toHaveBeenCalled();
  });
  it("propagates ledger failure for webhook retries instead of hiding a missed grant", async () => {
    const x=setup();
    vi.mocked(x.deps.grantPurchasedCredits).mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(reconcileZoeBuildAiCreditCheckout(x.input)).rejects.toThrow("DB unavailable");
  });
});
