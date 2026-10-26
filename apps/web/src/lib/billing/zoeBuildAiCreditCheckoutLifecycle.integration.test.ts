/**
 * V12J.22: one cross-step CONTRACT regression for mode-bound Checkout ->
 * independently re-fetched payment -> single financial source identity.
 *
 * ALL Stripe, persistence and wallet dependencies in this file are fakes.
 * No real Stripe signature, PostgreSQL transaction or AI provider is exercised.
 * Do not count these tests as production end-to-end financial acceptance.
 * The mock ledger is NOT a replacement for the canonical immutable ledger.
 * Existing signed-webhook, PostgreSQL ledger and real-provider acceptance
 * suites must be executed separately with appropriate authorization.
 */
import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  createZoeBuildAiCreditTestCheckout,
  type ZoeBuildCreditCheckoutDeps,
} from "./zoeBuildAiCreditStripeCheckout";
import {
  reconcileZoeBuildAiCreditCheckout,
  type ZoeBuildAiCreditStripeDeps,
  type ApprovedZoeBuildCreditPack,
  type CreditFundingMode,
} from "./zoeBuildAiCreditStripeFunding";

const ATTEMPT = "zb-ai-123e4567-e89b-42d3-a456-426614174000";
const OWNER = "billing-fixture-owner";
const CUSTOMER = "cus_lifecycle_owner";
const PRICE: ApprovedZoeBuildCreditPack = {
  priceId: "price_fixture_approved", amountUsdMinor: 500, creditUnits: "500000",
};
const ORIGIN = "https://build.zoeskoul.com";

type SupportedMode = Exclude<CreditFundingMode, "off">;

