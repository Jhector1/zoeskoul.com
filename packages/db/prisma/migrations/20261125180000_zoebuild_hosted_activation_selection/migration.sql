-- Source-only migration. No backfill or automatic publication.
CREATE UNIQUE INDEX "BuildDeployment_buildProjectId_id_key"
    ON "BuildDeployment"("buildProjectId", "id");

CREATE TABLE "BuildHostedActivation" (
    "buildProjectId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "activationToken" VARCHAR(64),
    "generation" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BuildHostedActivation_pkey" PRIMARY KEY ("buildProjectId"),
    CONSTRAINT "BuildHostedActivation_selection_check" CHECK (
        ("deploymentId" IS NULL AND "activationToken" IS NULL)
        OR ("deploymentId" IS NOT NULL AND "activationToken" IS NOT NULL
            AND "activationToken" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+]00:00)$'
            AND "generation" > 0)
    ),
    CONSTRAINT "BuildHostedActivation_generation_check" CHECK ("generation" >= 0),
    CONSTRAINT "BuildHostedActivation_buildProjectId_fkey"
        FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "BuildHostedActivation_buildProjectId_deploymentId_fkey"
        FOREIGN KEY ("buildProjectId", "deploymentId")
        REFERENCES "BuildDeployment"("buildProjectId", "id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "BuildHostedActivation_buildProjectId_deploymentId_idx"
    ON "BuildHostedActivation"("buildProjectId", "deploymentId");
