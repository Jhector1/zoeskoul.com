-- Bind existing project-global chat to the currently selected saved version.
-- Review the database target and back up before applying in any environment.
ALTER TABLE "ZoeBuildChatMessage" ADD COLUMN "savedVersion" INTEGER;

UPDATE "ZoeBuildChatMessage" AS msg
SET "savedVersion" = CASE
  WHEN (cp."meta"->>'activeHistoryVersion') ~ '^[1-9][0-9]{0,8}$'
   AND (cp."meta"->>'activeHistorySourceVersion') ~ '^[1-9][0-9]{0,8}$'
   AND (cp."meta"->>'activeHistorySourceVersion')::integer = cp."currentVersion"
   AND (cp."meta"->>'activeHistoryVersion')::integer <= cp."currentVersion"
  THEN (cp."meta"->>'activeHistoryVersion')::integer
  ELSE cp."currentVersion"
END
FROM "BuildProject" AS bp
JOIN "CodeProject" AS cp ON cp."id" = bp."codeProjectId"
WHERE msg."buildProjectId" = bp."id";

ALTER TABLE "ZoeBuildChatMessage" ALTER COLUMN "savedVersion" SET NOT NULL;
DROP INDEX "ZoeBuildChatMessage_buildProjectId_createdAt_id_idx";
CREATE INDEX "ZoeBuildChatMessage_buildProjectId_savedVersion_createdAt_id_idx"
 ON "ZoeBuildChatMessage"("buildProjectId", "savedVersion", "createdAt", "id");
