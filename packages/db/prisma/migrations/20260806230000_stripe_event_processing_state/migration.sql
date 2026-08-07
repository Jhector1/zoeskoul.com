-- Upgrade the existing StripeEvent receipt ledger with durable processing state.
ALTER TABLE "StripeEvent"
    ADD COLUMN "objectId" TEXT,
    ADD COLUMN "customerId" TEXT,
    ADD COLUMN "subscriptionId" TEXT,
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'processed',
    ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "processedAt" TIMESTAMP(3),
    ADD COLUMN "lastError" TEXT,
    ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Rows written by the old ledger represent events that were already accepted.
UPDATE "StripeEvent"
SET
    "processedAt" = "receivedAt",
    "updatedAt" = "receivedAt";

ALTER TABLE "StripeEvent"
    ALTER COLUMN "updatedAt" SET NOT NULL,
    ALTER COLUMN "status" SET DEFAULT 'processing';

CREATE INDEX "StripeEvent_status_updatedAt_idx"
    ON "StripeEvent"("status", "updatedAt");

CREATE INDEX "StripeEvent_subscriptionId_idx"
    ON "StripeEvent"("subscriptionId");

CREATE INDEX "StripeEvent_customerId_idx"
    ON "StripeEvent"("customerId");
