-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('enrolled', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "EnrollmentSource" AS ENUM ('self', 'assignment', 'admin', 'import');

-- CreateEnum
CREATE TYPE "AccessGrantType" AS ENUM ('subscription', 'purchase', 'assignment', 'admin', 'trial');

-- CreateTable
CREATE TABLE "SubjectAccessGrant" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "subjectId" TEXT NOT NULL,
    "type" "AccessGrantType" NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectEnrollment" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "subjectId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'enrolled',
    "source" "EnrollmentSource" NOT NULL DEFAULT 'self',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectAccessGrant_actorKey_subjectId_revokedAt_idx" ON "SubjectAccessGrant"("actorKey", "subjectId", "revokedAt");

-- CreateIndex
CREATE INDEX "SubjectAccessGrant_actorKey_subjectId_endsAt_idx" ON "SubjectAccessGrant"("actorKey", "subjectId", "endsAt");

-- CreateIndex
CREATE INDEX "SubjectAccessGrant_actorKey_idx" ON "SubjectAccessGrant"("actorKey");

-- CreateIndex
CREATE INDEX "SubjectAccessGrant_actorKey_subjectId_idx" ON "SubjectAccessGrant"("actorKey", "subjectId");

-- CreateIndex
CREATE INDEX "SubjectAccessGrant_subjectId_idx" ON "SubjectAccessGrant"("subjectId");

-- CreateIndex
CREATE INDEX "SubjectAccessGrant_type_idx" ON "SubjectAccessGrant"("type");

-- CreateIndex
CREATE INDEX "SubjectAccessGrant_endsAt_idx" ON "SubjectAccessGrant"("endsAt");

-- CreateIndex
CREATE INDEX "SubjectAccessGrant_revokedAt_idx" ON "SubjectAccessGrant"("revokedAt");

-- CreateIndex
CREATE INDEX "SubjectEnrollment_actorKey_lastSeenAt_idx" ON "SubjectEnrollment"("actorKey", "lastSeenAt");

-- CreateIndex
CREATE INDEX "SubjectEnrollment_userId_idx" ON "SubjectEnrollment"("userId");

-- CreateIndex
CREATE INDEX "SubjectEnrollment_subjectId_idx" ON "SubjectEnrollment"("subjectId");

-- CreateIndex
CREATE INDEX "SubjectEnrollment_actorKey_status_idx" ON "SubjectEnrollment"("actorKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectEnrollment_actorKey_subjectId_key" ON "SubjectEnrollment"("actorKey", "subjectId");

-- AddForeignKey
ALTER TABLE "SubjectAccessGrant" ADD CONSTRAINT "SubjectAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectAccessGrant" ADD CONSTRAINT "SubjectAccessGrant_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectEnrollment" ADD CONSTRAINT "SubjectEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectEnrollment" ADD CONSTRAINT "SubjectEnrollment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
