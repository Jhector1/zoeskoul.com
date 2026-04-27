-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PracticeTopic" ADD VALUE 'linear_linear_systems';
ALTER TYPE "PracticeTopic" ADD VALUE 'augmented';
ALTER TYPE "PracticeTopic" ADD VALUE 'rref';
ALTER TYPE "PracticeTopic" ADD VALUE 'solution_types';
ALTER TYPE "PracticeTopic" ADD VALUE 'parametric';
ALTER TYPE "PracticeTopic" ADD VALUE 'matrix_ops';
ALTER TYPE "PracticeTopic" ADD VALUE 'matrix_matrix_inverse';
ALTER TYPE "PracticeTopic" ADD VALUE 'matrix_properties';

-- AlterTable
ALTER TABLE "PracticeSection" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "moduleId" TEXT;

-- CreateTable
CREATE TABLE "PracticeModule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "weekStart" INTEGER,
    "weekEnd" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeModule_slug_key" ON "PracticeModule"("slug");

-- CreateIndex
CREATE INDEX "PracticeModule_order_idx" ON "PracticeModule"("order");

-- CreateIndex
CREATE INDEX "PracticeSection_moduleId_idx" ON "PracticeSection"("moduleId");

-- AddForeignKey
ALTER TABLE "PracticeSection" ADD CONSTRAINT "PracticeSection_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PracticeModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
