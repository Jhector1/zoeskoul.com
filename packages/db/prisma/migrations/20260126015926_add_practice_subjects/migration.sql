-- AlterTable
ALTER TABLE "PracticeModule" ADD COLUMN     "subjectId" TEXT;

-- AlterTable
ALTER TABLE "PracticeSection" ADD COLUMN     "subjectId" TEXT;

-- AlterTable
ALTER TABLE "PracticeTopic" ADD COLUMN     "subjectId" TEXT;

-- CreateTable
CREATE TABLE "PracticeSubject" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeSubject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSubject_slug_key" ON "PracticeSubject"("slug");

-- CreateIndex
CREATE INDEX "PracticeSubject_order_idx" ON "PracticeSubject"("order");

-- CreateIndex
CREATE INDEX "PracticeModule_subjectId_order_idx" ON "PracticeModule"("subjectId", "order");

-- CreateIndex
CREATE INDEX "PracticeSection_subjectId_order_idx" ON "PracticeSection"("subjectId", "order");

-- CreateIndex
CREATE INDEX "PracticeTopic_subjectId_order_idx" ON "PracticeTopic"("subjectId", "order");

-- AddForeignKey
ALTER TABLE "PracticeModule" ADD CONSTRAINT "PracticeModule_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeTopic" ADD CONSTRAINT "PracticeTopic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSection" ADD CONSTRAINT "PracticeSection_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
