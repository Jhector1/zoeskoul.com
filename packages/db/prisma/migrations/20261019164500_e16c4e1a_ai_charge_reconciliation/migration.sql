-- E16C4E1A: durable, non-financial review journal for held AI reservations.
-- No automatic settlement or release is authorized by these tables.
CREATE TABLE "AiCreditReconciliationCase" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCreditReconciliationCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiCreditReconciliationCase_reservationId_key" ON "AiCreditReconciliationCase"("reservationId");
CREATE INDEX "AiCreditReconciliationCase_userId_openedAt_idx" ON "AiCreditReconciliationCase"("userId", "openedAt");
ALTER TABLE "AiCreditReconciliationCase" ADD CONSTRAINT "AiCreditReconciliationCase_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "AiCreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AiCreditReconciliationEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "eventKey" VARCHAR(256) NOT NULL,
    "reasonCode" VARCHAR(64) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCreditReconciliationEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiCreditReconciliationEvent_eventKey_key" ON "AiCreditReconciliationEvent"("eventKey");
CREATE INDEX "AiCreditReconciliationEvent_caseId_recordedAt_idx" ON "AiCreditReconciliationEvent"("caseId", "recordedAt");
ALTER TABLE "AiCreditReconciliationEvent" ADD CONSTRAINT "AiCreditReconciliationEvent_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "AiCreditReconciliationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