function fixture(mode: SupportedMode) {
  const live = mode === "live";
  const checkoutId = live ? "cs_live_lifecycle" : "cs_test_lifecycle";
  const intentId = "pi_lifecycle";
  const metadata = {
    zoebuildAiCreditPurchase: "v1", checkoutAttemptId: ATTEMPT,
    creditPackPriceId: PRICE.priceId,
  };
  const claim = {attemptId: ATTEMPT, userId: OWNER, priceId: PRICE.priceId,
    customerId: CUSTOMER, stripeSessionId: null as string | null};
  let hasClaim = false;
  let paid = false;
  let disputed = false;
  let refunded = false;
  let owner = OWNER;
  let failAfterRemoteCreate = false;
  let grantTotal = 0n;
  const grantKeys = new Set<string>();
  const session = {id: checkoutId, livemode: live, mode: "payment", status: "open",
    customer: CUSTOMER, url: "https://checkout.stripe.com/c/pay/fixture", metadata};
  const sessions = new Map<string, typeof session>();

  const checkoutDeps: ZoeBuildCreditCheckoutDeps = {
    retrievePrice: vi.fn(async () => ({id: PRICE.priceId, livemode: live, active: true,
      type: "one_time", currency: "usd", unitAmount: PRICE.amountUsdMinor,
      billingScheme: "per_unit", recurring: false, customUnitAmount: false})),
    findCustomerForUser: vi.fn(async (userId: string) => userId === OWNER ? CUSTOMER : null),
    retrieveCustomer: vi.fn(async () => ({id: CUSTOMER, livemode: live, deleted: false})),
    claimAttempt: vi.fn(async (input) => {
      if (input.attemptId !== ATTEMPT || input.userId !== OWNER ||
          input.priceId !== PRICE.priceId || input.customerId !== CUSTOMER)
        throw Error("IMMUTABLE_CLAIM_CONFLICT");
      if (hasClaim) return {claimed: false, stripeSessionId: claim.stripeSessionId};
      hasClaim = true;
      return {claimed: true, stripeSessionId: null};
    }),
    recordSession: vi.fn(async (input) => {
      if (!hasClaim || input.attemptId !== ATTEMPT || input.userId !== OWNER ||
          input.customerId !== CUSTOMER || input.priceId !== PRICE.priceId ||
          !sessions.has(input.stripeSessionId)) throw Error("INVALID_DURABLE_CLAIM");
      claim.stripeSessionId = input.stripeSessionId;
      return {recorded: true};
    }),
    retrieveSession: vi.fn(async (id: string) => {
      const item = sessions.get(id); if (!item) throw Error("SESSION_NOT_FOUND"); return item;
    }),
    listSessions: vi.fn(async (customerId: string) => ({
      hasMore: false, data: customerId === CUSTOMER ? [...sessions.values()] : [],
    })),
    listLineItems: vi.fn(async (id: string) => ({hasMore: false,
      data: id === checkoutId ? [{quantity: 1, priceId: PRICE.priceId,
        amountSubtotal: PRICE.amountUsdMinor}] : []})),
    createSession: vi.fn(async (input) => {
      expect(input.customer).toBe(CUSTOMER);
      expect(input.metadata).toEqual(metadata);
      sessions.set(checkoutId, session);
      if (failAfterRemoteCreate) throw Error("PROVIDER_REPLY_LOST");
      return session;
    }),
  };

  const fundingDeps: ZoeBuildAiCreditStripeDeps = {
    retrieveSession: vi.fn(async (id) => ({...session, id,
      status: "complete", payment_status: paid ? "paid" : "unpaid",
      payment_intent: intentId, currency: "usd",
      amount_total: PRICE.amountUsdMinor, amount_subtotal: PRICE.amountUsdMinor,
      total_details: {amount_discount: 0, amount_tax: 0}})),
    listLineItems: vi.fn(async () => ({has_more: false, data: [{quantity: 1,
      priceId: PRICE.priceId, amount_subtotal: PRICE.amountUsdMinor,
      amount_total: PRICE.amountUsdMinor}]})),
    retrievePaymentIntent: vi.fn(async () => ({id: intentId, livemode: live,
      status: "succeeded", currency: "usd", amount: PRICE.amountUsdMinor,
      amount_received: PRICE.amountUsdMinor,
      latestCharge: {paymentIntentId: intentId, paid: true, captured: true,
        disputed, refunded, amount: PRICE.amountUsdMinor,
        amount_refunded: refunded ? PRICE.amountUsdMinor : 0, currency: "usd"}})),
    findUserIdByCustomerId: vi.fn(async (customerId) =>
      customerId === CUSTOMER ? owner : null),
    findCheckoutAttempt: vi.fn(async (id) =>
      id === ATTEMPT && hasClaim ? {...claim} : null),
    grantPurchasedCredits: vi.fn(async ({userId, sourceKey, units}) => {
      if (userId !== OWNER) throw Error("OWNER_NOT_AUTHORIZED");
      if (grantKeys.has(sourceKey)) return {created: false};
      grantKeys.add(sourceKey);
      grantTotal += BigInt(units);
      return {created: true};
    }),
  };

  function webhookEvent(type: "checkout.session.completed" | "checkout.session.async_payment_succeeded"
     = "checkout.session.completed", eventLive = live): Stripe.Event {
    return {id: `evt_${type.replaceAll(".", "_")}`, type, livemode: eventLive,
      data: {object: {...session}}} as unknown as Stripe.Event;
  }
  const input = {deps: checkoutDeps, userId: OWNER, checkoutAttemptId: ATTEMPT,
    priceId: PRICE.priceId, appOrigin: ORIGIN, mode, approvedPacks: [PRICE]};
  function reconcile(event: Stripe.Event = webhookEvent()) {
    return reconcileZoeBuildAiCreditCheckout({event, deps: fundingDeps, mode,
      approvedPacks: [PRICE]});
  }
  return {checkoutDeps, fundingDeps, input, reconcile, webhookEvent,
    markPaid: () => {paid = true;}, setDisputed: () => {disputed = true;},
    setRefunded: () => {refunded = true;}, setOwner: (value: string) => {owner = value;},
    loseFirstResponse: () => {failAfterRemoteCreate = true;},
    grantUnits: () => grantTotal, getClaim: () => ({...claim}),
  };
}

