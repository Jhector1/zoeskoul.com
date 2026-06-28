-- AlterTable
ALTER TABLE "PracticeSubject" ADD COLUMN     "showInOnboarding" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UserOnboardingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "preferredLanguage" TEXT,
    "level" TEXT,
    "studyTime" TEXT,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOnboardingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOnboardingInterest" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOnboardingInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "discoverySource" TEXT,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserOnboardingProfile_userId_key" ON "UserOnboardingProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOnboardingProfile_guestId_key" ON "UserOnboardingProfile"("guestId");

-- CreateIndex
CREATE INDEX "UserOnboardingProfile_guestId_idx" ON "UserOnboardingProfile"("guestId");

-- CreateIndex
CREATE INDEX "UserOnboardingProfile_userId_idx" ON "UserOnboardingProfile"("userId");

-- CreateIndex
CREATE INDEX "UserOnboardingProfile_expiresAt_idx" ON "UserOnboardingProfile"("expiresAt");

-- CreateIndex
CREATE INDEX "UserOnboardingInterest_subjectId_idx" ON "UserOnboardingInterest"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOnboardingInterest_profileId_subjectId_key" ON "UserOnboardingInterest"("profileId", "subjectId");

-- CreateIndex
CREATE INDEX "OnboardingAnalyticsEvent_profileId_idx" ON "OnboardingAnalyticsEvent"("profileId");

-- CreateIndex
CREATE INDEX "OnboardingAnalyticsEvent_eventType_idx" ON "OnboardingAnalyticsEvent"("eventType");

-- CreateIndex
CREATE INDEX "OnboardingAnalyticsEvent_discoverySource_idx" ON "OnboardingAnalyticsEvent"("discoverySource");

-- CreateIndex
CREATE INDEX "PracticeSubject_showInOnboarding_status_order_idx" ON "PracticeSubject"("showInOnboarding", "status", "order");

-- AddForeignKey
ALTER TABLE "UserOnboardingProfile" ADD CONSTRAINT "UserOnboardingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOnboardingInterest" ADD CONSTRAINT "UserOnboardingInterest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserOnboardingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOnboardingInterest" ADD CONSTRAINT "UserOnboardingInterest_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "PracticeSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAnalyticsEvent" ADD CONSTRAINT "OnboardingAnalyticsEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserOnboardingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
