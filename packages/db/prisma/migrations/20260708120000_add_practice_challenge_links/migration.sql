-- CreateTable
CREATE TABLE "PracticeChallengeLink" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "locale" VARCHAR(8) NOT NULL DEFAULT 'en',
    "subjectSlug" TEXT NOT NULL,
    "moduleSlug" TEXT NOT NULL,
    "sectionSlug" TEXT NOT NULL,
    "topicSlug" TEXT NOT NULL,
    "exerciseKey" TEXT NOT NULL,
    "exercisePurpose" "PracticePurpose" NOT NULL DEFAULT 'project',
    "signedToken" TEXT NOT NULL,
    "shareTitle" TEXT,
    "shareDescription" TEXT,
    "ogImagePublicId" TEXT,
    "ogImageAlt" TEXT,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeChallengeLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeChallengeLink_code_key" ON "PracticeChallengeLink"("code");
CREATE INDEX "PracticeChallengeLink_exerciseKey_idx" ON "PracticeChallengeLink"("exerciseKey");
CREATE INDEX "PracticeChallengeLink_subjectSlug_moduleSlug_idx" ON "PracticeChallengeLink"("subjectSlug", "moduleSlug");
CREATE INDEX "PracticeChallengeLink_createdById_createdAt_idx" ON "PracticeChallengeLink"("createdById", "createdAt");
CREATE INDEX "PracticeChallengeLink_expiresAt_idx" ON "PracticeChallengeLink"("expiresAt");
CREATE INDEX "PracticeChallengeLink_revokedAt_idx" ON "PracticeChallengeLink"("revokedAt");

-- AddForeignKey
ALTER TABLE "PracticeChallengeLink"
ADD CONSTRAINT "PracticeChallengeLink_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
