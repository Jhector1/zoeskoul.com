-- E16C5A2B: durable local/test checkout identity; no money or grants.
CREATE TABLE "ZoeBuildAiCreditCheckoutAttempt" (
  "attemptId" VARCHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "priceId" VARCHAR(160) NOT NULL,
  "customerId" VARCHAR(160) NOT NULL,
  "stripeSessionId" VARCHAR(160),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZoeBuildAiCreditCheckoutAttempt_pkey" PRIMARY KEY ("attemptId")
);
CREATE UNIQUE INDEX "ZoeBuildAiCreditCheckoutAttempt_stripeSessionId_key"
  ON "ZoeBuildAiCreditCheckoutAttempt"("stripeSessionId");
CREATE INDEX "ZoeBuildAiCreditCheckoutAttempt_userId_createdAt_idx"
  ON "ZoeBuildAiCreditCheckoutAttempt"("userId", "createdAt");
ALTER TABLE "ZoeBuildAiCreditCheckoutAttempt"
  ADD CONSTRAINT "ZoeBuildAiCreditCheckoutAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
