-- V12J.28B: Add immutable custom-amount snapshot to the canonical checkout attempt.
-- Existing fixed-price attempts remain valid. No billing activation or grants.
ALTER TABLE "ZoeBuildAiCreditCheckoutAttempt"
  ADD COLUMN "amountUsdMinor" INTEGER,
  ADD COLUMN "creditUnits" BIGINT,
  ADD COLUMN "pricingVersion" VARCHAR(100);

ALTER TABLE "ZoeBuildAiCreditCheckoutAttempt"
  ADD CONSTRAINT "ZoeBuildAiCreditCheckoutAttempt_custom_snapshot_check"
  CHECK (
    ("amountUsdMinor" IS NULL AND "creditUnits" IS NULL AND "pricingVersion" IS NULL)
    OR (
      "amountUsdMinor" BETWEEN 500 AND 50000
      AND "creditUnits" = "amountUsdMinor"::BIGINT * 1000
      AND "pricingVersion" = 'zoebuild-v12j28a-custom-topup-proposal-v1'
    )
  );

CREATE FUNCTION "zoebuild_ai_checkout_snapshot_immutable"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."amountUsdMinor", NEW."creditUnits", NEW."pricingVersion")
     IS DISTINCT FROM
     ROW(OLD."amountUsdMinor", OLD."creditUnits", OLD."pricingVersion") THEN
    RAISE EXCEPTION 'AI_CREDIT_CHECKOUT_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "zoebuild_ai_checkout_snapshot_immutable_trigger"
  BEFORE UPDATE ON "ZoeBuildAiCreditCheckoutAttempt"
  FOR EACH ROW EXECUTE FUNCTION "zoebuild_ai_checkout_snapshot_immutable"();
