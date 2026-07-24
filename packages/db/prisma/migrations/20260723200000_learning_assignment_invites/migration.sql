CREATE TABLE "LearningAssignmentInvite" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearningAssignmentInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningAssignmentInvite_tokenHash_key"
ON "LearningAssignmentInvite"("tokenHash");

CREATE UNIQUE INDEX "LearningAssignmentInvite_assignmentId_email_key"
ON "LearningAssignmentInvite"("assignmentId", "email");

CREATE INDEX "LearningAssignmentInvite_assignmentId_revokedAt_expiresAt_idx"
ON "LearningAssignmentInvite"("assignmentId", "revokedAt", "expiresAt");

CREATE INDEX "LearningAssignmentInvite_email_revokedAt_idx"
ON "LearningAssignmentInvite"("email", "revokedAt");

CREATE INDEX "LearningAssignmentInvite_acceptedByUserId_idx"
ON "LearningAssignmentInvite"("acceptedByUserId");

ALTER TABLE "LearningAssignmentInvite"
ADD CONSTRAINT "LearningAssignmentInvite_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "LearningAssignment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningAssignmentInvite"
ADD CONSTRAINT "LearningAssignmentInvite_acceptedByUserId_fkey"
FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
