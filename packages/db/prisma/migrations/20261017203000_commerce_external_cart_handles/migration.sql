-- Provider-neutral external cart sessions keep the browser-facing token opaque.
-- Remote provider cart identifiers may contain secrets, so only an encrypted
-- BuildSecretStore reference is persisted on CommerceCart.

ALTER TABLE "CommerceCart"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerEnvironment" "CommerceProviderEnvironment",
  ADD COLUMN "providerCartSecretRef" TEXT;

CREATE INDEX "CommerceCart_storeId_provider_providerEnvironment_updatedAt_idx"
  ON "CommerceCart"("storeId", "provider", "providerEnvironment", "updatedAt");
