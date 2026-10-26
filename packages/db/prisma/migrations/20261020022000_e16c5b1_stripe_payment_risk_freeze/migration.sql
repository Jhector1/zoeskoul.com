-- E16C5B1: quarantine new AI credit spending after independent Stripe
-- refund/dispute verification; no grant deletion or financial reversal.
ALTER TABLE "AiCreditWallet" ADD COLUMN "riskFrozenAt" TIMESTAMP(3);

CREATE TABLE "AiCreditPaymentRiskEvent" (
  "id" TEXT NOT NULL,
  "eventKey" VARCHAR(256) NOT NULL,
  "lotId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "providerObjectId" VARCHAR(160) NOT NULL,
  "paymentIntentId" VARCHAR(160) NOT NULL,
  "chargeId" VARCHAR(160) NOT NULL,
  "refundedAmountUsdMinor" BIGINT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCreditPaymentRiskEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiCreditPaymentRiskEvent_eventKey_key" ON "AiCreditPaymentRiskEvent"("eventKey");
CREATE INDEX "AiCreditPaymentRiskEvent_userId_observedAt_idx" ON "AiCreditPaymentRiskEvent"("userId", "observedAt");
CREATE INDEX "AiCreditPaymentRiskEvent_paymentIntentId_observedAt_idx" ON "AiCreditPaymentRiskEvent"("paymentIntentId", "observedAt");
ALTER TABLE "AiCreditPaymentRiskEvent" ADD CONSTRAINT "AiCreditPaymentRiskEvent_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "AiCreditLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
