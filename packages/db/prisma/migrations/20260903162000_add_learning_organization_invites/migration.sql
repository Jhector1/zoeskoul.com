
CREATE TABLE "LearningOrganizationInvite" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "email" TEXT NOT NULL,
 "role" "LearningOrganizationMemberRole" NOT NULL DEFAULT 'instructor',
 "tokenHash" VARCHAR(64) NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "sentAt" TIMESTAMP(3),
 "acceptedAt" TIMESTAMP(3),
 "acceptedByUserId" TEXT,
 "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "LearningOrganizationInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LearningOrganizationInvite_tokenHash_key" ON "LearningOrganizationInvite"("tokenHash");
CREATE UNIQUE INDEX "LearningOrganizationInvite_organizationId_email_key" ON "LearningOrganizationInvite"("organizationId","email");
CREATE INDEX "LearningOrganizationInvite_organizationId_revokedAt_expiresAt_idx" ON "LearningOrganizationInvite"("organizationId","revokedAt","expiresAt");
CREATE INDEX "LearningOrganizationInvite_email_revokedAt_idx" ON "LearningOrganizationInvite"("email","revokedAt");
CREATE INDEX "LearningOrganizationInvite_acceptedByUserId_idx" ON "LearningOrganizationInvite"("acceptedByUserId");
ALTER TABLE "LearningOrganizationInvite" ADD CONSTRAINT "LearningOrganizationInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "LearningOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningOrganizationInvite" ADD CONSTRAINT "LearningOrganizationInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
