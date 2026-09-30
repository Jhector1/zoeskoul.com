-- Add learner-controlled automatic language-audio playback.
ALTER TABLE "UserPreferences"
ADD COLUMN "languageAudioAutoPlay" BOOLEAN NOT NULL DEFAULT false;
