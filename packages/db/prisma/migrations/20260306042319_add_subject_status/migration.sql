-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('active', 'coming_soon', 'disabled');

-- AlterTable
ALTER TABLE "PracticeSubject" ADD COLUMN     "status" "SubjectStatus" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "PracticeSubject_status_order_idx" ON "PracticeSubject"("status", "order");
