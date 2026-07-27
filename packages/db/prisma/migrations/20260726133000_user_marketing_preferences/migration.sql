-- Existing users intentionally receive no row. No row means marketing email
-- consent has not been granted and must be treated as false.
CREATE TABLE "UserMarketingPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketingEmails" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "consentSource" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "beehiivSubscriberId" TEXT,
    "beehiivStatus" TEXT,
    "beehiivSyncedAt" TIMESTAMP(3),
    "beehiivSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMarketingPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMarketingPreference_userId_key"
ON "UserMarketingPreference"("userId");

CREATE UNIQUE INDEX "UserMarketingPreference_beehiivSubscriberId_key"
ON "UserMarketingPreference"("beehiivSubscriberId");

CREATE INDEX "UserMarketingPreference_marketingEmails_idx"
ON "UserMarketingPreference"("marketingEmails");

ALTER TABLE "UserMarketingPreference"
ADD CONSTRAINT "UserMarketingPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
