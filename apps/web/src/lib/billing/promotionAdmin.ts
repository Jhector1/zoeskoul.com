import { z } from "zod";

const isoDateTime = z.string().trim().min(1).refine(
  (value) => Number.isFinite(new Date(value).getTime()),
  "Invalid date/time.",
);

export const BillingPromotionWriteSchema = z.object({
  name: z.string().trim().min(1).max(40),
  percentOff: z.number().int().min(1).max(100),
  planScope: z.enum(["monthly", "yearly", "both"]),
  couponDuration: z.enum(["once", "repeating", "forever"]).default("once"),
  couponDurationMonths: z.number().int().positive().nullable().optional().default(null),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  enabled: z.boolean(),
}).superRefine((value, ctx) => {
  if (new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Promotion end must be after its start." });
  }
  if (value.couponDuration === "repeating" && value.couponDurationMonths === null) {
    ctx.addIssue({ code: "custom", path: ["couponDurationMonths"], message: "Number of months is required for a repeating coupon." });
  }
  if (value.couponDuration !== "repeating" && value.couponDurationMonths !== null) {
    ctx.addIssue({ code: "custom", path: ["couponDurationMonths"], message: "Number of months is only allowed for a repeating coupon." });
  }
});

export function stripeCouponEndIsAllowed(endsAt: Date, now = new Date()) {
  if (endsAt.getTime() <= now.getTime()) return false;
  const max = new Date(now);
  max.setUTCFullYear(max.getUTCFullYear() + 5);
  return endsAt.getTime() <= max.getTime();
}
