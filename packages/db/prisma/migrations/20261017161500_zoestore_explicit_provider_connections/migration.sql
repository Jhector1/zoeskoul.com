-- ZoeStore becomes a normal provider with explicit connections.
-- Existing provider routes are retained but every route is attached to the
-- exact test/live connection that owns it.

UPDATE "CommerceProviderConnection"
SET
  "provider" = 'zoestore',
  "config" = COALESCE("config", '{}'::jsonb) || '{"kind": "internal"}'::jsonb,
  "status" = 'active'
WHERE "provider" = 'zoebuild-native';

INSERT INTO "CommerceProviderConnection" (
  "id",
  "storeId",
  "provider",
  "environment",
  "status",
  "config",
  "createdAt",
  "updatedAt"
)
SELECT
  'zoestore-' || store."id" || '-' || env."environment"::text,
  store."id",
  'zoestore',
  env."environment",
  'active',
  '{"kind": "internal"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "CommerceStore" AS store
CROSS JOIN (
  VALUES
    ('test'::"CommerceProviderEnvironment"),
    ('live'::"CommerceProviderEnvironment")
) AS env("environment")
ON CONFLICT ("storeId", "provider", "environment")
DO UPDATE SET
  "status" = 'active',
  "config" =
    COALESCE(
      "CommerceProviderConnection"."config",
      '{}'::jsonb
    ) || '{"kind": "internal"}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "CommerceProviderRoute"
SET "provider" = 'zoestore'
WHERE "provider" = 'zoebuild-native';

UPDATE "CommerceProviderRoute" AS route
SET "connectionId" = connection."id"
FROM "CommerceProviderConnection" AS connection
WHERE
  route."provider" = 'zoestore'
  AND connection."storeId" = route."storeId"
  AND connection."provider" = 'zoestore'
  AND connection."environment" = route."environment";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CommerceProviderRoute"
    WHERE "connectionId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'CommerceProviderRoute contains a capability route without an explicit provider connection.';
  END IF;
END $$;

ALTER TABLE "CommerceProviderRoute"
  DROP CONSTRAINT IF EXISTS "CommerceProviderRoute_connectionId_fkey";

ALTER TABLE "CommerceProviderRoute"
  ALTER COLUMN "connectionId" SET NOT NULL;

ALTER TABLE "CommerceProviderRoute"
  ADD CONSTRAINT "CommerceProviderRoute_connectionId_fkey"
  FOREIGN KEY ("connectionId")
  REFERENCES "CommerceProviderConnection"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
