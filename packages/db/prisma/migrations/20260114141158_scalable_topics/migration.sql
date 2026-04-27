/*
  Warnings:

  - You are about to drop the column `topics` on the `Assignment` table. All the data in the column will be lost.
  - You are about to drop the column `topic` on the `PracticeQuestionInstance` table. All the data in the column will be lost.
  - You are about to drop the column `topics` on the `PracticeSection` table. All the data in the column will be lost.
  - Added the required column `topicId` to the `PracticeQuestionInstance` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PracticeQuestionInstance_topic_difficulty_idx";

-- AlterTable
ALTER TABLE "Assignment" DROP COLUMN "topics";

-- AlterTable
ALTER TABLE "PracticeQuestionInstance" DROP COLUMN "topic",
ADD COLUMN     "topicId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PracticeSection" DROP COLUMN "topics";

-- DropEnum
DROP TYPE "PracticeTopic";

-- CreateTable
CREATE TABLE "PracticeTopic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "moduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSectionTopic" (
    "sectionId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PracticeSectionTopic_pkey" PRIMARY KEY ("sectionId","topicId")
);

-- CreateTable
CREATE TABLE "AssignmentTopic" (
    "assignmentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssignmentTopic_pkey" PRIMARY KEY ("assignmentId","topicId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeTopic_slug_key" ON "PracticeTopic"("slug");

-- CreateIndex
CREATE INDEX "PracticeTopic_moduleId_order_idx" ON "PracticeTopic"("moduleId", "order");

-- CreateIndex
CREATE INDEX "PracticeSectionTopic_topicId_idx" ON "PracticeSectionTopic"("topicId");

-- CreateIndex
CREATE INDEX "PracticeSectionTopic_sectionId_order_idx" ON "PracticeSectionTopic"("sectionId", "order");

-- CreateIndex
CREATE INDEX "AssignmentTopic_topicId_idx" ON "AssignmentTopic"("topicId");

-- CreateIndex
CREATE INDEX "AssignmentTopic_assignmentId_order_idx" ON "AssignmentTopic"("assignmentId", "order");

-- CreateIndex
CREATE INDEX "PracticeQuestionInstance_topicId_difficulty_idx" ON "PracticeQuestionInstance"("topicId", "difficulty");

-- AddForeignKey
ALTER TABLE "PracticeTopic" ADD CONSTRAINT "PracticeTopic_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PracticeModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSectionTopic" ADD CONSTRAINT "PracticeSectionTopic_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PracticeSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSectionTopic" ADD CONSTRAINT "PracticeSectionTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "PracticeTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentTopic" ADD CONSTRAINT "AssignmentTopic_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentTopic" ADD CONSTRAINT "AssignmentTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "PracticeTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestionInstance" ADD CONSTRAINT "PracticeQuestionInstance_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "PracticeTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
