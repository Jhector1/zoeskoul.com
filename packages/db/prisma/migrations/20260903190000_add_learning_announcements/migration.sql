CREATE TYPE "LearningAnnouncementScope" AS ENUM ('school', 'class');

CREATE TABLE "LearningAnnouncement" (
    "id" TEXT NOT NULL,
    "scope" "LearningAnnouncementScope" NOT NULL,
    "organizationId" TEXT,
    "groupId" TEXT,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningAnnouncement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LearningAnnouncement_scope_target_check" CHECK (
      ("scope" = 'school' AND "organizationId" IS NOT NULL AND "groupId" IS NULL)
      OR
      ("scope" = 'class' AND "organizationId" IS NULL AND "groupId" IS NOT NULL)
    )
);

CREATE TABLE "LearningAnnouncementReceipt" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningAnnouncementReceipt_pkey" PRIMARY KEY ("announcementId","userId")
);

CREATE INDEX "LearningAnnouncement_organizationId_publishedAt_idx"
ON "LearningAnnouncement"("organizationId", "publishedAt");

CREATE INDEX "LearningAnnouncement_groupId_publishedAt_idx"
ON "LearningAnnouncement"("groupId", "publishedAt");

CREATE INDEX "LearningAnnouncement_authorId_publishedAt_idx"
ON "LearningAnnouncement"("authorId", "publishedAt");

CREATE INDEX "LearningAnnouncementReceipt_userId_readAt_createdAt_idx"
ON "LearningAnnouncementReceipt"("userId", "readAt", "createdAt");

ALTER TABLE "LearningAnnouncement"
ADD CONSTRAINT "LearningAnnouncement_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "LearningOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAnnouncement"
ADD CONSTRAINT "LearningAnnouncement_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "LearningGroup"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAnnouncement"
ADD CONSTRAINT "LearningAnnouncement_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAnnouncementReceipt"
ADD CONSTRAINT "LearningAnnouncementReceipt_announcementId_fkey"
FOREIGN KEY ("announcementId") REFERENCES "LearningAnnouncement"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAnnouncementReceipt"
ADD CONSTRAINT "LearningAnnouncementReceipt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
