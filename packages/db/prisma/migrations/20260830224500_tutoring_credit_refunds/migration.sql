CREATE TYPE "TutoringCreditRefundStatus" AS ENUM (
  'pending',
  'requires_action',
  'succeeded',
  'failed',
  'canceled'
);

CREATE TABLE "TutoringCreditRefund" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "refundAttemptId" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "stripeRefundId" TEXT,
  "status" "TutoringCreditRefundStatus" NOT NULL DEFAULT 'pending',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "succeededAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TutoringCreditRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TutoringCreditRefund_refundAttemptId_key"
  ON "TutoringCreditRefund"("refundAttemptId");

CREATE UNIQUE INDEX "TutoringCreditRefund_stripeRefundId_key"
  ON "TutoringCreditRefund"("stripeRefundId");

CREATE INDEX "TutoringCreditRefund_userId_createdAt_idx"
  ON "TutoringCreditRefund"("userId", "createdAt");

CREATE INDEX "TutoringCreditRefund_purchaseId_createdAt_idx"
  ON "TutoringCreditRefund"("purchaseId", "createdAt");

CREATE INDEX "TutoringCreditRefund_status_createdAt_idx"
  ON "TutoringCreditRefund"("status", "createdAt");

ALTER TABLE "TutoringCreditRefund"
  ADD CONSTRAINT "TutoringCreditRefund_purchaseId_fkey"
  FOREIGN KEY ("purchaseId")
  REFERENCES "TutoringCreditPurchase"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
