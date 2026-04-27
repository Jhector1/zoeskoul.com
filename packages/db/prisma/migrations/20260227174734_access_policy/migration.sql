-- CreateEnum
CREATE TYPE "AccessPolicy" AS ENUM ('free', 'paid');

-- CreateEnum
CREATE TYPE "AccessOverride" AS ENUM ('inherit', 'free', 'paid');

-- AlterTable
ALTER TABLE "PracticeModule" ADD COLUMN     "accessOverride" "AccessOverride" NOT NULL DEFAULT 'inherit',
ADD COLUMN     "entitlementKey" TEXT;

-- AlterTable
ALTER TABLE "PracticeSubject" ADD COLUMN     "accessPolicy" "AccessPolicy" NOT NULL DEFAULT 'free',
ADD COLUMN     "entitlementKey" TEXT;

-- CreateTable
CREATE TABLE "ModuleAccessGrant" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "moduleId" TEXT NOT NULL,
    "type" "AccessGrantType" NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModuleAccessGrant_actorKey_moduleId_revokedAt_idx" ON "ModuleAccessGrant"("actorKey", "moduleId", "revokedAt");

-- CreateIndex
CREATE INDEX "ModuleAccessGrant_actorKey_moduleId_endsAt_idx" ON "ModuleAccessGrant"("actorKey", "moduleId", "endsAt");

-- CreateIndex
CREATE INDEX "ModuleAccessGrant_actorKey_idx" ON "ModuleAccessGrant"("actorKey");

-- CreateIndex
CREATE INDEX "ModuleAccessGrant_moduleId_idx" ON "ModuleAccessGrant"("moduleId");

-- CreateIndex
CREATE INDEX "ModuleAccessGrant_type_idx" ON "ModuleAccessGrant"("type");

-- CreateIndex
CREATE INDEX "ModuleAccessGrant_endsAt_idx" ON "ModuleAccessGrant"("endsAt");

-- CreateIndex
CREATE INDEX "ModuleAccessGrant_revokedAt_idx" ON "ModuleAccessGrant"("revokedAt");

-- AddForeignKey
ALTER TABLE "ModuleAccessGrant" ADD CONSTRAINT "ModuleAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleAccessGrant" ADD CONSTRAINT "ModuleAccessGrant_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PracticeModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
