-- Add a real class lifecycle without changing the behavior of existing classes.
-- Existing LearningGroup rows are backfilled to open. New rows default to draft.
CREATE TYPE "LearningGroupStatus" AS ENUM ('draft', 'open', 'closed');

ALTER TABLE "LearningGroup"
ADD COLUMN "status" "LearningGroupStatus" NOT NULL DEFAULT 'open';

ALTER TABLE "LearningGroup"
ALTER COLUMN "status" SET DEFAULT 'draft';
