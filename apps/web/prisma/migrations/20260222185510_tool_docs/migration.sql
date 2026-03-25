-- CreateEnum
CREATE TYPE "ToolDocFormat" AS ENUM ('markdown', 'plain');

-- CreateTable
CREATE TABLE "ToolDoc" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "subjectSlug" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "format" "ToolDocFormat" NOT NULL DEFAULT 'markdown',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolDoc_actorKey_idx" ON "ToolDoc"("actorKey");

-- CreateIndex
CREATE INDEX "ToolDoc_subjectSlug_moduleId_locale_idx" ON "ToolDoc"("subjectSlug", "moduleId", "locale");

-- CreateIndex
CREATE INDEX "ToolDoc_toolId_idx" ON "ToolDoc"("toolId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolDoc_actorKey_subjectSlug_moduleId_locale_toolId_scopeKe_key" ON "ToolDoc"("actorKey", "subjectSlug", "moduleId", "locale", "toolId", "scopeKey");
