ALTER TABLE "TutoringTeacherPoolMember"
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE "TutoringTeacherAvailabilityWindow" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TutoringTeacherAvailabilityWindow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TutoringTeacherAvailabilityWindow_valid_window"
    CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "TutoringTeacherAvailabilityWindow_teacherId_startsAt_endsAt_idx"
  ON "TutoringTeacherAvailabilityWindow"("teacherId", "startsAt", "endsAt");

CREATE INDEX "TutoringTeacherAvailabilityWindow_startsAt_endsAt_idx"
  ON "TutoringTeacherAvailabilityWindow"("startsAt", "endsAt");

ALTER TABLE "TutoringTeacherAvailabilityWindow"
  ADD CONSTRAINT "TutoringTeacherAvailabilityWindow_teacherId_fkey"
  FOREIGN KEY ("teacherId")
  REFERENCES "TutoringTeacherPoolMember"("userId")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
