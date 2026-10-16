-- ZoeBuild V1 compiled artifact persistence.
--
-- Source remains owned by CodeProject/CodeProjectRevision.
-- These tables own only immutable production-build output.

ALTER TABLE "BuildDeployment"
ADD COLUMN "buildArtifactId" TEXT;

CREATE TABLE "BuildArtifact" (
    "id" TEXT NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "outputPath" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "artifactHash" VARCHAR(64) NOT NULL,
    "fileCount" INTEGER NOT NULL,
    "totalBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildArtifact_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE "BuildArtifactFile" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "path" VARCHAR(1024) NOT NULL,
    "content" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildArtifactFile_pkey"
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX
"BuildArtifact_buildProjectId_sourceVersion_artifactHash_key"
ON "BuildArtifact"(
    "buildProjectId",
    "sourceVersion",
    "artifactHash"
);

CREATE INDEX
"BuildArtifact_buildProjectId_createdAt_idx"
ON "BuildArtifact"(
    "buildProjectId",
    "createdAt"
);

CREATE INDEX
"BuildArtifact_provider_artifactHash_idx"
ON "BuildArtifact"(
    "provider",
    "artifactHash"
);

CREATE UNIQUE INDEX
"BuildArtifactFile_artifactId_path_key"
ON "BuildArtifactFile"(
    "artifactId",
    "path"
);

CREATE INDEX
"BuildArtifactFile_artifactId_idx"
ON "BuildArtifactFile"(
    "artifactId"
);

CREATE INDEX
"BuildDeployment_buildArtifactId_idx"
ON "BuildDeployment"(
    "buildArtifactId"
);

ALTER TABLE "BuildArtifact"
ADD CONSTRAINT "BuildArtifact_buildProjectId_fkey"
FOREIGN KEY ("buildProjectId")
REFERENCES "BuildProject"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "BuildArtifactFile"
ADD CONSTRAINT "BuildArtifactFile_artifactId_fkey"
FOREIGN KEY ("artifactId")
REFERENCES "BuildArtifact"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "BuildDeployment"
ADD CONSTRAINT "BuildDeployment_buildArtifactId_fkey"
FOREIGN KEY ("buildArtifactId")
REFERENCES "BuildArtifact"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
