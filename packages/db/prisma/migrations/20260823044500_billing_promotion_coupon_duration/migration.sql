-- Existing Stripe coupons were created with duration='once'.
CREATE TYPE "BillingPromotionCouponDuration" AS ENUM ('once', 'repeating', 'forever');

ALTER TABLE "BillingPromotionCampaign"
  ADD COLUMN "couponDuration" "BillingPromotionCouponDuration" NOT NULL DEFAULT 'once',
  ADD COLUMN "couponDurationMonths" INTEGER;

ALTER TABLE "BillingPromotionCampaign"
  ADD CONSTRAINT "BillingPromotionCampaign_couponDurationMonths_check"
  CHECK (
    ("couponDuration" = 'repeating' AND "couponDurationMonths" IS NOT NULL AND "couponDurationMonths" > 0)
    OR
    ("couponDuration" <> 'repeating' AND "couponDurationMonths" IS NULL)
  );
