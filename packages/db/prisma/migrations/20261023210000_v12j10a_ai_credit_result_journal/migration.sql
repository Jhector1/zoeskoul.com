-- V12J.10A canonical encrypted result journal; single schema across environments.
-- Stage only: apply via reviewed Prisma migration workflow after explicit DB approval.
CREATE TABLE "AiCreditResultJournal" (
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "reservationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestSha256" VARCHAR(64) NOT NULL,
  "providerResponseId" VARCHAR(160) NOT NULL,
  "clientRequestId" VARCHAR(160) NOT NULL,
  "pricingVersionId" VARCHAR(160) NOT NULL,
  "keyId" VARCHAR(32) NOT NULL,
  "nonce" VARCHAR(24) NOT NULL,
  "tag" VARCHAR(32) NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "contentSha256" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCreditResultJournal_pkey" PRIMARY KEY ("idempotencyKey")
);
CREATE UNIQUE INDEX "AiCreditResultJournal_reservationId_key" ON "AiCreditResultJournal"("reservationId");
CREATE INDEX "AiCreditResultJournal_userId_createdAt_idx" ON "AiCreditResultJournal"("userId","createdAt");
CREATE INDEX "AiCreditResultJournal_expiresAt_idx" ON "AiCreditResultJournal"("expiresAt");
ALTER TABLE "AiCreditResultJournal" ADD CONSTRAINT "AiCreditResultJournal_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "AiCreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
