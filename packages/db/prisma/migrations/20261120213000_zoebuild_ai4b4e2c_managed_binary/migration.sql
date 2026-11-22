-- AI4B4E2C: additive ZoeBuild-only private R2 manifests and intent journal.
-- No existing source records or media records are modified or backfilled.
CREATE TABLE "BuildManagedBinaryRevision" (
    "buildProjectId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "ownerId" VARCHAR(128) NOT NULL,
    "manifest" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuildManagedBinaryRevision_pkey" PRIMARY KEY ("buildProjectId", "sourceVersion"),
    CONSTRAINT "BuildManagedBinaryRevision_sourceVersion_check" CHECK ("sourceVersion" > 0)
);

CREATE INDEX "BuildManagedBinaryRevision_ownerId_buildProjectId_sourceVersion_idx"
    ON "BuildManagedBinaryRevision"("ownerId", "buildProjectId", "sourceVersion");

ALTER TABLE "BuildManagedBinaryRevision"
    ADD CONSTRAINT "BuildManagedBinaryRevision_buildProjectId_fkey"
    FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BuildManagedBinaryUploadIntent" (
    "assetId" VARCHAR(128) NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "ownerId" VARCHAR(128) NOT NULL,
    "plannedBaseVersion" INTEGER NOT NULL,
    "objectKey" VARCHAR(512) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BuildManagedBinaryUploadIntent_pkey" PRIMARY KEY ("assetId"),
    CONSTRAINT "BuildManagedBinaryUploadIntent_plannedBaseVersion_check" CHECK ("plannedBaseVersion" > 0),
    CONSTRAINT "BuildManagedBinaryUploadIntent_byteLength_check" CHECK ("byteLength" > 0 AND "byteLength" <= 20971520),
    CONSTRAINT "BuildManagedBinaryUploadIntent_state_check" CHECK ("state" IN ('pending', 'uploaded', 'committed')),
    CONSTRAINT "BuildManagedBinaryUploadIntent_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "BuildManagedBinaryUploadIntent_objectKey_key" ON "BuildManagedBinaryUploadIntent"("objectKey");
CREATE INDEX "BuildManagedBinaryUploadIntent_ownerId_buildProjectId_state_createdAt_idx"
    ON "BuildManagedBinaryUploadIntent"("ownerId", "buildProjectId", "state", "createdAt");
CREATE INDEX "BuildManagedBinaryUploadIntent_buildProjectId_plannedBaseVersion_idx"
    ON "BuildManagedBinaryUploadIntent"("buildProjectId", "plannedBaseVersion");

ALTER TABLE "BuildManagedBinaryUploadIntent"
    ADD CONSTRAINT "BuildManagedBinaryUploadIntent_buildProjectId_fkey"
    FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
