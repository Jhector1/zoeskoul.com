CREATE TABLE "PublicChallengeSocialAutomation" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(8) NOT NULL DEFAULT 'en',
    "localTime" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Chicago',
    "facebookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "instagramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "linkedinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "xEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublicChallengeSocialAutomation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicChallengeSocialAutomation_locale_check"
      CHECK ("locale" IN ('en', 'fr', 'ht')),
    CONSTRAINT "PublicChallengeSocialAutomation_localTime_check"
      CHECK ("localTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
);

INSERT INTO "PublicChallengeSocialAutomation"
    ("id", "enabled", "locale", "localTime", "timezone", "updatedAt")
VALUES
    ('daily', false, 'en', '09:00', 'America/Chicago', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "PublicChallengeSocialPost" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "provider" VARCHAR(24) NOT NULL,
    "dispatchDate" VARCHAR(10) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "idempotencyKey" VARCHAR(220) NOT NULL,
    "providerPostId" TEXT,
    "providerPostUrl" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublicChallengeSocialPost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicChallengeSocialPost_provider_check"
      CHECK ("provider" IN ('facebook', 'instagram', 'linkedin', 'x')),
    CONSTRAINT "PublicChallengeSocialPost_source_check"
      CHECK ("source" IN ('manual', 'daily')),
    CONSTRAINT "PublicChallengeSocialPost_status_check"
      CHECK ("status" IN ('pending', 'publishing', 'published', 'failed')),
    CONSTRAINT "PublicChallengeSocialPost_dispatchDate_check"
      CHECK ("dispatchDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

CREATE UNIQUE INDEX "PublicChallengeSocialPost_idempotencyKey_key"
ON "PublicChallengeSocialPost"("idempotencyKey");

CREATE INDEX "PublicChallengeSocialPost_challengeId_createdAt_idx"
ON "PublicChallengeSocialPost"("challengeId", "createdAt");

CREATE INDEX "PublicChallengeSocialPost_provider_status_createdAt_idx"
ON "PublicChallengeSocialPost"("provider", "status", "createdAt");

CREATE INDEX "PublicChallengeSocialPost_dispatchDate_provider_idx"
ON "PublicChallengeSocialPost"("dispatchDate", "provider");

ALTER TABLE "PublicChallengeSocialPost"
ADD CONSTRAINT "PublicChallengeSocialPost_challengeId_fkey"
FOREIGN KEY ("challengeId") REFERENCES "PracticeChallengeLink"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
