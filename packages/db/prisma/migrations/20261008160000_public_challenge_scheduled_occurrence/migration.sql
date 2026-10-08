-- Daily automation is keyed by the user-configured scheduled occurrence,
-- not by elapsed time and not by calendar date alone.
ALTER TABLE "PublicChallengeDailyDispatch"
ADD COLUMN "occurrenceKey" VARCHAR(220);

-- Existing daily rows predate occurrence identity. Preserve them as history
-- without allowing them to suppress a newly configured same-day occurrence.
UPDATE "PublicChallengeDailyDispatch"
SET "occurrenceKey" = 'legacy:' || "dispatchDate" || ':' || "id";

ALTER TABLE "PublicChallengeDailyDispatch"
ALTER COLUMN "occurrenceKey" SET NOT NULL;

DROP INDEX "PublicChallengeDailyDispatch_dispatchDate_key";

CREATE UNIQUE INDEX "PublicChallengeDailyDispatch_occurrenceKey_key"
ON "PublicChallengeDailyDispatch"("occurrenceKey");
