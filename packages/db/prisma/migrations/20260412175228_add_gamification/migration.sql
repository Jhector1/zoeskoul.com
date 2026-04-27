-- CreateEnum
CREATE TYPE "XpSourceType" AS ENUM ('answer_correct', 'answer_retry_correct', 'session_complete', 'topic_complete', 'module_complete', 'streak_bonus', 'daily_goal', 'project_step');

-- CreateTable
CREATE TABLE "LearnerProgress" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveOn" DATE,
    "streakFreezes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLearningStat" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "day" DATE NOT NULL,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "answeredCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "minutesStudied" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyLearningStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "sourceType" "XpSourceType" NOT NULL,
    "sourceId" TEXT,
    "subjectId" TEXT,
    "moduleId" TEXT,
    "topicId" TEXT,
    "instanceId" TEXT,
    "sessionId" TEXT,
    "xpDelta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearnerProgress_actorKey_key" ON "LearnerProgress"("actorKey");

-- CreateIndex
CREATE INDEX "LearnerProgress_userId_idx" ON "LearnerProgress"("userId");

-- CreateIndex
CREATE INDEX "DailyLearningStat_userId_idx" ON "DailyLearningStat"("userId");

-- CreateIndex
CREATE INDEX "DailyLearningStat_day_idx" ON "DailyLearningStat"("day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLearningStat_actorKey_day_key" ON "DailyLearningStat"("actorKey", "day");

-- CreateIndex
CREATE UNIQUE INDEX "XpEvent_idempotencyKey_key" ON "XpEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "XpEvent_actorKey_createdAt_idx" ON "XpEvent"("actorKey", "createdAt");

-- CreateIndex
CREATE INDEX "XpEvent_userId_idx" ON "XpEvent"("userId");

-- CreateIndex
CREATE INDEX "XpEvent_sourceType_sourceId_idx" ON "XpEvent"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "XpEvent_subjectId_moduleId_idx" ON "XpEvent"("subjectId", "moduleId");
