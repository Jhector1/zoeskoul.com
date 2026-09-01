CREATE TABLE "StudentCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "ctaLabel" TEXT,
  "ctaHref" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "audience" TEXT NOT NULL DEFAULT 'all',
  "displayFrequency" TEXT NOT NULL DEFAULT 'once',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "tutoringGrantMinutes" INTEGER,
  "emailSubject" TEXT,
  "emailPreviewText" TEXT,
  "brevoListId" INTEGER,
  "brevoCampaignId" INTEGER,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentCampaign_status_check"
    CHECK ("status" IN ('draft', 'published', 'archived')),
  CONSTRAINT "StudentCampaign_audience_check"
    CHECK ("audience" IN ('all', 'free', 'plus')),
  CONSTRAINT "StudentCampaign_displayFrequency_check"
    CHECK ("displayFrequency" IN ('once', 'daily', 'always')),
  CONSTRAINT "StudentCampaign_window_check"
    CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "StudentCampaign_tutoringGrantMinutes_check"
    CHECK ("tutoringGrantMinutes" IS NULL OR "tutoringGrantMinutes" > 0)
);

CREATE TABLE "StudentCampaignDelivery" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "impressionCount" INTEGER NOT NULL DEFAULT 0,
  "firstShownAt" TIMESTAMP(3),
  "lastShownAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentCampaignDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentCampaign_enabled_status_startsAt_endsAt_idx"
  ON "StudentCampaign"("enabled", "status", "startsAt", "endsAt");

CREATE INDEX "StudentCampaign_priority_startsAt_idx"
  ON "StudentCampaign"("priority", "startsAt");

CREATE UNIQUE INDEX "StudentCampaignDelivery_campaignId_userId_key"
  ON "StudentCampaignDelivery"("campaignId", "userId");

CREATE INDEX "StudentCampaignDelivery_userId_lastShownAt_idx"
  ON "StudentCampaignDelivery"("userId", "lastShownAt");

ALTER TABLE "StudentCampaignDelivery"
  ADD CONSTRAINT "StudentCampaignDelivery_campaignId_fkey"
  FOREIGN KEY ("campaignId")
  REFERENCES "StudentCampaign"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
