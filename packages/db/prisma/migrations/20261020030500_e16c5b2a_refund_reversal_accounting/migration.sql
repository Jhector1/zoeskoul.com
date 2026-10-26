-- E16C5B2A: irreversible, append-only credit refund reversal accounting.
-- No existing balances are changed by this migration (new columns default 0).
-- No provider calls, funding grants, or automatic customer unfreeze.
ALTER TYPE "AiCreditLedgerKind" ADD VALUE IF NOT EXISTS 'reverse';
ALTER TABLE "AiCreditLot"
    ADD COLUMN "reversedUnits" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "reversalTargetUnits" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "reversalShortfallUnits" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AiCreditLedgerEntry"
    ADD COLUMN "reversedDelta" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AiCreditLot"
    ADD CONSTRAINT "AiCreditLot_refund_reversal_nonnegative_chk"
    CHECK ("reversedUnits" >= 0 AND "reversalTargetUnits" >= 0 AND
           "reversalShortfallUnits" >= 0 AND
           "reversalTargetUnits" = "reversedUnits" + "reversalShortfallUnits" AND
           "reversalTargetUnits" <= "grantedUnits");
CREATE TABLE "AiCreditPaymentReversalSnapshot" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "chargedAmountUsdMinor" BIGINT NOT NULL,
    "refundedAmountUsdMinor" BIGINT NOT NULL,
    "targetUnits" BIGINT NOT NULL,
    "appliedUnits" BIGINT NOT NULL,
    "shortfallUnits" BIGINT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCreditPaymentReversalSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiCreditPaymentReversalSnapshot_amount_chk" CHECK
      ("chargedAmountUsdMinor" > 0 AND "refundedAmountUsdMinor" > 0 AND
       "refundedAmountUsdMinor" <= "chargedAmountUsdMinor" AND
       "targetUnits" >= 0 AND "appliedUnits" >= 0 AND "shortfallUnits" >= 0)
);
CREATE UNIQUE INDEX "AiCreditPaymentReversalSnapshot_lotId_refundedAmountUsdMinor_key"
    ON "AiCreditPaymentReversalSnapshot"("lotId", "refundedAmountUsdMinor");
CREATE INDEX "AiCreditPaymentReversalSnapshot_lotId_observedAt_idx"
    ON "AiCreditPaymentReversalSnapshot"("lotId", "observedAt");
ALTER TABLE "AiCreditPaymentReversalSnapshot"
    ADD CONSTRAINT "AiCreditPaymentReversalSnapshot_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES "AiCreditLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
