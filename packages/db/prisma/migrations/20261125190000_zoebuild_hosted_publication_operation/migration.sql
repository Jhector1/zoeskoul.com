-- No backfill, runtime mutations or automatic publication.
CREATE TABLE "BuildHostedPublicationOperation" (
    "id" VARCHAR(128) NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "requestedByOwnerId" VARCHAR(128) NOT NULL,
    "expectedGeneration" BIGINT NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "targetDeploymentId" TEXT,
    "targetSourceVersion" INTEGER,
    "targetArtifactHash" VARCHAR(64),
    "targetObjectSha256" VARCHAR(64),
    "activationToken" VARCHAR(64),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuildHostedPublicationOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BuildHostedPublicationOperation_identity_check" CHECK (
        "id" ~ '^[A-Za-z0-9_-]{4,128}$' AND
        "requestedByOwnerId" ~ '^[A-Za-z0-9_-]{4,128}$'),
    CONSTRAINT "BuildHostedPublicationOperation_generation_check" CHECK (
        "expectedGeneration" >= 0 AND "expectedGeneration" < 9223372036854775807),
    CONSTRAINT "BuildHostedPublicationOperation_target_check" CHECK (
        ("action" = 'unpublish' AND "targetDeploymentId" IS NULL AND "targetSourceVersion" IS NULL
         AND "targetArtifactHash" IS NULL AND "targetObjectSha256" IS NULL)
        OR ("action" IN ('publish','rollback') AND "targetDeploymentId" IS NOT NULL
         AND "targetSourceVersion" IS NOT NULL AND "targetSourceVersion" > 0
         AND "targetArtifactHash" IS NOT NULL AND "targetArtifactHash" ~ '^[a-f0-9]{64}$'
         AND "targetObjectSha256" IS NOT NULL AND "targetObjectSha256" ~ '^[a-f0-9]{64}$')),
    CONSTRAINT "BuildHostedPublicationOperation_completion_check" CHECK (
        ("completedAt" IS NULL AND "activationToken" IS NULL)
        OR ("completedAt" IS NOT NULL AND
            (("action" = 'unpublish' AND "activationToken" IS NULL)
             OR ("action" IN ('publish','rollback') AND "activationToken" IS NOT NULL
                 AND "activationToken" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+]00:00)$')))),
    CONSTRAINT "BuildHostedPublicationOperation_buildProjectId_fkey" FOREIGN KEY ("buildProjectId")
        REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "BuildHostedPublicationOperation_target_fkey" FOREIGN KEY ("buildProjectId", "targetDeploymentId")
        REFERENCES "BuildDeployment"("buildProjectId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "HostedPublicationOperation_project_generation_key"
    ON "BuildHostedPublicationOperation"("buildProjectId", "expectedGeneration");
CREATE INDEX "HostedPublicationOperation_project_target_idx"
    ON "BuildHostedPublicationOperation"("buildProjectId", "targetDeploymentId");
-- Preserve this database-only partial unique index in subsequent migrations.
CREATE UNIQUE INDEX "BuildHostedPublicationOperation_one_pending_key"
    ON "BuildHostedPublicationOperation"("buildProjectId") WHERE "completedAt" IS NULL;
