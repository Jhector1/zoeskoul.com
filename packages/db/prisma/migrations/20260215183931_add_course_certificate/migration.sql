-- CreateTable
CREATE TABLE "CourseCertificate" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "subjectSlug" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "meta" JSONB,

    CONSTRAINT "CourseCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseCertificate_actorKey_idx" ON "CourseCertificate"("actorKey");

-- CreateIndex
CREATE INDEX "CourseCertificate_subjectSlug_locale_idx" ON "CourseCertificate"("subjectSlug", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCertificate_actorKey_subjectSlug_locale_key" ON "CourseCertificate"("actorKey", "subjectSlug", "locale");
