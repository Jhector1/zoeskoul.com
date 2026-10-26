-- Platform-owned Zoé conversation continuity. Identical schema in all environments.
-- Requires explicit review of the target database before migration deployment.
CREATE TABLE "ZoeBuildChatMessage" (
    "id" TEXT NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "clientTurnId" VARCHAR(64) NOT NULL,
    "role" VARCHAR(12) NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZoeBuildChatMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ZoeBuildChatMessage_role_check" CHECK ("role" IN ('user', 'assistant'))
);
CREATE UNIQUE INDEX "ZoeBuildChatMessage_buildProjectId_clientTurnId_key"
    ON "ZoeBuildChatMessage"("buildProjectId", "clientTurnId");
CREATE INDEX "ZoeBuildChatMessage_buildProjectId_createdAt_id_idx"
    ON "ZoeBuildChatMessage"("buildProjectId", "createdAt", "id");
ALTER TABLE "ZoeBuildChatMessage"
    ADD CONSTRAINT "ZoeBuildChatMessage_buildProjectId_fkey"
    FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
