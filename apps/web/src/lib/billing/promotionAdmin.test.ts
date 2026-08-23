import { describe, expect, it } from "vitest";
import { BillingPromotionWriteSchema } from "./promotionAdmin";
const BASE = { name: "Back to School", percentOff: 50, planScope: "monthly" as const, startsAt: "2026-08-23T00:00:00.000Z", endsAt: "2026-09-23T00:00:00.000Z", enabled: true };
describe("BillingPromotionWriteSchema coupon duration", () => {
  it("defaults old clients to first payment only", () => {
    const x=BillingPromotionWriteSchema.parse(BASE);
    expect(x.couponDuration).toBe("once"); expect(x.couponDurationMonths).toBeNull();
  });
  it("accepts repeating months", () => {
    const x=BillingPromotionWriteSchema.parse({...BASE,couponDuration:"repeating",couponDurationMonths:3});
    expect(x.couponDurationMonths).toBe(3);
  });
  it("requires months for repeating", () => {
    expect(BillingPromotionWriteSchema.safeParse({...BASE,couponDuration:"repeating",couponDurationMonths:null}).success).toBe(false);
  });
  it("rejects months for once or forever", () => {
    expect(BillingPromotionWriteSchema.safeParse({...BASE,couponDuration:"once",couponDurationMonths:3}).success).toBe(false);
    expect(BillingPromotionWriteSchema.safeParse({...BASE,couponDuration:"forever",couponDurationMonths:3}).success).toBe(false);
  });
});
