-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('draft', 'published', 'archived');

-- DropIndex
DROP INDEX "PracticeSession_guestId_idx";

-- DropIndex
DROP INDEX "PracticeSession_userId_idx";

-- AlterTable
ALTER TABLE "PracticeSession" ADD COLUMN     "assignmentId" TEXT;

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'draft',
    "sectionId" TEXT NOT NULL,
    "topics" "PracticeTopic"[],
    "difficulty" "PracticeDifficulty" NOT NULL,
    "questionCount" INTEGER NOT NULL DEFAULT 10,
    "availableFrom" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "timeLimitSec" INTEGER,
    "maxAttempts" INTEGER,
    "allowReveal" BOOLEAN NOT NULL DEFAULT false,
    "showDebug" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_slug_key" ON "Assignment"("slug");

-- CreateIndex
CREATE INDEX "Assignment_sectionId_idx" ON "Assignment"("sectionId");

-- CreateIndex
CREATE INDEX "PracticeSession_assignmentId_idx" ON "PracticeSession"("assignmentId");

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PracticeSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
