-- E16C3 immutable AI credit ledger; no tutoring credit or subscription alterations.
CREATE TYPE "AiCreditLotKind" AS ENUM ('subscription', 'purchased');
CREATE TYPE "AiCreditReservationStatus" AS ENUM ('reserved', 'settled', 'released');
CREATE TYPE "AiCreditLedgerKind" AS ENUM ('grant', 'reserve', 'consume', 'release', 'expire');

CREATE TABLE "AiCreditWallet" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AiCreditLot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sourceKey" VARCHAR(160) NOT NULL,
  "kind" "AiCreditLotKind" NOT NULL,
  "grantedUnits" BIGINT NOT NULL,
  "availableUnits" BIGINT NOT NULL,
  "reservedUnits" BIGINT NOT NULL DEFAULT 0,
  "consumedUnits" BIGINT NOT NULL DEFAULT 0,
  "expiredUnits" BIGINT NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCreditLot_quantities_check" CHECK (
    "grantedUnits" > 0 AND "availableUnits" >= 0 AND "reservedUnits" >= 0 AND
    "consumedUnits" >= 0 AND "expiredUnits" >= 0 AND
    "grantedUnits" = "availableUnits" + "reservedUnits" + "consumedUnits" + "expiredUnits"
  ),
  CONSTRAINT "AiCreditLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AiCreditWallet"("userId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiCreditLot_sourceKey_key" ON "AiCreditLot"("sourceKey");
CREATE INDEX "AiCreditLot_userId_kind_expiresAt_createdAt_idx" ON "AiCreditLot"("userId", "kind", "expiresAt", "createdAt");

CREATE TABLE "AiCreditReservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "status" "AiCreditReservationStatus" NOT NULL DEFAULT 'reserved',
  "maximumUnits" BIGINT NOT NULL,
  "settledUnits" BIGINT NOT NULL DEFAULT 0,
  "pricingVersionId" VARCHAR(160) NOT NULL,
  "conversionVersionId" VARCHAR(160) NOT NULL,
  "creditUnitsPerCredit" BIGINT NOT NULL,
  "creditValueUsdNano" BIGINT NOT NULL,
  "markupNumerator" BIGINT NOT NULL,
  "markupDenominator" BIGINT NOT NULL,
  "actualCostUsdNano" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "AiCreditReservation_quantities_check" CHECK (
    "maximumUnits" > 0 AND "settledUnits" >= 0 AND "settledUnits" <= "maximumUnits" AND
    "creditUnitsPerCredit" > 0 AND "creditValueUsdNano" > 0 AND
    "markupNumerator" > 0 AND "markupDenominator" > 0
  ),
  CONSTRAINT "AiCreditReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AiCreditWallet"("userId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiCreditReservation_idempotencyKey_key" ON "AiCreditReservation"("idempotencyKey");
CREATE INDEX "AiCreditReservation_userId_status_createdAt_idx" ON "AiCreditReservation"("userId", "status", "createdAt");

CREATE TABLE "AiCreditReservationAllocation" (
  "reservationId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "reservedUnits" BIGINT NOT NULL,
  "consumedUnits" BIGINT NOT NULL DEFAULT 0,
  "releasedUnits" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "AiCreditReservationAllocation_pkey" PRIMARY KEY ("reservationId", "lotId"),
  CONSTRAINT "AiCreditAllocation_quantities_check" CHECK (
    "reservedUnits" > 0 AND "consumedUnits" >= 0 AND "releasedUnits" >= 0 AND
    "reservedUnits" >= "consumedUnits" + "releasedUnits"
  ),
  CONSTRAINT "AiCreditReservationAllocation_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "AiCreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiCreditReservationAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "AiCreditLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AiCreditLedgerEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "reservationId" TEXT,
  "eventKey" VARCHAR(256) NOT NULL,
  "kind" "AiCreditLedgerKind" NOT NULL,
  "availableDelta" BIGINT NOT NULL DEFAULT 0,
  "reservedDelta" BIGINT NOT NULL DEFAULT 0,
  "consumedDelta" BIGINT NOT NULL DEFAULT 0,
  "expiredDelta" BIGINT NOT NULL DEFAULT 0,
  "costUsdNano" VARCHAR(80),
  "pricingVersionId" VARCHAR(160),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCreditLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AiCreditWallet"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiCreditLedgerEntry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "AiCreditLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiCreditLedgerEntry_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "AiCreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiCreditLedgerEntry_eventKey_key" ON "AiCreditLedgerEntry"("eventKey");
CREATE INDEX "AiCreditLedgerEntry_userId_createdAt_idx" ON "AiCreditLedgerEntry"("userId", "createdAt");
CREATE INDEX "AiCreditLedgerEntry_lotId_createdAt_idx" ON "AiCreditLedgerEntry"("lotId", "createdAt");
CREATE INDEX "AiCreditLedgerEntry_reservationId_idx" ON "AiCreditLedgerEntry"("reservationId");

-- Database-level immutable accounting record: corrections are new entries.
CREATE FUNCTION "ai_credit_ledger_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AI credit ledger entries cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AiCreditLedgerEntry_immutable"
  BEFORE UPDATE OR DELETE ON "AiCreditLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "ai_credit_ledger_immutable"();
