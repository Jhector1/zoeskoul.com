-- ZoeBuild commerce-provider foundation.
--
-- One source of truth per commerce capability.
-- Provider credentials are environment-scoped and server-side only.
-- Preview resolves to test/sandbox; published resolves to live/production.
--
-- No provider SDK or vendor-specific schema is introduced here.

CREATE TYPE "CommerceProviderEnvironment" AS ENUM (
  'test',
  'live'
);

CREATE TYPE "CommerceProviderConnectionStatus" AS ENUM (
  'disconnected',
  'active',
  'error'
);

CREATE TYPE "CommerceProviderCapability" AS ENUM (
  'catalog',
  'inventory',
  'cart',
  'orders',
  'checkout',
  'payments'
);

CREATE TABLE "CommerceProviderConnection" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "environment" "CommerceProviderEnvironment" NOT NULL,
  "status" "CommerceProviderConnectionStatus" NOT NULL DEFAULT 'disconnected',
  "externalAccountRef" TEXT,
  "credentialsSecretRef" TEXT,
  "webhookSecretRef" TEXT,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommerceProviderConnection_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE "CommerceProviderRoute" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "environment" "CommerceProviderEnvironment" NOT NULL,
  "capability" "CommerceProviderCapability" NOT NULL,
  "provider" TEXT NOT NULL,
  "connectionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommerceProviderRoute_pkey"
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX
  "CommerceProviderConnection_storeId_provider_environment_key"
  ON "CommerceProviderConnection"(
    "storeId",
    "provider",
    "environment"
  );

CREATE INDEX
  "CommerceProviderConnection_storeId_environment_status_idx"
  ON "CommerceProviderConnection"(
    "storeId",
    "environment",
    "status"
  );

CREATE INDEX
  "CommerceProviderConnection_provider_environment_externalAccountRef_idx"
  ON "CommerceProviderConnection"(
    "provider",
    "environment",
    "externalAccountRef"
  );

CREATE UNIQUE INDEX
  "CommerceProviderRoute_storeId_environment_capability_key"
  ON "CommerceProviderRoute"(
    "storeId",
    "environment",
    "capability"
  );

CREATE INDEX
  "CommerceProviderRoute_provider_environment_capability_idx"
  ON "CommerceProviderRoute"(
    "provider",
    "environment",
    "capability"
  );

CREATE INDEX
  "CommerceProviderRoute_connectionId_idx"
  ON "CommerceProviderRoute"(
    "connectionId"
  );

ALTER TABLE "CommerceProviderConnection"
  ADD CONSTRAINT "CommerceProviderConnection_storeId_fkey"
  FOREIGN KEY ("storeId")
  REFERENCES "CommerceStore"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CommerceProviderRoute"
  ADD CONSTRAINT "CommerceProviderRoute_storeId_fkey"
  FOREIGN KEY ("storeId")
  REFERENCES "CommerceStore"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CommerceProviderRoute"
  ADD CONSTRAINT "CommerceProviderRoute_connectionId_fkey"
  FOREIGN KEY ("connectionId")
  REFERENCES "CommerceProviderConnection"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Existing CommerceStore rows were provisioned only for ZoeBuild Native.
-- Make their current ownership explicit before runtime routing switches
-- from direct native services to the provider middleware.
INSERT INTO "CommerceProviderRoute" (
  "id",
  "storeId",
  "environment",
  "capability",
  "provider",
  "connectionId",
  "createdAt",
  "updatedAt"
)
SELECT
  'native-route-' || s."id" || '-' || e.environment || '-' || c.capability,
  s."id",
  e.environment::"CommerceProviderEnvironment",
  c.capability::"CommerceProviderCapability",
  'zoebuild-native',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "CommerceStore" AS s
CROSS JOIN (
  VALUES ('test'), ('live')
) AS e(environment)
CROSS JOIN (
  VALUES
    ('catalog'),
    ('inventory'),
    ('cart'),
    ('orders'),
    ('checkout')
) AS c(capability);
