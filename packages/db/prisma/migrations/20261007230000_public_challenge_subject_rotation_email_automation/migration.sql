ALTER TABLE "PublicChallengeSocialAutomation"
ADD COLUMN "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailListId" INTEGER;

CREATE TABLE "PublicChallengeDailyDispatch" (
    "id" TEXT NOT NULL,
    "dispatchDate" VARCHAR(10) NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "subjectSlug" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicChallengeDailyDispatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicChallengeDailyDispatch_dispatchDate_check"
      CHECK ("dispatchDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
    CONSTRAINT "PublicChallengeDailyDispatch_locale_check"
      CHECK ("locale" IN ('en', 'fr', 'ht'))
);

CREATE UNIQUE INDEX "PublicChallengeDailyDispatch_dispatchDate_key"
ON "PublicChallengeDailyDispatch"("dispatchDate");

CREATE INDEX "PublicChallengeDailyDispatch_subjectSlug_dispatchDate_idx"
ON "PublicChallengeDailyDispatch"("subjectSlug", "dispatchDate");

CREATE INDEX "PublicChallengeDailyDispatch_challengeId_idx"
ON "PublicChallengeDailyDispatch"("challengeId");

ALTER TABLE "PublicChallengeDailyDispatch"
ADD CONSTRAINT "PublicChallengeDailyDispatch_challengeId_fkey"
FOREIGN KEY ("challengeId") REFERENCES "PracticeChallengeLink"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PublicChallengeEmailDispatch" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "dispatchDate" VARCHAR(10) NOT NULL,
    "sourceListId" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "idempotencyKey" VARCHAR(220) NOT NULL,
    "campaignId" INTEGER,
    "selectedCount" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicChallengeEmailDispatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicChallengeEmailDispatch_dispatchDate_check"
      CHECK ("dispatchDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
    CONSTRAINT "PublicChallengeEmailDispatch_status_check"
      CHECK ("status" IN ('pending', 'sending', 'sent', 'failed'))
);

CREATE UNIQUE INDEX "PublicChallengeEmailDispatch_idempotencyKey_key"
ON "PublicChallengeEmailDispatch"("idempotencyKey");

CREATE INDEX "PublicChallengeEmailDispatch_challengeId_createdAt_idx"
ON "PublicChallengeEmailDispatch"("challengeId", "createdAt");

CREATE INDEX "PublicChallengeEmailDispatch_dispatchDate_status_idx"
ON "PublicChallengeEmailDispatch"("dispatchDate", "status");

ALTER TABLE "PublicChallengeEmailDispatch"
ADD CONSTRAINT "PublicChallengeEmailDispatch_challengeId_fkey"
FOREIGN KEY ("challengeId") REFERENCES "PracticeChallengeLink"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
