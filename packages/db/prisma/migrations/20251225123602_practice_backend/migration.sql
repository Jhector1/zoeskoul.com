-- CreateEnum
CREATE TYPE "PracticeTopic" AS ENUM ('dot', 'projection', 'angle', 'vectors');

-- CreateEnum
CREATE TYPE "PracticeKind" AS ENUM ('single_choice', 'multi_choice', 'numeric', 'vector_drag_target', 'vector_drag_dot');

-- CreateEnum
CREATE TYPE "PracticeDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "PracticeSessionStatus" AS ENUM ('active', 'completed');

-- CreateTable
CREATE TABLE "PracticeSection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "topics" "PracticeTopic"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL,
    "status" "PracticeSessionStatus" NOT NULL DEFAULT 'active',
    "userId" TEXT,
    "guestId" TEXT,
    "sectionId" TEXT NOT NULL,
    "difficulty" "PracticeDifficulty" NOT NULL,
    "targetCount" INTEGER NOT NULL DEFAULT 10,
    "total" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastInstanceId" TEXT,

    CONSTRAINT "PracticeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeQuestionInstance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "topic" "PracticeTopic" NOT NULL,
    "kind" "PracticeKind" NOT NULL,
    "difficulty" "PracticeDifficulty" NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "publicPayload" JSONB NOT NULL,
    "secretPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "PracticeQuestionInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "instanceId" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "answerPayload" JSONB NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "revealUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSection_slug_key" ON "PracticeSection"("slug");

-- CreateIndex
CREATE INDEX "PracticeSession_userId_idx" ON "PracticeSession"("userId");

-- CreateIndex
CREATE INDEX "PracticeSession_guestId_idx" ON "PracticeSession"("guestId");

-- CreateIndex
CREATE INDEX "PracticeSession_sectionId_idx" ON "PracticeSession"("sectionId");

-- CreateIndex
CREATE INDEX "PracticeQuestionInstance_sessionId_idx" ON "PracticeQuestionInstance"("sessionId");

-- CreateIndex
CREATE INDEX "PracticeQuestionInstance_topic_difficulty_idx" ON "PracticeQuestionInstance"("topic", "difficulty");

-- CreateIndex
CREATE INDEX "PracticeAttempt_sessionId_idx" ON "PracticeAttempt"("sessionId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_instanceId_idx" ON "PracticeAttempt"("instanceId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_userId_idx" ON "PracticeAttempt"("userId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_guestId_idx" ON "PracticeAttempt"("guestId");

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PracticeSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestionInstance" ADD CONSTRAINT "PracticeQuestionInstance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "PracticeQuestionInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
