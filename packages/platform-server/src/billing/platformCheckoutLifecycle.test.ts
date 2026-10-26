import {describe, expect, it, vi} from "vitest";
import {
  classifyPlatformCheckoutIntent,
  createOrRecoverPlatformSubscriptionCheckout,
  expirePlatformCheckoutSession,
  findPlatformCheckoutAttemptSession,
} from "./platformCheckoutLifecycle";

const attempt = "a274f3ee-20e4-437a-a2a7-65a002531e38";
const session = (overrides: Record<string, unknown> = {}) => ({
  id: "cs_test_123", mode: "subscription", status: "open", url: "https://checkout.stripe.test/abc",
  metadata: {checkoutAttemptId: attempt, priceId: "price_learning", useTrial: "false"},
  ...overrides,
});
const execute = (overrides: Record<string, unknown> = {}) => ({
  checkoutAttemptId: attempt, priceId: "price_learning", useTrial: false,
  successUrl: "https://learn.test/success?session_id={CHECKOUT_SESSION_ID}",
  listSessions: vi.fn().mockResolvedValue([]),
  createSession: vi.fn().mockResolvedValue(session()),
  ...overrides,
});

describe("canonical platform subscription Checkout", () => {
  it("classifies exact price and trial intent", () => {
    expect(classifyPlatformCheckoutIntent({session: session(), priceId: "price_learning", useTrial: false})).toBe("match");
    expect(classifyPlatformCheckoutIntent({session: session(), priceId: "price_builder", useTrial: false})).toBe("mismatch");
    expect(classifyPlatformCheckoutIntent({session: session(), priceId: "price_learning", useTrial: true})).toBe("mismatch");
  });
  it("does not guess intent without provider evidence", () => {
    expect(classifyPlatformCheckoutIntent({session: session({metadata: {checkoutAttemptId: attempt}}), priceId:"price_learning", useTrial:false})).toBe("unknown");
    expect(classifyPlatformCheckoutIntent({session: session({metadata: {useTrial:"false"}, line_items: {data:[{price:{id:"price_learning"}}]}}), priceId:"price_learning", useTrial:false})).toBe("match");
  });
  it("matches only the exact subscription attempt in allowed statuses", () => {
    const sessions = [session({status:"expired"}), session({id:"cs_other",metadata:{checkoutAttemptId:"other"}})];
    expect(findPlatformCheckoutAttemptSession({sessions,checkoutAttemptId:attempt,statuses:["open"]})).toBeNull();
    expect(findPlatformCheckoutAttemptSession({sessions,checkoutAttemptId:attempt,statuses:["expired"]})?.id).toBe("cs_test_123");
  });
  it("recovers matching sessions without issuing another POST", async () => {
    const values = execute({listSessions:vi.fn().mockResolvedValue([session()])});
    expect(await createOrRecoverPlatformSubscriptionCheckout(values)).toEqual({id:"cs_test_123",url:"https://checkout.stripe.test/abc"});
    expect(values.createSession).not.toHaveBeenCalled();
  });
  it("refuses a same-attempt different price before any new POST", async () => {
    const values = execute({listSessions:vi.fn().mockResolvedValue([session({metadata:{checkoutAttemptId:attempt,priceId:"price_builder",useTrial:"false"}})])});
    await expect(createOrRecoverPlatformSubscriptionCheckout(values)).rejects.toThrow("does not match");
    expect(values.createSession).not.toHaveBeenCalled();
  });
  it("uses provider id for a missing recovered URL", async () => {
    const values = execute({listSessions:vi.fn().mockResolvedValue([session({url:null})])});
    expect((await createOrRecoverPlatformSubscriptionCheckout(values)).url).toContain("cs_test_123");
  });
  it("creates one session when no recoverable session exists", async () => {
    const values = execute({listSessions:vi.fn().mockResolvedValue([session({status:"expired"})])});
    expect((await createOrRecoverPlatformSubscriptionCheckout(values)).id).toBe("cs_test_123");
    expect(values.createSession).toHaveBeenCalledOnce();
  });
  it("accepts proven terminal expiration after an ambiguous expire error", async () => {
    const expire = vi.fn().mockRejectedValue(new Error("race"));
    const retrieve = vi.fn().mockResolvedValue(session({status:"expired"}));
    await expect(expirePlatformCheckoutSession({sessionId:"cs_1",expire,retrieve})).resolves.toMatchObject({status:"expired"});
  });
  it("preserves original error when expiration is unproven", async () => {
    const original = new Error("stripe offline");
    await expect(expirePlatformCheckoutSession({sessionId:"cs_1",expire:vi.fn().mockRejectedValue(original),retrieve:vi.fn().mockResolvedValue(session({status:"open"}))})).rejects.toBe(original);
  });
});
