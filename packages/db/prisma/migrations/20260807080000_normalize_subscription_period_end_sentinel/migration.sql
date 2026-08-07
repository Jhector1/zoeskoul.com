-- `1970-01-01` was previously used as a sentinel for
-- "subscription no longer exists in Stripe". The column is nullable, so
-- represent absence as NULL instead of a user-visible Unix epoch.
UPDATE "Subscription"
SET "currentPeriodEnd" = NULL
WHERE "currentPeriodEnd" = TIMESTAMP '1970-01-01 00:00:00';
