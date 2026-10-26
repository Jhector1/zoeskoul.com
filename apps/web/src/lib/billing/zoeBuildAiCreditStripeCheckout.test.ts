import { describe, expect, it, vi } from "vitest";
import {
  createZoeBuildAiCreditTestCheckout,
  type ZoeBuildCreditCheckoutDeps,
  type ZoeBuildCreditCheckoutSession,
} from "./zoeBuildAiCreditStripeCheckout";
import type { ApprovedZoeBuildCreditPack } from "./zoeBuildAiCreditStripeFunding";

const pack: ApprovedZoeBuildCreditPack = {
  priceId: "price_zoebuild_test_001", amountUsdMinor: 1200, creditUnits: "1200000",
};
const attempt = "zb-ai-123e4567-e89b-12d3-a456-426614174000";
const session: ZoeBuildCreditCheckoutSession = {
  id: "cs_test_123", livemode: false, mode: "payment", status: "open",
  customer: "cus_123", url: "https://checkout.stripe.com/c/pay/cs_test_123",
  metadata: {zoebuildAiCreditPurchase: "v1", checkoutAttemptId: attempt, creditPackPriceId: pack.priceId},
};
function fixture(options: {
  mode?: "off" | "sandbox-only";
  packs?: readonly ApprovedZoeBuildCreditPack[];
  inputPriceId?: string;
  appOrigin?: string;
  inputAttempt?: string;
  price?: Record<string, unknown>;
  customerId?: string | null;
  customer?: Record<string, unknown>;
  session?: ZoeBuildCreditCheckoutSession | null;
  many?: boolean;
  line?: Record<string, unknown>;
  created?: ZoeBuildCreditCheckoutSession;
  claimed?: boolean;
  recordedSession?: string | null;
  persistFails?: boolean;
} = {}) {
  const price = {id:pack.priceId,livemode:false,active:true,type:"one_time",
    currency:"usd",unitAmount:1200,billingScheme:"per_unit",recurring:false,
    customUnitAmount:false,...options.price};
  const customer = {id:"cus_123",livemode:false,deleted:false,...options.customer};
  const deps = {
    retrievePrice: vi.fn(async () => price),
    findCustomerForUser: vi.fn(async () => options.customerId === undefined ? "cus_123" : options.customerId),
    retrieveCustomer: vi.fn(async () => customer),
    claimAttempt: vi.fn(async () => ({claimed: options.claimed ?? true,
      stripeSessionId: options.recordedSession ?? null})),
    recordSession: vi.fn(async () => {
      if (options.persistFails) throw new Error("DB_SESSION_WRITE_FAILED");
      return {recorded: true};
    }),
    retrieveSession: vi.fn(async () => options.session ?? session),
    listSessions: vi.fn(async () => ({data: options.session ? [options.session] : [],hasMore: options.many ?? false})),
    listLineItems: vi.fn(async () => ({data:[{quantity:1,priceId:pack.priceId,amountSubtotal:1200,...options.line}],hasMore:false})),
    createSession: vi.fn(async () => options.created ?? session),
  } as unknown as ZoeBuildCreditCheckoutDeps;
  const input = {deps, userId:"server-auth-user",priceId:options.inputPriceId ?? pack.priceId,
    checkoutAttemptId:options.inputAttempt ?? attempt,appOrigin:options.appOrigin ?? "https://zoeskoul.com/",
    mode:options.mode ?? "sandbox-only",approvedPacks:options.packs ?? [pack]};
  return {deps, input};
}

