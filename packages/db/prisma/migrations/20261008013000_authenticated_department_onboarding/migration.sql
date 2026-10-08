-- Authenticated onboarding foundation: preserve legacy guest rows for one-time
-- claims, but new onboarding state is attached to a user and can distinguish
-- learner/teacher context plus department membership.
CREATE TYPE "OnboardingUseMode" AS ENUM ('learner', 'teacher', 'both');
CREATE TYPE "OnboardingAffiliation" AS ENUM ('independent', 'institution');
CREATE TYPE "OnboardingDepartmentContext" AS ENUM ('learner', 'teacher');

ALTER TABLE "UserOnboardingProfile"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "useMode" "OnboardingUseMode",
ADD COLUMN "learnerAffiliation" "OnboardingAffiliation",
ADD COLUMN "teacherAffiliation" "OnboardingAffiliation";

CREATE TABLE "UserOnboardingDepartment" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "departmentKey" TEXT NOT NULL,
  "context" "OnboardingDepartmentContext" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserOnboardingDepartment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserOnboardingDepartment_profileId_departmentKey_context_key"
ON "UserOnboardingDepartment"("profileId", "departmentKey", "context");

CREATE INDEX "UserOnboardingDepartment_profileId_context_idx"
ON "UserOnboardingDepartment"("profileId", "context");

CREATE INDEX "UserOnboardingDepartment_departmentKey_idx"
ON "UserOnboardingDepartment"("departmentKey");

ALTER TABLE "UserOnboardingDepartment"
ADD CONSTRAINT "UserOnboardingDepartment_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "UserOnboardingProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
