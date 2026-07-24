CREATE TABLE "TutoringSessionInvite" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TutoringSessionInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TutoringSessionInvite_tokenHash_key"
ON "TutoringSessionInvite"("tokenHash");

CREATE UNIQUE INDEX "TutoringSessionInvite_sessionId_email_key"
ON "TutoringSessionInvite"("sessionId", "email");

CREATE INDEX "TutoringSessionInvite_sessionId_revokedAt_expiresAt_idx"
ON "TutoringSessionInvite"("sessionId", "revokedAt", "expiresAt");

CREATE INDEX "TutoringSessionInvite_email_revokedAt_idx"
ON "TutoringSessionInvite"("email", "revokedAt");

CREATE INDEX "TutoringSessionInvite_acceptedByUserId_idx"
ON "TutoringSessionInvite"("acceptedByUserId");

ALTER TABLE "TutoringSessionInvite"
ADD CONSTRAINT "TutoringSessionInvite_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "TutoringSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TutoringSessionInvite"
ADD CONSTRAINT "TutoringSessionInvite_acceptedByUserId_fkey"
FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
