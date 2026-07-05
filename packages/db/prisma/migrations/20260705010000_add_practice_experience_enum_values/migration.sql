-- Enum values are committed in their own migration. PostgreSQL can reject a
-- newly added enum value when it is used by an UPDATE in the same transaction.
ALTER TYPE "PracticeSessionMode" ADD VALUE IF NOT EXISTS 'daily_five';
ALTER TYPE "PracticeSessionMode" ADD VALUE IF NOT EXISTS 'public_challenge';
ALTER TYPE "PracticeSessionMode" ADD VALUE IF NOT EXISTS 'assignment';

ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'daily_five_complete';
ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'public_challenge_complete';
ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'assignment_complete';