describe("V12J.22 checkout -> payment-proof -> wallet-source integration (in-memory)", () => {
  it.each(["sandbox-only", "live"] as const)("%s: one checkout, one grant across duplicate and async events", async mode => {
    const f = fixture(mode);
    const first = await createZoeBuildAiCreditTestCheckout(f.input);
    expect(first).toMatchObject({created: true, status: "open"});
    expect(f.getClaim().stripeSessionId).toBe(first.sessionId);
    const retry = await createZoeBuildAiCreditTestCheckout(f.input);
    expect(retry).toMatchObject({created: false, sessionId: first.sessionId});
    expect(f.checkoutDeps.createSession).toHaveBeenCalledTimes(1);
    // A redirect or checkout creation is not proof of a payment.
    expect(await f.reconcile()).toEqual({kind: "pending"});
    expect(f.grantUnits()).toBe(0n);
    f.markPaid();
    expect(await f.reconcile()).toEqual({kind: "funded", created: true});
    expect(await f.reconcile()).toEqual({kind: "funded", created: false});
    expect(await f.reconcile(f.webhookEvent("checkout.session.async_payment_succeeded")))
      .toEqual({kind: "funded", created: false});
    expect(f.grantUnits()).toBe(BigInt(PRICE.creditUnits));
    expect(f.fundingDeps.grantPurchasedCredits).toHaveBeenCalledWith({
      userId: OWNER, sourceKey: "stripe:zoebuild:pi:pi_lifecycle", units: PRICE.creditUnits,
    });
  });

  it("recovers a Stripe-created session after lost response without issuing a second checkout", async () => {
    const f = fixture("sandbox-only");
    f.loseFirstResponse();
    await expect(createZoeBuildAiCreditTestCheckout(f.input)).rejects.toThrow("PROVIDER_REPLY_LOST");
    const recovered = await createZoeBuildAiCreditTestCheckout(f.input);
    expect(recovered).toMatchObject({created: false, status: "open"});
    expect(f.checkoutDeps.createSession).toHaveBeenCalledTimes(1);
    expect(f.getClaim().stripeSessionId).toBe(recovered.sessionId);
  });

  it("does not create another checkout for a consumed claim when provider outcome is unknown", async () => {
    const f = fixture("sandbox-only");
    vi.mocked(f.checkoutDeps.createSession).mockRejectedValueOnce(Error("UNKNOWN_STRIPE_OUTCOME"));
    await expect(createZoeBuildAiCreditTestCheckout(f.input)).rejects.toThrow("UNKNOWN_STRIPE_OUTCOME");
    await expect(createZoeBuildAiCreditTestCheckout(f.input))
      .rejects.toThrow("AI_CREDIT_CHECKOUT_ATTEMPT_UNRESOLVED");
    expect(f.checkoutDeps.createSession).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-environment event before Stripe payment retrieval or credit grant", async () => {
    const f = fixture("live");
    await createZoeBuildAiCreditTestCheckout(f.input);
    f.markPaid();
    await expect(f.reconcile(f.webhookEvent("checkout.session.completed", false)))
      .rejects.toThrow("AI_CREDIT_STRIPE_MODE_MISMATCH");
    expect(f.fundingDeps.retrieveSession).not.toHaveBeenCalled();
    expect(f.fundingDeps.grantPurchasedCredits).not.toHaveBeenCalled();
  });

  it.each(["disputed", "refunded"] as const)("refuses a %s charge despite a paid checkout", async state => {
    const f = fixture("sandbox-only");
    await createZoeBuildAiCreditTestCheckout(f.input);
    f.markPaid();
    if (state === "disputed") f.setDisputed(); else f.setRefunded();
    await expect(f.reconcile()).rejects.toThrow("AI_CREDIT_PAYMENT_NOT_CLEAR");
    expect(f.grantUnits()).toBe(0n);
  });

  it("refuses a switched Stripe customer owner even with paid payment proof", async () => {
    const f = fixture("live");
    await createZoeBuildAiCreditTestCheckout(f.input);
    f.markPaid();f.setOwner("a-different-user");
    await expect(f.reconcile()).rejects.toThrow("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
    expect(f.grantUnits()).toBe(0n);
  });

  it("refuses to create checkout when the explicitly reviewed catalog is empty", async () => {
    const f = fixture("live");
    await expect(createZoeBuildAiCreditTestCheckout({...f.input, approvedPacks: []}))
      .rejects.toThrow("AI_CREDIT_PACK_CATALOG_EMPTY");
    expect(f.checkoutDeps.retrievePrice).not.toHaveBeenCalled();
    expect(f.checkoutDeps.createSession).not.toHaveBeenCalled();
  });
});
