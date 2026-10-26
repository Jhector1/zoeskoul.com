-- E16C4E1B2B2A: immutable server-priced original HTTPS response receipt.
-- No migration-triggered financial mutation, approval, grant, or refund.
ALTER TABLE "AiCreditProviderRequest"
    ADD COLUMN "receiptPricingVersionId" VARCHAR(160),
    ADD COLUMN "receiptCostUsdNano" VARCHAR(80),
    ADD COLUMN "receiptUsageSha256" VARCHAR(64),
    ADD COLUMN "receiptRecordedAt" TIMESTAMP(3);
