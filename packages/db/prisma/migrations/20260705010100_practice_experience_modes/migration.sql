-- Add explicit product identity, Daily Five uniqueness, assignment question
-- limits, and ranked-XP projections. Enum values were committed by the previous
-- migration so these backfills are safe on PostgreSQL.
ALTER TABLE "PracticeSession"
  ADD COLUMN IF NOT EXISTS "experienceKey" TEXT,
  ADD COLUMN IF NOT EXISTS "dayKey" DATE;

ALTER TABLE "Assignment"
  ADD COLUMN IF NOT EXISTS "maxQuestionAttempts" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "PracticeQuestionInstance"
  ADD COLUMN IF NOT EXISTS "exerciseKey" TEXT,
  ADD COLUMN IF NOT EXISTS "experienceItemKey" TEXT;

ALTER TABLE "LearnerProgress"
  ADD COLUMN IF NOT EXISTS "rankedXp" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DailyLearningStat"
  ADD COLUMN IF NOT EXISTS "rankedXpEarned" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "XpEvent"
  ADD COLUMN IF NOT EXISTS "rankedXpDelta" INTEGER NOT NULL DEFAULT 0;

-- Backfill legacy rows before applying the invariant constraint.
UPDATE "PracticeSession"
SET "mode" = 'assignment'
WHERE "assignmentId" IS NOT NULL
  AND "mode" <> 'assignment';

UPDATE "PracticeSession"
SET "mode" = 'public_challenge'
WHERE "assignmentId" IS NULL
  AND "mode" = 'onboarding_trial'
  AND COALESCE("meta"->>'kind', '') = 'shared_challenge';

-- Legacy onboarding rows predate the explicit discriminator. Stamp them before
-- the invariant check so deployment does not reject valid existing sessions.
UPDATE "PracticeSession"
SET "meta" = COALESCE("meta", '{}'::jsonb) || '{"kind":"onboarding_trial"}'::jsonb
WHERE "mode" = 'onboarding_trial'
  AND COALESCE("meta"->>'kind', '') <> 'onboarding_trial';

UPDATE "PracticeQuestionInstance"
SET "exerciseKey" = NULLIF(COALESCE("publicPayload"->>'exerciseKey', "publicPayload"->>'id'), '')
WHERE "exerciseKey" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "PracticeSession_experienceKey_key"
  ON "PracticeSession"("experienceKey");

CREATE UNIQUE INDEX IF NOT EXISTS "PracticeQuestionInstance_experienceItemKey_key"
  ON "PracticeQuestionInstance"("experienceItemKey");

CREATE INDEX IF NOT EXISTS "PracticeSession_mode_dayKey_idx"
  ON "PracticeSession"("mode", "dayKey");

CREATE INDEX IF NOT EXISTS "PracticeQuestionInstance_sessionId_exerciseKey_idx"
  ON "PracticeQuestionInstance"("sessionId", "exerciseKey");

CREATE INDEX IF NOT EXISTS "LearnerProgress_rankedXp_idx"
  ON "LearnerProgress"("rankedXp");

CREATE INDEX IF NOT EXISTS "XpEvent_rankedXpDelta_createdAt_idx"
  ON "XpEvent"("rankedXpDelta", "createdAt");

-- New rows can no longer blur assignment and non-assignment experiences.
ALTER TABLE "PracticeSession"
  DROP CONSTRAINT IF EXISTS "PracticeSession_assignment_mode_check";

ALTER TABLE "PracticeSession"
  ADD CONSTRAINT "PracticeSession_assignment_mode_check"
  CHECK (
    ("mode" = 'assignment' AND "assignmentId" IS NOT NULL)
    OR
    ("mode" <> 'assignment' AND "assignmentId" IS NULL)
  );


-- Every experience carries its own invariant instead of relying on ambiguous JSON checks in clients.
ALTER TABLE "PracticeSession"
  DROP CONSTRAINT IF EXISTS "PracticeSession_public_challenge_mode_check";
ALTER TABLE "PracticeSession"
  ADD CONSTRAINT "PracticeSession_public_challenge_mode_check"
  CHECK (
    "mode" <> 'public_challenge'
    OR COALESCE("meta"->>'kind', '') = 'shared_challenge'
  );

ALTER TABLE "PracticeSession"
  DROP CONSTRAINT IF EXISTS "PracticeSession_onboarding_mode_check";
ALTER TABLE "PracticeSession"
  ADD CONSTRAINT "PracticeSession_onboarding_mode_check"
  CHECK (
    "mode" <> 'onboarding_trial'
    OR COALESCE("meta"->>'kind', '') = 'onboarding_trial'
  );

ALTER TABLE "PracticeSession"
  DROP CONSTRAINT IF EXISTS "PracticeSession_daily_five_mode_check";
ALTER TABLE "PracticeSession"
  ADD CONSTRAINT "PracticeSession_daily_five_mode_check"
  CHECK (
    "mode" <> 'daily_five'
    OR (
      "dayKey" IS NOT NULL
      AND "experienceKey" IS NOT NULL
      AND COALESCE("meta"->>'kind', '') = 'daily_five'
    )
  );
