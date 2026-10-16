-- ZoeBuild control-plane foundation only.
-- Customer application data must live outside the Zoéskoul platform database.

-- CreateEnum
CREATE TYPE "BuildProjectStatus" AS ENUM ('draft', 'planning', 'generating', 'validating', 'ready', 'deploying', 'deployed', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "BuildRunOperation" AS ENUM ('plan', 'generate', 'ai_edit', 'build', 'test', 'migrate', 'deploy', 'provision_resource', 'cleanup');

-- CreateEnum
CREATE TYPE "BuildRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "BuildResourceType" AS ENUM ('database', 'backend_runtime', 'object_storage', 'auth', 'cache');

-- CreateEnum
CREATE TYPE "BuildResourceStatus" AS ENUM ('requested', 'provisioning', 'ready', 'failed', 'deleting', 'deleted');

-- CreateEnum
CREATE TYPE "BuildDeploymentStatus" AS ENUM ('queued', 'building', 'deploying', 'ready', 'failed', 'canceled', 'deleted');

-- CreateTable
CREATE TABLE "BuildProject" (
    "id" TEXT NOT NULL,
    "codeProjectId" TEXT NOT NULL,
    "status" "BuildProjectStatus" NOT NULL DEFAULT 'draft',
    "specVersion" INTEGER NOT NULL DEFAULT 1,
    "stackId" TEXT,
    "specification" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildRun" (
    "id" TEXT NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "operation" "BuildRunOperation" NOT NULL,
    "status" "BuildRunStatus" NOT NULL DEFAULT 'queued',
    "sourceVersion" INTEGER,
    "provider" TEXT,
    "model" TEXT,
    "summary" TEXT,
    "errorCode" TEXT,
    "meta" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildResource" (
    "id" TEXT NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "type" "BuildResourceType" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "status" "BuildResourceStatus" NOT NULL DEFAULT 'requested',
    "region" TEXT,
    "secretRef" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildDeployment" (
    "id" TEXT NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "status" "BuildDeploymentStatus" NOT NULL DEFAULT 'queued',
    "hostname" TEXT,
    "artifactHash" VARCHAR(64),
    "meta" JSONB,
    "deployedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuildProject_codeProjectId_key" ON "BuildProject"("codeProjectId");

-- CreateIndex
CREATE INDEX "BuildProject_status_updatedAt_idx" ON "BuildProject"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "BuildProject_stackId_idx" ON "BuildProject"("stackId");

-- CreateIndex
CREATE INDEX "BuildRun_buildProjectId_createdAt_idx" ON "BuildRun"("buildProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "BuildRun_status_createdAt_idx" ON "BuildRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BuildRun_operation_createdAt_idx" ON "BuildRun"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "BuildResource_buildProjectId_type_idx" ON "BuildResource"("buildProjectId", "type");

-- CreateIndex
CREATE INDEX "BuildResource_provider_providerRef_idx" ON "BuildResource"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "BuildResource_status_updatedAt_idx" ON "BuildResource"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "BuildDeployment_buildProjectId_createdAt_idx" ON "BuildDeployment"("buildProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "BuildDeployment_buildProjectId_environment_status_idx" ON "BuildDeployment"("buildProjectId", "environment", "status");

-- CreateIndex
CREATE INDEX "BuildDeployment_provider_providerRef_idx" ON "BuildDeployment"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "BuildDeployment_hostname_idx" ON "BuildDeployment"("hostname");

-- AddForeignKey
ALTER TABLE "BuildProject" ADD CONSTRAINT "BuildProject_codeProjectId_fkey" FOREIGN KEY ("codeProjectId") REFERENCES "CodeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildRun" ADD CONSTRAINT "BuildRun_buildProjectId_fkey" FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildResource" ADD CONSTRAINT "BuildResource_buildProjectId_fkey" FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildDeployment" ADD CONSTRAINT "BuildDeployment_buildProjectId_fkey" FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
