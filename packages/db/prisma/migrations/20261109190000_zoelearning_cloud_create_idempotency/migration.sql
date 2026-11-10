-- Nullable for legacy projects. Unique per authenticated owner and create intent.
-- PostgreSQL allows multiple NULL values in the composite unique index.
ALTER TABLE "CodeProject"
  ADD COLUMN "creationRequestKey" VARCHAR(96),
  ADD COLUMN "creationRequestHash" VARCHAR(64);
CREATE UNIQUE INDEX "CodeProject_ownerId_creationRequestKey_key"
  ON "CodeProject"("ownerId", "creationRequestKey");
