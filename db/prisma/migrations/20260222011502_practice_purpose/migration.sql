-- CreateEnum
CREATE TYPE "PracticePurpose" AS ENUM ('quiz', 'project');

-- CreateEnum
CREATE TYPE "PracticeRunPresetKey" AS ENUM ('MODULE_QUIZ_ONLY', 'MIXED_PRACTICE');

-- AlterTable
ALTER TABLE "PracticeModule" ADD COLUMN     "practicePresetId" TEXT;

-- AlterTable
ALTER TABLE "PracticeQuestionInstance" ADD COLUMN     "purpose" "PracticePurpose" NOT NULL DEFAULT 'quiz';

-- AlterTable
ALTER TABLE "PracticeSession" ADD COLUMN     "presetId" TEXT;

-- CreateTable
CREATE TABLE "PracticeRunPreset" (
    "id" TEXT NOT NULL,
    "key" "PracticeRunPresetKey" NOT NULL,
    "allowedKinds" "PracticeKind"[] DEFAULT ARRAY[]::"PracticeKind"[],
    "allowedPurposes" "PracticePurpose"[] DEFAULT ARRAY[]::"PracticePurpose"[],
    "lockDifficulty" "PracticeDifficulty",
    "lockTopic" TEXT,
    "allowReveal" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeRunPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeRunPreset_key_key" ON "PracticeRunPreset"("key");

-- CreateIndex
CREATE INDEX "PracticeModule_practicePresetId_idx" ON "PracticeModule"("practicePresetId");

-- CreateIndex
CREATE INDEX "PracticeQuestionInstance_purpose_idx" ON "PracticeQuestionInstance"("purpose");

-- CreateIndex
CREATE INDEX "PracticeSession_presetId_idx" ON "PracticeSession"("presetId");

-- AddForeignKey
ALTER TABLE "PracticeModule" ADD CONSTRAINT "PracticeModule_practicePresetId_fkey" FOREIGN KEY ("practicePresetId") REFERENCES "PracticeRunPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PracticeRunPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
