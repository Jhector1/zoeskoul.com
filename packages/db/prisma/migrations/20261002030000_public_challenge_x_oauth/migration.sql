CREATE TABLE "PublicChallengeSocialCredential" (
    "provider" VARCHAR(24) NOT NULL,
    "accessTokenCiphertext" TEXT,
    "refreshTokenCiphertext" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublicChallengeSocialCredential_pkey" PRIMARY KEY ("provider"),
    CONSTRAINT "PublicChallengeSocialCredential_provider_check"
      CHECK ("provider" IN ('x'))
);
