CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "fontSizePx" INTEGER NOT NULL DEFAULT 16,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserPreferences_locale_check"
        CHECK ("locale" IN ('en', 'fr', 'ht')),
    CONSTRAINT "UserPreferences_theme_check"
        CHECK ("theme" IN ('light', 'dark', 'system')),
    CONSTRAINT "UserPreferences_font_size_check"
        CHECK ("fontSizePx" IN (14, 16, 20, 24))
);

CREATE UNIQUE INDEX "UserPreferences_userId_key"
    ON "UserPreferences"("userId");

ALTER TABLE "UserPreferences"
    ADD CONSTRAINT "UserPreferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
