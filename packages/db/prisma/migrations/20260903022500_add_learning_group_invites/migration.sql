-- Separate class-membership invitation state.
-- Shared token/email mechanics remain application-level helpers.
CREATE TABLE "LearningGroupInvite" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LearningGroupInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningGroupInvite_tokenHash_key"
ON "LearningGroupInvite"("tokenHash");

CREATE UNIQUE INDEX "LearningGroupInvite_groupId_email_key"
ON "LearningGroupInvite"("groupId", "email");

CREATE INDEX "LearningGroupInvite_groupId_revokedAt_expiresAt_idx"
ON "LearningGroupInvite"("groupId", "revokedAt", "expiresAt");

CREATE INDEX "LearningGroupInvite_email_revokedAt_idx"
ON "LearningGroupInvite"("email", "revokedAt");

CREATE INDEX "LearningGroupInvite_acceptedByUserId_idx"
ON "LearningGroupInvite"("acceptedByUserId");

ALTER TABLE "LearningGroupInvite"
ADD CONSTRAINT "LearningGroupInvite_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "LearningGroup"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningGroupInvite"
ADD CONSTRAINT "LearningGroupInvite_acceptedByUserId_fkey"
FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