describe("E16C5A2A sandbox-only ZoeBuild credit Checkout preparation", () => {
  it("creates a test-mode payment checkout using an exact approved pack", async () => {
    const {deps,input}=fixture();
    expect(await createZoeBuildAiCreditTestCheckout(input)).toEqual({
      sessionId:session.id,url:session.url,status:"open",created:true,
    });
    expect(deps.createSession).toHaveBeenCalledWith(expect.objectContaining({
      mode:"payment",customer:"cus_123",priceId:pack.priceId,quantity:1,
      metadata:{zoebuildAiCreditPurchase:"v1",checkoutAttemptId:attempt,creditPackPriceId:pack.priceId},
      successUrl:"https://zoeskoul.com/en/billing?credits=success&session_id={CHECKOUT_SESSION_ID}",
    }),expect.stringMatching(/^zoebuild-ai-credit-checkout-[a-f0-9]{64}$/));
  });
  it("fails closed if disabled, without touching Stripe", async () => {
    const {deps,input}=fixture({mode:"off"});
    await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow("AI_CREDIT_FUNDING_DISABLED");
    expect(deps.retrievePrice).not.toHaveBeenCalled();
  });
  it("refuses empty, duplicate and invalid pack catalogs before provider calls", async () => {
    for (const packs of [[],[pack,pack],[{...pack,creditUnits:"0"}]]) {
      const {deps,input}=fixture({packs});
      await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow();
      expect(deps.retrievePrice).not.toHaveBeenCalled();
    }
  });
  it("refuses any unapproved price ID before Stripe access", async () => {
    const {deps,input}=fixture({inputPriceId:"price_unapproved"});
    await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow("AI_CREDIT_PACK_UNAPPROVED");
    expect(deps.retrievePrice).not.toHaveBeenCalled();
  });
  it("rejects live, inactive, recurring, custom and mismatched Stripe prices", async () => {
    for (const price of [{livemode:true},{active:false},{type:"recurring"},{recurring:true},
      {currency:"eur"},{unitAmount:1100},{id:"price_bad"},{customUnitAmount:true},{billingScheme:"tiered"}]) {
      const {deps,input}=fixture({price});
      await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow("AI_CREDIT_CHECKOUT_PRICE_MISMATCH");
      expect(deps.findCustomerForUser).not.toHaveBeenCalled();
      expect(deps.createSession).not.toHaveBeenCalled();
    }
  });
  it("rejects customer missing, deleted, wrong account mode and mismatched identity", async () => {
    for (const arg of [{customerId:null},{customer:{deleted:true}},
      {customer:{livemode:true}},{customer:{id:"cus_different"}}]) {
      const {deps,input}=fixture(arg);
      await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow();
      expect(deps.createSession).not.toHaveBeenCalled();
    }
  });
  it("rejects invalid identifiers and untrusted external origins", async () => {
    for (const patch of [ {inputAttempt:"bad"}, {appOrigin:"http://zoeskoul.com"},
      {appOrigin:"https://evil.example/phishing"}, {appOrigin:"https://zoeskoul.com/?next=evil"},
      {appOrigin:"https://user:pass@zoeskoul.com/"}]) {
      const {deps,input}=fixture(patch);
      await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow();
      expect(deps.retrievePrice).not.toHaveBeenCalled();
    }
  });
  it("recovers matching existing open Checkout and creates no second Session", async () => {
    const {deps,input}=fixture({session});
    expect(await createZoeBuildAiCreditTestCheckout(input)).toMatchObject({created:false,sessionId:session.id});
    expect(deps.createSession).not.toHaveBeenCalled();
    expect(deps.listLineItems).toHaveBeenCalledWith(session.id);
  });
  it("returns completed Session without recharging or inventing a Checkout URL", async () => {
    const {deps,input}=fixture({session:{...session,status:"complete",url:null}});
    expect(await createZoeBuildAiCreditTestCheckout(input)).toMatchObject({created:false,status:"complete",url:null});
    expect(deps.createSession).not.toHaveBeenCalled();
  });
  it("rejects expired attempt; requires a new deliberate attempt ID", async () => {
    const {deps,input}=fixture({session:{...session,status:"expired",url:null}});
    await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow("AI_CREDIT_CHECKOUT_ATTEMPT_EXPIRED");
    expect(deps.createSession).not.toHaveBeenCalled();
  });
  it("refuses replay when prior attempt price, customer or line items differ", async () => {
    for (const arg of [{session:{...session,customer:"cus_else"}},
      {session:{...session,metadata:{...session.metadata!,creditPackPriceId:"price_wrong"}}},
      {session,line:{quantity:2}},{session,line:{priceId:"price_wrong"}}]) {
      const {deps,input}=fixture(arg);
      await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow("AI_CREDIT_CHECKOUT_ATTEMPT_CONFLICT");
      expect(deps.createSession).not.toHaveBeenCalled();
    }
  });
  it("rejects truncated Stripe session history rather than risking duplicate payment", async () => {
    const {deps,input}=fixture({many:true});
    await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow("AI_CREDIT_CHECKOUT_HISTORY_INCOMPLETE");
    expect(deps.createSession).not.toHaveBeenCalled();
  });
  it("rejects suspicious created sessions even after Stripe response", async () => {
    for (const created of [{...session,livemode:true},
      {...session,metadata:{...session.metadata!,creditPackPriceId:"price_wrong"}},
      {...session,status:"complete"},{...session,url:null}]) {
      const {deps,input}=fixture({created});
      await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow("AI_CREDIT_CHECKOUT_CREATED_SESSION_INVALID");
      expect(deps.createSession).toHaveBeenCalledTimes(1);
    }
  });
  it("uses a deterministic Stripe idempotency key for repeated legitimate attempts", async () => {
    const first=fixture();const second=fixture();
    await createZoeBuildAiCreditTestCheckout(first.input);
    await createZoeBuildAiCreditTestCheckout(second.input);
    expect(vi.mocked(first.deps.createSession).mock.calls[0]![1]).toEqual(
      vi.mocked(second.deps.createSession).mock.calls[0]![1]);
  });
  it("records a durable attempt before Stripe creates its session", async () => {
    const {deps,input}=fixture();
    await createZoeBuildAiCreditTestCheckout(input);
    expect(deps.claimAttempt).toHaveBeenCalledWith({attemptId: attempt,
      userId: "server-auth-user", priceId: pack.priceId, customerId: "cus_123"});
    expect(deps.recordSession).toHaveBeenCalledWith(expect.objectContaining({
      stripeSessionId: session.id, attemptId: attempt}));
    expect(vi.mocked(deps.claimAttempt).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.createSession).mock.invocationCallOrder[0]!);
  });
  it("never re-creates an unrecorded earlier attempt with uncertain Stripe outcome", async () => {
    const {deps,input}=fixture({claimed:false});
    await expect(createZoeBuildAiCreditTestCheckout(input))
      .rejects.toThrow("AI_CREDIT_CHECKOUT_ATTEMPT_UNRESOLVED");
    expect(deps.createSession).not.toHaveBeenCalled();
  });
  it("recovers an immutable DB-linked session without scanning truncated history", async () => {
    const {deps,input}=fixture({claimed:false,recordedSession:session.id,session,many:true});
    const output=await createZoeBuildAiCreditTestCheckout(input);
    expect(output).toMatchObject({created:false,sessionId:session.id});
    expect(deps.retrieveSession).toHaveBeenCalledWith(session.id);
    expect(deps.listSessions).not.toHaveBeenCalled();
    expect(deps.createSession).not.toHaveBeenCalled();
  });
  it("resolves an uncertain first session found in history and persists it", async () => {
    const {deps,input}=fixture({claimed:false,session});
    expect(await createZoeBuildAiCreditTestCheckout(input)).toMatchObject({created:false});
    expect(deps.recordSession).toHaveBeenCalledTimes(1);
    expect(deps.createSession).not.toHaveBeenCalled();
  });
  it("refuses completion if the DB cannot capture created session", async () => {
    const {deps,input}=fixture({persistFails:true});
    await expect(createZoeBuildAiCreditTestCheckout(input)).rejects.toThrow("DB_SESSION_WRITE_FAILED");
    expect(deps.createSession).toHaveBeenCalledTimes(1);
  });

});
