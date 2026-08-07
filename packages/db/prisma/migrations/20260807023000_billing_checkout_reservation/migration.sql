
-- Reserve one in-flight subscription Checkout attempt per ZoeSkoul user.
-- Existing users remain unchanged because both columns are nullable.
ALTER TABLE "User"
    ADD COLUMN "billingCheckoutAttemptId" TEXT,
    ADD COLUMN "billingCheckoutReservedAt" TIMESTAMP(3);
