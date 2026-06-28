-- CreateTable
CREATE TABLE "PracticeCatalog" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "imageAlt" TEXT,
    "imagePublicId" TEXT,
    "status" "SubjectStatus" NOT NULL DEFAULT 'active',
    "defaultSubjectSlug" TEXT,

    CONSTRAINT "PracticeCatalog_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PracticeSubject" ADD COLUMN "catalogId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PracticeCatalog_slug_key" ON "PracticeCatalog"("slug");
CREATE INDEX "PracticeCatalog_order_idx" ON "PracticeCatalog"("order");
CREATE INDEX "PracticeCatalog_status_order_idx" ON "PracticeCatalog"("status", "order");
CREATE INDEX "PracticeSubject_catalogId_order_idx" ON "PracticeSubject"("catalogId", "order");

-- AddForeignKey
ALTER TABLE "PracticeSubject"
ADD CONSTRAINT "PracticeSubject_catalogId_fkey"
FOREIGN KEY ("catalogId") REFERENCES "PracticeCatalog"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
