-- CreateEnum
CREATE TYPE "PracticeSessionMode" AS ENUM ('standard', 'onboarding_trial');

-- AlterTable
ALTER TABLE "PracticeSession" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "mode" "PracticeSessionMode" NOT NULL DEFAULT 'standard';

-- CreateIndex
CREATE INDEX "PracticeSession_mode_idx" ON "PracticeSession"("mode");
