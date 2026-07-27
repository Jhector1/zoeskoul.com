-- Generalize the marketing preference record so ZoeSkoul can use Brevo now
-- and switch to Beehiiv later without changing consent records.
ALTER TABLE "UserMarketingPreference"
ADD COLUMN "declinedAt" TIMESTAMP(3),
ADD COLUMN "provider" TEXT;

DROP INDEX IF EXISTS "UserMarketingPreference_beehiivSubscriberId_key";

ALTER TABLE "UserMarketingPreference"
RENAME COLUMN "beehiivSubscriberId" TO "externalContactId";

ALTER TABLE "UserMarketingPreference"
RENAME COLUMN "beehiivStatus" TO "syncStatus";

ALTER TABLE "UserMarketingPreference"
RENAME COLUMN "beehiivSyncedAt" TO "syncedAt";

ALTER TABLE "UserMarketingPreference"
RENAME COLUMN "beehiivSyncError" TO "syncError";

-- Preserve any already-synchronized Beehiiv rows. New Brevo rows are stamped
-- by application code when synchronization succeeds or is attempted.
UPDATE "UserMarketingPreference"
SET "provider" = 'beehiiv'
WHERE "provider" IS NULL
  AND (
    "externalContactId" IS NOT NULL
    OR "syncedAt" IS NOT NULL
  );

CREATE UNIQUE INDEX "UserMarketingPreference_provider_externalContactId_key"
ON "UserMarketingPreference"("provider", "externalContactId");
