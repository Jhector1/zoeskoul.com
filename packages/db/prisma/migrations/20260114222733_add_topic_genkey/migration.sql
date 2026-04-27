-- AlterTable
ALTER TABLE "PracticeTopic" ADD COLUMN     "genKey" TEXT;

-- CreateIndex
CREATE INDEX "PracticeTopic_genKey_idx" ON "PracticeTopic"("genKey");
