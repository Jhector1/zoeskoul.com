-- E16C4E1B1: immutable operator evidence metadata, NOT financial authorization.
-- The evidence digest is for integrity only; no external provider verification occurs here.
CREATE TABLE "AiCreditReconciliationEvidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evidenceKey" VARCHAR(160) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "sourceType" VARCHAR(48) NOT NULL,
    "referenceId" VARCHAR(160) NOT NULL,
    "statementSha256" VARCHAR(64) NOT NULL,
    "outcome" VARCHAR(24) NOT NULL,
    "reportedCostUsdNano" VARCHAR(80),
    "reviewerId" VARCHAR(160) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCreditReconciliationEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiCreditReconciliationEvidence_evidenceKey_key"
    ON "AiCreditReconciliationEvidence"("evidenceKey");
CREATE INDEX "AiCreditReconciliationEvidence_caseId_recordedAt_idx"
    ON "AiCreditReconciliationEvidence"("caseId", "recordedAt");
CREATE INDEX "AiCreditReconciliationEvidence_provider_referenceId_idx"
    ON "AiCreditReconciliationEvidence"("provider", "referenceId");
ALTER TABLE "AiCreditReconciliationEvidence"
    ADD CONSTRAINT "AiCreditReconciliationEvidence_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "AiCreditReconciliationCase"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
