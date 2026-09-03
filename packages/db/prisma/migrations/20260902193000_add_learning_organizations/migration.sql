
CREATE TYPE "LearningOrganizationMemberRole" AS ENUM ('admin', 'instructor');

CREATE TABLE "LearningOrganization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearningOrganization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningOrganizationMember" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LearningOrganizationMemberRole" NOT NULL DEFAULT 'instructor',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningOrganizationMember_pkey" PRIMARY KEY ("organizationId", "userId")
);

ALTER TABLE "LearningGroup"
ADD COLUMN "organizationId" TEXT;

CREATE UNIQUE INDEX "LearningOrganization_slug_key"
ON "LearningOrganization"("slug");

CREATE INDEX "LearningOrganization_ownerId_updatedAt_idx"
ON "LearningOrganization"("ownerId", "updatedAt");

CREATE INDEX "LearningOrganizationMember_userId_idx"
ON "LearningOrganizationMember"("userId");

CREATE INDEX "LearningOrganizationMember_organizationId_role_idx"
ON "LearningOrganizationMember"("organizationId", "role");

CREATE INDEX "LearningGroup_organizationId_updatedAt_idx"
ON "LearningGroup"("organizationId", "updatedAt");

ALTER TABLE "LearningOrganization"
ADD CONSTRAINT "LearningOrganization_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningOrganizationMember"
ADD CONSTRAINT "LearningOrganizationMember_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "LearningOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningOrganizationMember"
ADD CONSTRAINT "LearningOrganizationMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningGroup"
ADD CONSTRAINT "LearningGroup_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "LearningOrganization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
