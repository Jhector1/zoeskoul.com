-- CreateTable
CREATE TABLE "ReviewQuizInstance" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "quizKey" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "questions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewQuizInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewQuizInstance_actorKey_idx" ON "ReviewQuizInstance"("actorKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewQuizInstance_actorKey_quizKey_key" ON "ReviewQuizInstance"("actorKey", "quizKey");
