-- Phase 4E3C4B2: additive ZoeBuild-only grant persistence.
-- Do NOT drop existing tables. Deploy before enabling feature flags.
CREATE TABLE "BuildDevelopmentPreviewReadGrant" (
  "id" VARCHAR(64) NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "buildProjectId" TEXT NOT NULL,
  "previewId" VARCHAR(128) NOT NULL,
  "sourceVersionFloor" INTEGER NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BuildDevelopmentPreviewReadGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BuildDevelopmentPreviewReadGrant_floor_check" CHECK ("sourceVersionFloor" > 0),
  CONSTRAINT "BuildDevelopmentPreviewReadGrant_expiration_check" CHECK ("expiresAt" <= "absoluteExpiresAt")
);
CREATE INDEX "zoebuild_grants_lookup_idx"
  ON "BuildDevelopmentPreviewReadGrant"("buildProjectId", "previewId", "userId", "revokedAt");
CREATE INDEX "zoebuild_grants_expires_idx"
  ON "BuildDevelopmentPreviewReadGrant"("expiresAt");
CREATE INDEX "zoebuild_grants_absolute_idx"
  ON "BuildDevelopmentPreviewReadGrant"("absoluteExpiresAt");
ALTER TABLE "BuildDevelopmentPreviewReadGrant"
  ADD CONSTRAINT "BuildDevelopmentPreviewReadGrant_buildProjectId_fkey"
  FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
