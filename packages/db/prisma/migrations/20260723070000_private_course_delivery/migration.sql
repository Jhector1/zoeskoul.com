CREATE TYPE "SubjectVisibility" AS ENUM ('public', 'private', 'organization');
CREATE TYPE "LearningAssignmentStatus" AS ENUM ('draft', 'assigned', 'closed');
CREATE TYPE "LearningSolutionVisibility" AS ENUM ('instructor_only', 'after_completion', 'after_due_date', 'always');
CREATE TYPE "LearningGroupMemberRole" AS ENUM ('student', 'instructor');

ALTER TABLE "PracticeSubject"
ADD COLUMN "visibility" "SubjectVisibility" NOT NULL DEFAULT 'public';

CREATE INDEX "PracticeSubject_visibility_status_order_idx"
ON "PracticeSubject"("visibility", "status", "order");

CREATE TABLE "LearningGroup" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearningGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningGroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LearningGroupMemberRole" NOT NULL DEFAULT 'student',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningGroupMember_pkey" PRIMARY KEY ("groupId", "userId")
);

CREATE TABLE "LearningAssignment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subjectId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "LearningAssignmentStatus" NOT NULL DEFAULT 'draft',
    "availableFrom" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "solutionVisibility" "LearningSolutionVisibility" NOT NULL DEFAULT 'instructor_only',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearningAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningAssignmentUser" (
    "assignmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningAssignmentUser_pkey" PRIMARY KEY ("assignmentId", "userId")
);

CREATE TABLE "LearningAssignmentGroup" (
    "assignmentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningAssignmentGroup_pkey" PRIMARY KEY ("assignmentId", "groupId")
);

CREATE UNIQUE INDEX "LearningGroup_slug_key" ON "LearningGroup"("slug");
CREATE INDEX "LearningGroup_ownerId_updatedAt_idx" ON "LearningGroup"("ownerId", "updatedAt");
CREATE INDEX "LearningGroupMember_userId_idx" ON "LearningGroupMember"("userId");
CREATE UNIQUE INDEX "LearningAssignment_slug_key" ON "LearningAssignment"("slug");
CREATE INDEX "LearningAssignment_subjectId_status_idx" ON "LearningAssignment"("subjectId", "status");
CREATE INDEX "LearningAssignment_ownerId_updatedAt_idx" ON "LearningAssignment"("ownerId", "updatedAt");
CREATE INDEX "LearningAssignment_status_availableFrom_dueAt_idx" ON "LearningAssignment"("status", "availableFrom", "dueAt");
CREATE INDEX "LearningAssignmentUser_userId_idx" ON "LearningAssignmentUser"("userId");
CREATE INDEX "LearningAssignmentGroup_groupId_idx" ON "LearningAssignmentGroup"("groupId");

ALTER TABLE "LearningGroup"
ADD CONSTRAINT "LearningGroup_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningGroupMember"
ADD CONSTRAINT "LearningGroupMember_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "LearningGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningGroupMember"
ADD CONSTRAINT "LearningGroupMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAssignment"
ADD CONSTRAINT "LearningAssignment_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAssignment"
ADD CONSTRAINT "LearningAssignment_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAssignmentUser"
ADD CONSTRAINT "LearningAssignmentUser_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "LearningAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAssignmentUser"
ADD CONSTRAINT "LearningAssignmentUser_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAssignmentGroup"
ADD CONSTRAINT "LearningAssignmentGroup_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "LearningAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAssignmentGroup"
ADD CONSTRAINT "LearningAssignmentGroup_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "LearningGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
