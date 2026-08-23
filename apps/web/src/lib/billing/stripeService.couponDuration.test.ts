import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ couponCreate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/billing/billingCheckoutReservation", () => ({
  releaseBillingCheckoutReservation: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ coupons: { create: mocks.couponCreate } }),
}));
import { createBillingPromotionCoupon } from "./stripeService";

const endsAt = new Date("2026-09-01T00:00:00.000Z");

describe("createBillingPromotionCoupon coupon duration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.couponCreate.mockResolvedValue({ id: "coupon_50" });
  });

  it("creates first-payment-only without duration_in_months", async () => {
    await createBillingPromotionCoupon({
      campaignId: "campaign_1",
      name: "Back to School",
      percentOff: 50,
      couponDuration: "once",
      couponDurationMonths: null,
      endsAt,
    });
    expect(mocks.couponCreate).toHaveBeenCalledWith({
      name: "Back to School",
      percent_off: 50,
      duration: "once",
      redeem_by: Math.floor(endsAt.getTime() / 1000),
      metadata: {
        zoeskoulBillingPromotionCampaignId: "campaign_1",
        zoeskoulPromotionKind: "billing_campaign",
      },
    });
  });

  it("creates repeating with duration_in_months", async () => {
    await createBillingPromotionCoupon({
      campaignId: "campaign_1",
      name: "Back to School",
      percentOff: 50,
      couponDuration: "repeating",
      couponDurationMonths: 3,
      endsAt,
    });
    expect(mocks.couponCreate).toHaveBeenCalledWith({
      name: "Back to School",
      percent_off: 50,
      duration: "repeating",
      duration_in_months: 3,
      redeem_by: Math.floor(endsAt.getTime() / 1000),
      metadata: {
        zoeskoulBillingPromotionCampaignId: "campaign_1",
        zoeskoulPromotionKind: "billing_campaign",
      },
    });
  });

  it("creates forever without duration_in_months", async () => {
    await createBillingPromotionCoupon({
      campaignId: "campaign_1",
      name: "Back to School",
      percentOff: 50,
      couponDuration: "forever",
      couponDurationMonths: null,
      endsAt,
    });
    expect(mocks.couponCreate).toHaveBeenCalledWith({
      name: "Back to School",
      percent_off: 50,
      duration: "forever",
      redeem_by: Math.floor(endsAt.getTime() / 1000),
      metadata: {
        zoeskoulBillingPromotionCampaignId: "campaign_1",
        zoeskoulPromotionKind: "billing_campaign",
      },
    });
  });
});
