-- Shopify OAuth single-use nonce and exclusive refresh leases.
-- Plaintext OAuth state, browser bindings, access tokens and refresh tokens
-- are deliberately absent from this migration.
CREATE TABLE "CommerceProviderOAuthState" (
    "stateHash" VARCHAR(64) NOT NULL,
    "browserBindingHash" VARCHAR(64) NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" "CommerceProviderEnvironment" NOT NULL,
    "shopHostname" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommerceProviderOAuthState_pkey" PRIMARY KEY ("stateHash")
);
CREATE INDEX "CommerceProviderOAuthState_expiresAt_idx"
  ON "CommerceProviderOAuthState"("expiresAt");
CREATE INDEX "CommerceOAuthState_scope_idx"
  ON "CommerceProviderOAuthState"("buildProjectId", "storeId", "provider", "environment");

CREATE TABLE "CommerceProviderOAuthRefreshLease" (
    "connectionId" TEXT NOT NULL,
    "owner" VARCHAR(48) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommerceProviderOAuthRefreshLease_pkey" PRIMARY KEY ("connectionId")
);
CREATE INDEX "CommerceProviderOAuthRefreshLease_expiresAt_idx"
  ON "CommerceProviderOAuthRefreshLease"("expiresAt");
