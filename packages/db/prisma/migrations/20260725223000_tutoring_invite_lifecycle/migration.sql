CREATE TYPE "TutoringInviteEmailStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

ALTER TABLE "TutoringSessionInvite"
  ADD COLUMN "invitedUserId" TEXT,
  ADD COLUMN "viewedAt" TIMESTAMP(3),
  ADD COLUMN "declinedAt" TIMESTAMP(3),
  ADD COLUMN "emailStatus" "TutoringInviteEmailStatus" NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN "emailLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "emailError" TEXT;

UPDATE "TutoringSessionInvite"
SET
  "invitedUserId" = "acceptedByUserId",
  "emailStatus" = CASE
    WHEN "sentAt" IS NOT NULL THEN 'SENT'::"TutoringInviteEmailStatus"
    ELSE 'NOT_SENT'::"TutoringInviteEmailStatus"
  END,
  "emailLastAttemptAt" = "sentAt"
WHERE "acceptedByUserId" IS NOT NULL OR "sentAt" IS NOT NULL;

UPDATE "TutoringSessionInvite" AS invite
SET "invitedUserId" = matched."id"
FROM "User" AS matched
WHERE invite."invitedUserId" IS NULL
  AND matched."email" IS NOT NULL
  AND lower(matched."email") = lower(invite."email");

-- Preserve existing direct participants as already accepted invitations. New
-- direct recipients use the invitation record first and become participants
-- only after accepting.
INSERT INTO "TutoringSessionInvite" (
  "id",
  "sessionId",
  "email",
  "invitedUserId",
  "tokenHash",
  "expiresAt",
  "emailStatus",
  "acceptedAt",
  "acceptedByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_' || substr(md5(random()::text || membership."sessionId" || membership."userId"), 1, 24),
  membership."sessionId",
  lower(account."email"),
  membership."userId",
  md5(random()::text || clock_timestamp()::text || membership."sessionId") ||
    md5(random()::text || membership."userId" || clock_timestamp()::text),
  CURRENT_TIMESTAMP + INTERVAL '30 days',
  'NOT_SENT'::"TutoringInviteEmailStatus",
  membership."addedAt",
  membership."userId",
  membership."addedAt",
  CURRENT_TIMESTAMP
FROM "TutoringSessionUser" AS membership
JOIN "User" AS account ON account."id" = membership."userId"
WHERE account."email" IS NOT NULL
ON CONFLICT ("sessionId", "email") DO UPDATE
SET
  "invitedUserId" = EXCLUDED."invitedUserId",
  "acceptedAt" = COALESCE("TutoringSessionInvite"."acceptedAt", EXCLUDED."acceptedAt"),
  "acceptedByUserId" = COALESCE("TutoringSessionInvite"."acceptedByUserId", EXCLUDED."acceptedByUserId"),
  "revokedAt" = NULL;

CREATE INDEX "TutoringSessionInvite_invitedUserId_revokedAt_expiresAt_idx"
ON "TutoringSessionInvite"("invitedUserId", "revokedAt", "expiresAt");

CREATE INDEX "TutoringSessionInvite_sessionId_emailStatus_idx"
ON "TutoringSessionInvite"("sessionId", "emailStatus");

ALTER TABLE "TutoringSessionInvite"
ADD CONSTRAINT "TutoringSessionInvite_invitedUserId_fkey"
FOREIGN KEY ("invitedUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
