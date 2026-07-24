-- Harden tutoring storage and make learner progress participant-scoped.
ALTER TABLE "TutoringSession"
  ADD COLUMN "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "snapshotBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "moduleKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "boardKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "TutoringSession"
SET
  "snapshotVersion" = CASE
    WHEN COALESCE("snapshot"->>'version', '') ~ '^[0-9]+$'
      THEN ("snapshot"->>'version')::INTEGER
    ELSE 1
  END,
  "snapshotBytes" = octet_length("snapshot"::TEXT),
  "moduleKeys" = COALESCE(
    ARRAY(
      SELECT module_entry->>'sessionModuleSlug'
      FROM jsonb_array_elements(COALESCE("snapshot"->'modules', '[]'::jsonb)) AS module_entry
      WHERE module_entry ? 'sessionModuleSlug'
    ),
    ARRAY[]::TEXT[]
  ),
  "boardKeys" = COALESCE(
    ARRAY(
      SELECT DISTINCT
        (module_entry->>'sessionModuleSlug') || chr(31) ||
        'card:' || (topic_entry->>'id') || ':' || board_scope.card_id
      FROM jsonb_array_elements(COALESCE("snapshot"->'modules', '[]'::jsonb)) AS module_entry
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(module_entry->'module'->'topics', '[]'::jsonb)
      ) AS topic_entry
      CROSS JOIN LATERAL (
        SELECT 'general' AS card_id
        UNION ALL
        SELECT card_entry->>'id'
        FROM jsonb_array_elements(COALESCE(topic_entry->'cards', '[]'::jsonb)) AS card_entry
        WHERE card_entry ? 'id'
      ) AS board_scope
      WHERE
        module_entry ? 'sessionModuleSlug' AND
        topic_entry ? 'id'
    ),
    ARRAY[]::TEXT[]
  );

UPDATE "TutoringSession"
SET "allowStudentEditing" = false;

ALTER TABLE "TutoringSession"
  ALTER COLUMN "allowStudentEditing" SET DEFAULT false;

ALTER TABLE "TutoringSession"
  DROP CONSTRAINT "TutoringSession_subjectId_fkey";

ALTER TABLE "TutoringSession"
  ADD CONSTRAINT "TutoringSession_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Shared progress from the prototype cannot be assigned safely to one learner.
-- Remove it rather than exposing or copying one participant's answers to others.
DELETE FROM "TutoringSessionDocument"
WHERE "toolId" = 'progress';

ALTER TABLE "TutoringSessionDocument"
  ADD COLUMN "ownerKey" TEXT NOT NULL DEFAULT 'shared',
  ADD COLUMN "byteSize" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedByUserId" TEXT;

UPDATE "TutoringSessionDocument"
SET "byteSize" = octet_length("body");

DROP INDEX "TutoringSessionDocument_sessionId_moduleKey_cardKey_toolId_key";
DROP INDEX "TutoringSessionDocument_sessionId_updatedAt_idx";

CREATE UNIQUE INDEX "TutoringSessionDocument_sessionId_ownerKey_moduleKey_cardKey_toolId_key"
ON "TutoringSessionDocument"("sessionId", "ownerKey", "moduleKey", "cardKey", "toolId");

CREATE INDEX "TutoringSessionDocument_sessionId_ownerKey_toolId_updatedAt_idx"
ON "TutoringSessionDocument"("sessionId", "ownerKey", "toolId", "updatedAt");

CREATE INDEX "TutoringSessionDocument_sessionId_toolId_updatedAt_idx"
ON "TutoringSessionDocument"("sessionId", "toolId", "updatedAt");

ALTER TABLE "TutoringSessionDocument"
  ADD CONSTRAINT "TutoringSessionDocument_key_lengths_check"
  CHECK (
    char_length("ownerKey") BETWEEN 1 AND 160 AND
    char_length("moduleKey") BETWEEN 1 AND 160 AND
    char_length("cardKey") BETWEEN 1 AND 200 AND
    char_length("toolId") BETWEEN 1 AND 64
  ) NOT VALID;

ALTER TABLE "TutoringSessionDocument"
  ADD CONSTRAINT "TutoringSessionDocument_size_check"
  CHECK (
    "byteSize" = octet_length("body") AND
    "byteSize" >= 0 AND
    (
      ("toolId" = 'progress' AND "byteSize" <= 12582912) OR
      ("toolId" <> 'progress' AND "byteSize" <= 524288)
    )
  ) NOT VALID;

ALTER TABLE "TutoringSession"
  ADD CONSTRAINT "TutoringSession_snapshot_limits_check"
  CHECK (
    "snapshotVersion" >= 1 AND
    "snapshotBytes" BETWEEN 0 AND 25165824 AND
    cardinality("moduleKeys") BETWEEN 1 AND 64 AND
    cardinality("boardKeys") BETWEEN 1 AND 10000
  ) NOT VALID;
