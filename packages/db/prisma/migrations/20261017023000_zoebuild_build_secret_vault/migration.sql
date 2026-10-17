-- ZoeBuild generic control-plane secret vault.
--
-- Secret plaintext is never stored in the Zoéskoul database.
-- Values are encrypted in the server tier with AES-256-GCM before INSERT.
-- The encryption key is supplied out-of-band through deployment secrets.
-- BuildProject ownership prevents cross-project secretRef reuse.

CREATE TABLE "BuildSecret" (
    "id" TEXT NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "algorithm" VARCHAR(32) NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildSecret_pkey"
      PRIMARY KEY ("id")
);

CREATE INDEX
  "BuildSecret_buildProjectId_createdAt_idx"
ON "BuildSecret"(
    "buildProjectId",
    "createdAt"
);

CREATE INDEX
  "BuildSecret_keyVersion_createdAt_idx"
ON "BuildSecret"(
    "keyVersion",
    "createdAt"
);

ALTER TABLE "BuildSecret"
  ADD CONSTRAINT "BuildSecret_buildProjectId_fkey"
  FOREIGN KEY ("buildProjectId")
  REFERENCES "BuildProject"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
