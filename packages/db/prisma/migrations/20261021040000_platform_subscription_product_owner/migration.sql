-- Logical platform product owner; identical schema in development and production.
-- No test-mode column, table deletion or destructive backfill.
ALTER TABLE "Subscription" ADD COLUMN "billingProduct" TEXT;
CREATE INDEX "Subscription_userId_billingProduct_idx" ON "Subscription"("userId", "billingProduct");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_billingProduct_allowed" CHECK ("billingProduct" IS NULL OR "billingProduct" IN ('learning', 'builder_ai'));
