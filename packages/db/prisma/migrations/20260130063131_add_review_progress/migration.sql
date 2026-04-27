-- CreateTable
CREATE TABLE "ReviewProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "subjectSlug" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "locale" TEXT,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewProgress_subjectSlug_moduleId_idx" ON "ReviewProgress"("subjectSlug", "moduleId");

-- CreateIndex
CREATE INDEX "ReviewProgress_userId_idx" ON "ReviewProgress"("userId");

-- CreateIndex
CREATE INDEX "ReviewProgress_guestId_idx" ON "ReviewProgress"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewProgress_userId_subjectSlug_moduleId_key" ON "ReviewProgress"("userId", "subjectSlug", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewProgress_guestId_subjectSlug_moduleId_key" ON "ReviewProgress"("guestId", "subjectSlug", "moduleId");
