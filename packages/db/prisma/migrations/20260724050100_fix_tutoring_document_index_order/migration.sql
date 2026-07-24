-- The earlier 20260724045456_production_hardeing migration was generated
-- before the hardening migration in lexical order, so a clean database tries
-- to rename this index before it exists. Keep the corrective rename after
-- 20260724050000_tutoring_production_hardening and make it idempotent for
-- databases where the rename was already applied during local development.
DO $$
BEGIN
  IF to_regclass('"TutoringSessionDocument_sessionId_ownerKey_moduleKey_cardKey_to"') IS NOT NULL
     AND to_regclass('"TutoringSessionDocument_sessionId_ownerKey_moduleKey_cardKe_key"') IS NULL THEN
    ALTER INDEX "TutoringSessionDocument_sessionId_ownerKey_moduleKey_cardKey_to"
      RENAME TO "TutoringSessionDocument_sessionId_ownerKey_moduleKey_cardKe_key";
  END IF;
END
$$;
