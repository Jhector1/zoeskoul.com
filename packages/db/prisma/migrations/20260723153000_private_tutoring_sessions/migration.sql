CREATE TYPE "TutoringSessionStatus" AS ENUM ('draft', 'live', 'shared', 'archived');
CREATE TYPE "TutoringSelectionScope" AS ENUM ('course', 'module', 'section', 'topic');
CREATE TYPE "TutoringParticipantRole" AS ENUM ('learner', 'observer');

CREATE TABLE "TutoringSession" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "ownerId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "sourceSubjectSlug" TEXT NOT NULL,
  "selectionScope" "TutoringSelectionScope" NOT NULL,
  "sourceModuleSlug" TEXT,
  "sourceSectionSlug" TEXT,
  "sourceTopicId" TEXT,
  "snapshot" JSONB NOT NULL,
  "status" "TutoringSessionStatus" NOT NULL DEFAULT 'draft',
  "allowStudentEditing" BOOLEAN NOT NULL DEFAULT true,
  "sharedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TutoringSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TutoringSessionUser" (
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TutoringParticipantRole" NOT NULL DEFAULT 'learner',
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TutoringSessionUser_pkey" PRIMARY KEY ("sessionId","userId")
);

CREATE TABLE "TutoringSessionGroup" (
  "sessionId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TutoringSessionGroup_pkey" PRIMARY KEY ("sessionId","groupId")
);

CREATE TABLE "TutoringSessionDocument" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "cardKey" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  "format" "ToolDocFormat" NOT NULL DEFAULT 'markdown',
  "body" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TutoringSessionDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TutoringSession_slug_key" ON "TutoringSession"("slug");
CREATE INDEX "TutoringSession_ownerId_updatedAt_idx" ON "TutoringSession"("ownerId","updatedAt");
CREATE INDEX "TutoringSession_subjectId_status_idx" ON "TutoringSession"("subjectId","status");
CREATE INDEX "TutoringSession_status_sharedAt_idx" ON "TutoringSession"("status","sharedAt");
CREATE INDEX "TutoringSessionUser_userId_idx" ON "TutoringSessionUser"("userId");
CREATE INDEX "TutoringSessionGroup_groupId_idx" ON "TutoringSessionGroup"("groupId");
CREATE UNIQUE INDEX "TutoringSessionDocument_sessionId_moduleKey_cardKey_toolId_key" ON "TutoringSessionDocument"("sessionId","moduleKey","cardKey","toolId");
CREATE INDEX "TutoringSessionDocument_sessionId_updatedAt_idx" ON "TutoringSessionDocument"("sessionId","updatedAt");

ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutoringSessionUser" ADD CONSTRAINT "TutoringSessionUser_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutoringSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutoringSessionUser" ADD CONSTRAINT "TutoringSessionUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutoringSessionGroup" ADD CONSTRAINT "TutoringSessionGroup_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutoringSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutoringSessionGroup" ADD CONSTRAINT "TutoringSessionGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LearningGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutoringSessionDocument" ADD CONSTRAINT "TutoringSessionDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutoringSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
