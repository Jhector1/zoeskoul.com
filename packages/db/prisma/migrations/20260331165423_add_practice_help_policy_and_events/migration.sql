-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "helpPolicy" JSONB;

-- AlterTable
ALTER TABLE "PracticeRunPreset" ADD COLUMN     "helpPolicy" JSONB;

-- AlterTable
ALTER TABLE "PracticeSession" ADD COLUMN     "helpPolicy" JSONB;

-- CreateTable
CREATE TABLE "PracticeHelpEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "instanceId" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "stepKey" TEXT NOT NULL,
    "stepIndex" INTEGER,
    "kind" TEXT,
    "source" TEXT,
    "content" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeHelpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeHelpEvent_sessionId_createdAt_idx" ON "PracticeHelpEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeHelpEvent_instanceId_createdAt_idx" ON "PracticeHelpEvent"("instanceId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeHelpEvent_instanceId_stepKey_createdAt_idx" ON "PracticeHelpEvent"("instanceId", "stepKey", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeHelpEvent_instanceId_userId_createdAt_idx" ON "PracticeHelpEvent"("instanceId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeHelpEvent_instanceId_guestId_createdAt_idx" ON "PracticeHelpEvent"("instanceId", "guestId", "createdAt");

-- AddForeignKey
ALTER TABLE "PracticeHelpEvent" ADD CONSTRAINT "PracticeHelpEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeHelpEvent" ADD CONSTRAINT "PracticeHelpEvent_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "PracticeQuestionInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
