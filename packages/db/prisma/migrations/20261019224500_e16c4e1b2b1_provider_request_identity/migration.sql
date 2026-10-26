-- E16C4E1B2B1: provider dispatch identity only; no financial resolution.
CREATE TABLE "AiCreditProviderRequest" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(160) NOT NULL,
    "clientRequestId" VARCHAR(160) NOT NULL,
    "requestSha256" VARCHAR(64) NOT NULL,
    "providerResponseId" VARCHAR(160),
    "providerHttpRequestId" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observedAt" TIMESTAMP(3),
    CONSTRAINT "AiCreditProviderRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiCreditProviderRequest_reservationId_key" ON "AiCreditProviderRequest"("reservationId");
CREATE UNIQUE INDEX "AiCreditProviderRequest_clientRequestId_key" ON "AiCreditProviderRequest"("clientRequestId");
CREATE INDEX "AiCreditProviderRequest_provider_providerResponseId_idx" ON "AiCreditProviderRequest"("provider", "providerResponseId");
CREATE INDEX "AiCreditProviderRequest_provider_providerHttpRequestId_idx" ON "AiCreditProviderRequest"("provider", "providerHttpRequestId");
ALTER TABLE "AiCreditProviderRequest" ADD CONSTRAINT "AiCreditProviderRequest_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "AiCreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
