-- CreateEnum
CREATE TYPE "BillingPromotionPlanScope" AS ENUM ('monthly', 'yearly', 'both');

-- CreateTable
CREATE TABLE "BillingPromotionCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "percentOff" INTEGER NOT NULL,
  "planScope" "BillingPromotionPlanScope" NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "stripeCouponId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPromotionCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPromotionCampaign_stripeCouponId_key"
  ON "BillingPromotionCampaign"("stripeCouponId");
CREATE INDEX "BillingPromotionCampaign_enabled_startsAt_endsAt_idx"
  ON "BillingPromotionCampaign"("enabled", "startsAt", "endsAt");
CREATE INDEX "BillingPromotionCampaign_planScope_enabled_idx"
  ON "BillingPromotionCampaign"("planScope", "enabled");
