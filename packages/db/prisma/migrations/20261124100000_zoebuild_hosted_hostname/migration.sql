BEGIN;

-- Reserve a stable hostname independently of individual deployment releases.
-- Preserve the reservation when its project is deleted.
CREATE TABLE "BuildHostedHostname" (
    "hostname" VARCHAR(253) NOT NULL,
    "buildProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuildHostedHostname_pkey" PRIMARY KEY ("hostname")
);

CREATE UNIQUE INDEX "BuildHostedHostname_buildProjectId_key"
    ON "BuildHostedHostname"("buildProjectId");

ALTER TABLE "BuildHostedHostname"
    ADD CONSTRAINT "BuildHostedHostname_buildProjectId_fkey"
    FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
