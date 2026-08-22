import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ couponCreate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/billing/billingCheckoutReservation", () => ({ releaseBillingCheckoutReservation: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ coupons: { create: mocks.couponCreate } }) }));
import { createBillingPromotionCoupon } from "./stripeService";

describe("createBillingPromotionCoupon", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.couponCreate.mockResolvedValue({ id: "coupon_20" }); });
  it("creates a one-charge percentage coupon with campaign redeem_by", async () => {
    const endsAt = new Date("2026-09-01T00:00:00.000Z");
    await createBillingPromotionCoupon({ campaignId: "campaign_1", name: "Launch week", percentOff: 20, endsAt });
    expect(mocks.couponCreate).toHaveBeenCalledWith({
      name: "Launch week", percent_off: 20, duration: "once", redeem_by: Math.floor(endsAt.getTime() / 1000),
      metadata: { zoeskoulBillingPromotionCampaignId: "campaign_1", zoeskoulPromotionKind: "billing_campaign" },
    });
  });
});
