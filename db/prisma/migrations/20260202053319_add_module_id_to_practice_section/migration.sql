-- AlterTable
ALTER TABLE "PracticeSession" ADD COLUMN     "moduleId" TEXT;

-- CreateIndex
CREATE INDEX "PracticeSession_moduleId_idx" ON "PracticeSession"("moduleId");

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PracticeModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
