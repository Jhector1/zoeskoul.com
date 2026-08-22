import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findMany: mocks.findMany,
    },
  },
}));

import { getEntitlementForUser } from "./entitlement";

describe("billing entitlement effective end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not let currentPeriodEnd extend an expired trial", async () => {
    mocks.findMany.mockResolvedValue([
      {
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

  it("continues to use currentPeriodEnd for active paid access", async () => {
    mocks.findMany.mockResolvedValue([
      {
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
