import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ projection: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./reconcileBuilderAiSubscriptionGrants", () => ({
  reconcileBuilderAiSubscriptionGrants: mocks.projection,
}));
import { reconcileBuilderAiBillingForUser, inspectBuilderAiBillingForUser } from "./reconcileBuilderAiBillingForUser";
import type { PrismaClient } from "@zoeskoul/db";

const now = new Date("2026-10-19T00:00:00.000Z");
const future = new Date("2026-11-19T00:00:00.000Z");
const past = new Date("2026-10-18T00:00:00.000Z");
const original = process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS;
function client(rows: Array<{status: string; priceId: string | null; trialEnd: Date | null; currentPeriodEnd: Date | null; stripeCustomerId?: string;billingProduct?: string|null}>, storedCustomerId: string | null = "cus_owner") {
  const store = {
    user: { findUnique: vi.fn(async () => ({stripeCustomerId:storedCustomerId})) },
    subscription: { findMany: vi.fn(async () => rows.map(row => ({
      ...row, stripeCustomerId: row.stripeCustomerId ?? "cus_owner",
      billingProduct:row.billingProduct === undefined ? (row.priceId?.startsWith("price_builder") ? "builder_ai" : "learning") : row.billingProduct,
    }))) },
  };
  return store as unknown as PrismaClient;
}
function sub(priceId: string | null, status = "active", currentPeriodEnd = future) {
  return { priceId, status, currentPeriodEnd, trialEnd: null };
}

describe("verified Builder AI subscription reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS = "price_builderMonthly,price_builderAnnual";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS;
    else process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS = original;
  });
  it("inspects subscription eligibility without reconciling grants or exposing price IDs", async () => {
    const evidence = await inspectBuilderAiBillingForUser(" user_1 ", {
      client: client([sub("price_learning"), sub("price_builderMonthly", "active", future)]), now,
    });
    expect(evidence).toEqual({
      catalogConfigured: true, subscriptionCount: 2,
      matchedProductCount: 1, eligibleSubscriptionCount: 1,
      eligible: true, endsAt: future,
    });
    expect(mocks.projection).not.toHaveBeenCalled();
    expect(JSON.stringify(evidence)).not.toContain("price_builderMonthly");
  });
  it("does not consider a legacy generation grant as proof of billing eligibility", async () => {
    const evidence = await inspectBuilderAiBillingForUser("user_1", {
      client: client([sub("price_learning")]), now,
    });
    expect(evidence.eligible).toBe(false);
    expect(evidence.matchedProductCount).toBe(0);
    expect(mocks.projection).not.toHaveBeenCalled();
  });
  it("uses explicit Builder AI prices and the longest eligible period", async () => {
    const store = client([sub("price_learning"), sub("price_builderMonthly", "active", future),
      sub("price_builderAnnual", "active", new Date("2026-12-19T00:00:00Z"))]);
    await reconcileBuilderAiBillingForUser(" user_1 ", {client: store, now});
    expect(store.subscription.findMany).toHaveBeenCalledWith({where:{userId:"user_1"},select:{
      status:true,priceId:true,billingProduct:true,trialEnd:true,currentPeriodEnd:true,stripeCustomerId:true,
    }});
    expect(mocks.projection).toHaveBeenCalledWith(expect.objectContaining({
      userId:"user_1", client:store, endsAt:new Date("2026-12-19T00:00:00Z"),
      eligibility:{subscriptionActive:true,productIncludesBuilderAi:true}, now,
    }));
  });
  it("refuses active Builder subscriptions belonging to another platform customer", async () => {
    const evidence=await inspectBuilderAiBillingForUser("user_1", {client:client([
      {...sub("price_builderMonthly"),stripeCustomerId:"cus_foreign"},
    ]),now});
    expect(evidence.eligible).toBe(false);
    expect(evidence.matchedProductCount).toBe(0);
    await reconcileBuilderAiBillingForUser("user_1",{client:client([
      {...sub("price_builderMonthly"),stripeCustomerId:"cus_foreign"},
    ]),now});
    expect(mocks.projection).toHaveBeenCalledWith(expect.objectContaining({
      eligibility:{subscriptionActive:false,productIncludesBuilderAi:false},
    }));
  });
  it("does not grant Builder access without a stored platform customer binding",async()=>{
    const evidence=await inspectBuilderAiBillingForUser("user_1", {
      client:client([sub("price_builderMonthly")],null),now,
    });
    expect(evidence.eligible).toBe(false);
  });
  it("refuses a Builder price whose canonical product classification is missing or learning",async()=>{
    for(const label of [null,"learning"]){
      const evidence=await inspectBuilderAiBillingForUser("u",{client:client([
        {...sub("price_builderMonthly"),billingProduct:label},
      ]),now});
      expect(evidence.eligible).toBe(false);
    }
  });
  it("denies a learning-only subscription even if active", async () => {
    await reconcileBuilderAiBillingForUser("u", {client:client([sub("price_learning")]),now});
    expect(mocks.projection).toHaveBeenCalledWith(expect.objectContaining({
      eligibility:{subscriptionActive:false,productIncludesBuilderAi:false}, endsAt:null,
    }));
  });
  it("revokes expired and inactive builder products", async () => {
    await reconcileBuilderAiBillingForUser("u", {client:client([
      sub("price_builderMonthly","active",past),
      sub("price_builderAnnual","unpaid",future),
    ]),now});
    expect(mocks.projection).toHaveBeenCalledWith(expect.objectContaining({
      eligibility:{subscriptionActive:false,productIncludesBuilderAi:false}, endsAt:null,
    }));
  });
  it("fails closed when no Builder AI products are configured", async () => {
    delete process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS;
    await reconcileBuilderAiBillingForUser("u", {client:client([sub("price_builderMonthly")]),now});
    expect(mocks.projection).toHaveBeenCalledWith(expect.objectContaining({
      eligibility:{subscriptionActive:false,productIncludesBuilderAi:false},
    }));
  });
  it("refuses a Builder price reused by a learning plan", async () => {
    const previousPrice = process.env.STRIPE_PRICE_MONTHLY_ID;
    try {
      process.env.STRIPE_PRICE_MONTHLY_ID = "price_builderMonthly";
      await expect(reconcileBuilderAiBillingForUser("u", {client:client([]),now})).rejects.toThrow();
      expect(mocks.projection).not.toHaveBeenCalled();
    } finally {
      if (previousPrice === undefined) delete process.env.STRIPE_PRICE_MONTHLY_ID;
      else process.env.STRIPE_PRICE_MONTHLY_ID = previousPrice;
    }
  });
  it("rejects invalid product mapping or identity before writing", async () => {
    process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS = "invalid";
    await expect(reconcileBuilderAiBillingForUser("u", {client:client([]),now})).rejects.toThrow();
    expect(mocks.projection).not.toHaveBeenCalled();
    process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS = "price_good";
    await expect(reconcileBuilderAiBillingForUser("  ", {client:client([]),now})).rejects.toThrow();
    expect(mocks.projection).not.toHaveBeenCalled();
  });
});
