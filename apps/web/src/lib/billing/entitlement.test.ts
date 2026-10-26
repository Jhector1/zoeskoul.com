import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user:{findUnique:mocks.userFindUnique},
    subscription: {
      findMany: mocks.findMany,
    },
  },
}));

import { getEntitlementForUser } from "./entitlement";

describe("billing entitlement effective end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({stripeCustomerId:"cus_owner"});
    process.env.STRIPE_PRICE_MONTHLY_ID = "price_monthly";
    process.env.STRIPE_PRICE_YEARLY_ID = "price_yearly";
  });

  it("restricts learning access to learning prices, never builder subscriptions", async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(getEntitlementForUser("user_1")).resolves.toMatchObject({ok:false,reason:"none"});
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{userId:"user_1",stripeCustomerId:"cus_owner",billingProduct:"learning",priceId:{in:["price_monthly","price_yearly"]}},
    }));
  });
  it("denies an active learning plan when only a foreign Stripe customer row exists", async () => {
    mocks.findMany.mockResolvedValue([{stripeCustomerId:"cus_other",stripeSubscriptionId:"sub_foreign",
      priceId:"price_monthly",status:"active",currentPeriodEnd:new Date("2100-01-01"),
      trialEnd:null,cancelAtPeriodEnd:false,updatedAt:new Date()}]);
    expect(await getEntitlementForUser("user_1")).toEqual({ok:false,reason:"none"});
  });
  it("denies learning access if the stored platform customer binding is missing", async () => {
    mocks.userFindUnique.mockResolvedValue({stripeCustomerId:null});
    mocks.findMany.mockResolvedValue([{stripeCustomerId:"cus_other",stripeSubscriptionId:"sub_foreign",
      priceId:"price_monthly",status:"active",currentPeriodEnd:new Date("2100-01-01"),
      trialEnd:null,cancelAtPeriodEnd:false,updatedAt:new Date()}]);
    expect(await getEntitlementForUser("user_1")).toEqual({ok:false,reason:"none"});
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("filters the database by verified owner before applying its result limit", async()=>{
    mocks.findMany.mockResolvedValue([{stripeCustomerId:"cus_owner",stripeSubscriptionId:"sub_correct",
      priceId:"price_monthly",status:"active",currentPeriodEnd:new Date("2100-01-01"),
      trialEnd:null,cancelAtPeriodEnd:false,updatedAt:new Date()}]);
    expect(await getEntitlementForUser("user_1")).toMatchObject({ok:true,subscriptionId:"sub_correct"});
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({stripeCustomerId:"cus_owner"}),take:10,
    }));
  });
  it("does not let currentPeriodEnd extend an expired trial", async () => {
    mocks.findMany.mockResolvedValue([
      {
        stripeCustomerId:"cus_owner",
        stripeSubscriptionId: "sub_trial",
        status: "trialing",
        priceId: "price_monthly",
        trialEnd: new Date("2000-01-02T00:00:00.000Z"),
        currentPeriodEnd: new Date("2100-01-02T00:00:00.000Z"),
        cancelAtPeriodEnd: true,
        updatedAt: new Date("2026-08-22T00:00:00.000Z"),
      },
    ]);

    await expect(getEntitlementForUser("user_1")).resolves.toMatchObject({
      ok: false,
      reason: "expired",
      status: "trialing",
    });
  });

  it("keeps a trial entitled through its actual future trial end", async () => {
    mocks.findMany.mockResolvedValue([
      {
        stripeCustomerId:"cus_owner",
        stripeSubscriptionId: "sub_trial",
        status: "trialing",
        priceId: "price_monthly",
        trialEnd: new Date("2100-01-02T00:00:00.000Z"),
        currentPeriodEnd: new Date("2100-02-02T00:00:00.000Z"),
        cancelAtPeriodEnd: true,
        updatedAt: new Date("2026-08-22T00:00:00.000Z"),
      },
    ]);

    await expect(getEntitlementForUser("user_1")).resolves.toMatchObject({
      ok: true,
      reason: "trialing",
      status: "trialing",
      cancelAtPeriodEnd: true,
    });
  });

  it("denies terminal cancellation even when the historical period is in the future",async()=>{
    mocks.findMany.mockResolvedValue([{stripeCustomerId:"cus_owner",stripeSubscriptionId:"sub_done",
      priceId:"price_monthly",billingProduct:"learning",status:"canceled",
      trialEnd:null,currentPeriodEnd:new Date("2100-01-01"),cancelAtPeriodEnd:false,updatedAt:new Date()}]);
    expect(await getEntitlementForUser("user_1")).toMatchObject({ok:false,reason:"canceled"});
  });
  it("continues to use currentPeriodEnd for active paid access", async () => {
    mocks.findMany.mockResolvedValue([
      {
        stripeCustomerId:"cus_owner",
        stripeSubscriptionId: "sub_active",
        status: "active",
        priceId: "price_monthly",
        trialEnd: null,
        currentPeriodEnd: new Date("2100-01-02T00:00:00.000Z"),
        cancelAtPeriodEnd: true,
        updatedAt: new Date("2026-08-22T00:00:00.000Z"),
      },
    ]);

    await expect(getEntitlementForUser("user_1")).resolves.toMatchObject({
      ok: true,
      reason: "active",
      status: "active",
      cancelAtPeriodEnd: true,
    });
  });
});
