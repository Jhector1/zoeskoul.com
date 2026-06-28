-- CreateEnum
CREATE TYPE "FeatureKey" AS ENUM ('ide_multi_file', 'ide_save_cloud', 'ide_project_create', 'ide_project_revisions', 'ide_project_scope_module', 'ide_project_scope_assignment', 'ide_project_share', 'ide_project_unlimited');

-- CreateEnum
CREATE TYPE "CodeProjectScopeKind" AS ENUM ('personal', 'module', 'assignment', 'template');

-- CreateEnum
CREATE TYPE "CodeProjectVisibility" AS ENUM ('private', 'unlisted', 'shared');

-- CreateEnum
CREATE TYPE "CodeProjectRole" AS ENUM ('owner', 'editor', 'viewer');

-- CreateTable
CREATE TABLE "FeatureGrant" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "feature" "FeatureKey" NOT NULL,
    "type" "AccessGrantType" NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeProject" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT NOT NULL,
    "scopeKind" "CodeProjectScopeKind" NOT NULL DEFAULT 'personal',
    "subjectId" TEXT,
    "moduleId" TEXT,
    "assignmentId" TEXT,
    "scopeKey" TEXT,
    "visibility" "CodeProjectVisibility" NOT NULL DEFAULT 'private',
    "shareToken" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "entryPath" TEXT,
    "activePath" TEXT,
    "workspaceHash" VARCHAR(64),
    "workspace" JSONB NOT NULL,
    "settings" JSONB,
    "meta" JSONB,
    "archivedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeProjectRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "workspaceHash" VARCHAR(64),
    "snapshot" JSONB NOT NULL,
    "settings" JSONB,
    "note" TEXT,
    "meta" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeProjectRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeProjectGrant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "role" "CodeProjectRole" NOT NULL DEFAULT 'viewer',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeProjectGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureGrant_actorKey_feature_revokedAt_idx" ON "FeatureGrant"("actorKey", "feature", "revokedAt");

-- CreateIndex
CREATE INDEX "FeatureGrant_actorKey_feature_endsAt_idx" ON "FeatureGrant"("actorKey", "feature", "endsAt");

-- CreateIndex
CREATE INDEX "FeatureGrant_actorKey_idx" ON "FeatureGrant"("actorKey");

-- CreateIndex
CREATE INDEX "FeatureGrant_userId_idx" ON "FeatureGrant"("userId");

-- CreateIndex
CREATE INDEX "FeatureGrant_feature_idx" ON "FeatureGrant"("feature");

-- CreateIndex
CREATE INDEX "FeatureGrant_type_idx" ON "FeatureGrant"("type");

-- CreateIndex
CREATE UNIQUE INDEX "CodeProject_shareToken_key" ON "CodeProject"("shareToken");

-- CreateIndex
CREATE INDEX "CodeProject_ownerId_updatedAt_idx" ON "CodeProject"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "CodeProject_ownerId_scopeKind_updatedAt_idx" ON "CodeProject"("ownerId", "scopeKind", "updatedAt");

-- CreateIndex
CREATE INDEX "CodeProject_subjectId_updatedAt_idx" ON "CodeProject"("subjectId", "updatedAt");

-- CreateIndex
CREATE INDEX "CodeProject_moduleId_updatedAt_idx" ON "CodeProject"("moduleId", "updatedAt");

-- CreateIndex
CREATE INDEX "CodeProject_assignmentId_updatedAt_idx" ON "CodeProject"("assignmentId", "updatedAt");

-- CreateIndex
CREATE INDEX "CodeProject_visibility_idx" ON "CodeProject"("visibility");

-- CreateIndex
CREATE INDEX "CodeProject_archivedAt_idx" ON "CodeProject"("archivedAt");

-- CreateIndex
CREATE INDEX "CodeProjectRevision_projectId_createdAt_idx" ON "CodeProjectRevision"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "CodeProjectRevision_projectId_workspaceHash_idx" ON "CodeProjectRevision"("projectId", "workspaceHash");

-- CreateIndex
CREATE UNIQUE INDEX "CodeProjectRevision_projectId_version_key" ON "CodeProjectRevision"("projectId", "version");

-- CreateIndex
CREATE INDEX "CodeProjectGrant_projectId_actorKey_revokedAt_idx" ON "CodeProjectGrant"("projectId", "actorKey", "revokedAt");

-- CreateIndex
CREATE INDEX "CodeProjectGrant_projectId_actorKey_endsAt_idx" ON "CodeProjectGrant"("projectId", "actorKey", "endsAt");

-- CreateIndex
CREATE INDEX "CodeProjectGrant_actorKey_idx" ON "CodeProjectGrant"("actorKey");

-- CreateIndex
CREATE INDEX "CodeProjectGrant_userId_idx" ON "CodeProjectGrant"("userId");

-- CreateIndex
CREATE INDEX "CodeProjectGrant_role_idx" ON "CodeProjectGrant"("role");

-- AddForeignKey
ALTER TABLE "FeatureGrant" ADD CONSTRAINT "FeatureGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeProject" ADD CONSTRAINT "CodeProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeProject" ADD CONSTRAINT "CodeProject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeProject" ADD CONSTRAINT "CodeProject_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PracticeModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeProject" ADD CONSTRAINT "CodeProject_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeProjectRevision" ADD CONSTRAINT "CodeProjectRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CodeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeProjectRevision" ADD CONSTRAINT "CodeProjectRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeProjectGrant" ADD CONSTRAINT "CodeProjectGrant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CodeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeProjectGrant" ADD CONSTRAINT "CodeProjectGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
