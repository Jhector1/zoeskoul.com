-- V12J.8C CANONICAL MIGRATION PROPOSAL -- NOT APPLIED / NOT AUTO-DEPLOYED
-- Once explicitly approved, promote this exact SQL as ONE numbered Prisma migration
-- after verifying no newer migration already owns the AiCreditLot quantities check.
-- Schema rule must be identical in development and production.
-- PostgreSQL holds all constraint changes in one atomic transaction.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '180s';
DO $v12j8c_preflight$
DECLARE
  actual_quantity text;
  actual_reversal text;
  bad_count bigint;
BEGIN
  IF to_regclass('public."AiCreditLot"') IS NULL THEN
    RAISE EXCEPTION 'V12J8C_REFUSED_MISSING_AICREDITLOT';
  END IF;
  SELECT pg_get_constraintdef(c.oid, true)
    INTO actual_quantity
    FROM pg_constraint c
    WHERE c.conrelid = 'public."AiCreditLot"'::regclass
      AND c.conname = 'AiCreditLot_quantities_check'
      AND c.contype = 'c' AND c.convalidated;
  IF actual_quantity IS DISTINCT FROM 'CHECK ("grantedUnits" > 0 AND "availableUnits" >= 0 AND "reservedUnits" >= 0 AND "consumedUnits" >= 0 AND "expiredUnits" >= 0 AND "grantedUnits" = ("availableUnits" + "reservedUnits" + "consumedUnits" + "expiredUnits"))' THEN
    RAISE EXCEPTION 'V12J8C_REFUSED_UNEXPECTED_QUANTITY_CONSTRAINT';
  END IF;
  SELECT pg_get_constraintdef(c.oid, true)
    INTO actual_reversal
    FROM pg_constraint c
    WHERE c.conrelid = 'public."AiCreditLot"'::regclass
      AND c.conname = 'AiCreditLot_refund_reversal_nonnegative_chk'
      AND c.contype = 'c' AND c.convalidated;
  IF actual_reversal IS DISTINCT FROM 'CHECK ("reversedUnits" >= 0 AND "reversalTargetUnits" >= 0 AND "reversalShortfallUnits" >= 0 AND "reversalTargetUnits" = ("reversedUnits" + "reversalShortfallUnits") AND "reversalTargetUnits" <= "grantedUnits")' THEN
    RAISE EXCEPTION 'V12J8C_REFUSED_UNEXPECTED_REVERSAL_CONSTRAINT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public."AiCreditLot"'::regclass
      AND c.conname = 'AiCreditLot_quantities_legacy_check'
  ) THEN
    RAISE EXCEPTION 'V12J8C_REFUSED_LEGACY_CONSTRAINT_ALREADY_PRESENT';
  END IF;
  SELECT count(*) INTO bad_count FROM public."AiCreditLot"
    WHERE NOT (
      "grantedUnits" > 0 AND "availableUnits" >= 0 AND "reservedUnits" >= 0
      AND "consumedUnits" >= 0 AND "expiredUnits" >= 0 AND "reversedUnits" >= 0
      AND "grantedUnits" = ("availableUnits" + "reservedUnits" +
        "consumedUnits" + "expiredUnits" + "reversedUnits")
    );
  IF bad_count <> 0 THEN
    RAISE EXCEPTION 'V12J8C_REFUSED_EXISTING_LOTS_VIOLATE_NEW_CONSERVATION';
  END IF;
END;
$v12j8c_preflight$;

-- Preserve the legacy guard until the replacement is installed and validated.
-- The stable canonical constraint name is retained after migration.
ALTER TABLE public."AiCreditLot"
  RENAME CONSTRAINT "AiCreditLot_quantities_check"
  TO "AiCreditLot_quantities_legacy_check";
ALTER TABLE public."AiCreditLot"
  ADD CONSTRAINT "AiCreditLot_quantities_check"
  CHECK ("grantedUnits" > 0 AND "availableUnits" >= 0 AND "reservedUnits" >= 0 AND "consumedUnits" >= 0 AND "expiredUnits" >= 0 AND "reversedUnits" >= 0 AND "grantedUnits" = ("availableUnits" + "reservedUnits" + "consumedUnits" + "expiredUnits" + "reversedUnits")) NOT VALID;
ALTER TABLE public."AiCreditLot"
  VALIDATE CONSTRAINT "AiCreditLot_quantities_check";
ALTER TABLE public."AiCreditLot"
  DROP CONSTRAINT "AiCreditLot_quantities_legacy_check";
-- The separate refund target/shortfall check is intentionally untouched.
COMMIT;
