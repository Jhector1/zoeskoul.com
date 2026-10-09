ALTER TABLE "PracticeChallengeLink"
ADD COLUMN "tiktokImagePublicId" TEXT,
ADD COLUMN "tiktokImageAlt" TEXT;

ALTER TABLE "PublicChallengeSocialAutomation"
ADD COLUMN "threadsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "redditEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PublicChallengeSocialPost"
DROP CONSTRAINT IF EXISTS "PublicChallengeSocialPost_provider_check";

ALTER TABLE "PublicChallengeSocialPost"
ADD CONSTRAINT "PublicChallengeSocialPost_provider_check"
CHECK (
  "provider" IN (
    'facebook',
    'instagram',
    'linkedin',
    'x',
    'threads',
    'reddit',
    'tiktok'
  )
);
