-- AI4B3A: additive. Must be reviewed against current migration history before deploy.
CREATE TABLE "BuildMediaAsset" (
    "id" VARCHAR(128) NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "ownerId" VARCHAR(128) NOT NULL,
    "objectKey" VARCHAR(512) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "origin" VARCHAR(16) NOT NULL,
    "visibility" VARCHAR(16) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "altText" VARCHAR(300),
    "providerId" VARCHAR(64),
    "modelId" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BuildMediaAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BuildMediaAsset_buildProjectId_fkey" FOREIGN KEY ("buildProjectId")
      REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BuildMediaAsset_objectKey_key" ON "BuildMediaAsset"("objectKey");
CREATE INDEX "BuildMediaAsset_buildProjectId_createdAt_idx" ON "BuildMediaAsset"("buildProjectId", "createdAt");
CREATE INDEX "BuildMediaAsset_ownerId_buildProjectId_createdAt_idx" ON "BuildMediaAsset"("ownerId", "buildProjectId", "createdAt");
