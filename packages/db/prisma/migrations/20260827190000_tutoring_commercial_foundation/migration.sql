-- V95B1: commercial tutoring foundation.
-- Reuses the existing User(role=teacher) and TutoringSession live-workspace system.
-- Adds only provider-pool membership, one-time tutoring purchases, an immutable
-- minute ledger, learner requests, and scheduled bookings.

CREATE TYPE "TutoringCreditPurchaseStatus" AS ENUM (
  'pending',
  'paid',
  'failed',
  'canceled',
  'refunded'
);

CREATE TYPE "TutoringCreditLedgerKind" AS ENUM (
  'purchase_grant',
  'admin_grant',
  'plan_grant',
  'reservation',
  'reservation_release',
  'session_consumption',
  'refund_reversal'
);

CREATE TYPE "TutoringRequestStatus" AS ENUM (
  'requested',
  'assigned',
  'scheduled',
  'completed',
  'canceled'
);

CREATE TYPE "TutoringBookingStatus" AS ENUM (
  'scheduled',
  'completed',
  'canceled',
  'no_show'
);

CREATE TABLE "TutoringTeacherPoolMember" (
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TutoringTeacherPoolMember_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "TutoringTeacherPoolMember_priority_check" CHECK ("priority" >= 0)
);

CREATE TABLE "TutoringCreditPurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "checkoutAttemptId" TEXT NOT NULL,
  "packageMinutes" INTEGER NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "stripePriceId" TEXT,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "status" "TutoringCreditPurchaseStatus" NOT NULL DEFAULT 'pending',
  "checkoutExpiresAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TutoringCreditPurchase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TutoringCreditPurchase_package_minutes_check" CHECK ("packageMinutes" > 0),
  CONSTRAINT "TutoringCreditPurchase_amount_minor_check" CHECK ("amountMinor" >= 0)
);

CREATE TABLE "TutoringRequest" (
  "id" TEXT NOT NULL,
  "learnerId" TEXT NOT NULL,
  "requestAttemptId" TEXT NOT NULL,
  "assignedTeacherId" TEXT,
  "tutoringSessionId" TEXT,
  "status" "TutoringRequestStatus" NOT NULL DEFAULT 'requested',
  "requestedMinutes" INTEGER NOT NULL,
  "preferredStartsAt" TIMESTAMP(3),
  "sourceSubjectSlug" TEXT,
  "sourceModuleSlug" TEXT,
  "sourceExerciseKey" TEXT,
  "note" TEXT,
  "meta" JSONB,
  "assignedAt" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TutoringRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TutoringRequest_requested_minutes_check" CHECK ("requestedMinutes" > 0)
);

CREATE TABLE "TutoringBooking" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "teacherId" TEXT,
  "tutoringSessionId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "status" "TutoringBookingStatus" NOT NULL DEFAULT 'scheduled',
  "creditReservedAt" TIMESTAMP(3),
  "creditConsumedAt" TIMESTAMP(3),
  "creditReleasedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TutoringBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TutoringBooking_duration_minutes_check" CHECK ("durationMinutes" > 0)
);

CREATE TABLE "TutoringCreditLedgerEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "TutoringCreditLedgerKind" NOT NULL,
  "availableMinutesDelta" INTEGER NOT NULL,
  "reservedMinutesDelta" INTEGER NOT NULL DEFAULT 0,
  "purchaseId" TEXT,
  "requestId" TEXT,
  "bookingId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TutoringCreditLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TutoringCreditLedgerEntry_nonzero_check"
    CHECK ("availableMinutesDelta" <> 0 OR "reservedMinutesDelta" <> 0)
);

CREATE UNIQUE INDEX "TutoringCreditPurchase_checkoutAttemptId_key"
  ON "TutoringCreditPurchase"("checkoutAttemptId");

CREATE UNIQUE INDEX "TutoringCreditPurchase_stripeCheckoutSessionId_key"
  ON "TutoringCreditPurchase"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "TutoringCreditPurchase_stripePaymentIntentId_key"
  ON "TutoringCreditPurchase"("stripePaymentIntentId");
CREATE INDEX "TutoringCreditPurchase_userId_createdAt_idx"
  ON "TutoringCreditPurchase"("userId", "createdAt");
CREATE INDEX "TutoringCreditPurchase_status_createdAt_idx"
  ON "TutoringCreditPurchase"("status", "createdAt");

CREATE UNIQUE INDEX "TutoringRequest_requestAttemptId_key"
  ON "TutoringRequest"("requestAttemptId");
CREATE UNIQUE INDEX "TutoringRequest_tutoringSessionId_key"
  ON "TutoringRequest"("tutoringSessionId");
CREATE INDEX "TutoringRequest_learnerId_status_createdAt_idx"
  ON "TutoringRequest"("learnerId", "status", "createdAt");
CREATE INDEX "TutoringRequest_assignedTeacherId_status_createdAt_idx"
  ON "TutoringRequest"("assignedTeacherId", "status", "createdAt");
CREATE INDEX "TutoringRequest_status_createdAt_idx"
  ON "TutoringRequest"("status", "createdAt");

CREATE UNIQUE INDEX "TutoringBooking_tutoringSessionId_key"
  ON "TutoringBooking"("tutoringSessionId");
CREATE INDEX "TutoringBooking_requestId_status_idx"
  ON "TutoringBooking"("requestId", "status");
CREATE INDEX "TutoringBooking_teacherId_startsAt_status_idx"
  ON "TutoringBooking"("teacherId", "startsAt", "status");
CREATE INDEX "TutoringBooking_status_startsAt_idx"
  ON "TutoringBooking"("status", "startsAt");

CREATE UNIQUE INDEX "TutoringCreditLedgerEntry_idempotencyKey_key"
  ON "TutoringCreditLedgerEntry"("idempotencyKey");
CREATE INDEX "TutoringCreditLedgerEntry_userId_createdAt_idx"
  ON "TutoringCreditLedgerEntry"("userId", "createdAt");
CREATE INDEX "TutoringCreditLedgerEntry_purchaseId_idx"
  ON "TutoringCreditLedgerEntry"("purchaseId");
CREATE INDEX "TutoringCreditLedgerEntry_requestId_idx"
  ON "TutoringCreditLedgerEntry"("requestId");
CREATE INDEX "TutoringCreditLedgerEntry_bookingId_idx"
  ON "TutoringCreditLedgerEntry"("bookingId");
CREATE INDEX "TutoringCreditLedgerEntry_kind_idx"
  ON "TutoringCreditLedgerEntry"("kind");

CREATE INDEX "TutoringTeacherPoolMember_enabled_priority_idx"
  ON "TutoringTeacherPoolMember"("enabled", "priority");

ALTER TABLE "TutoringTeacherPoolMember"
  ADD CONSTRAINT "TutoringTeacherPoolMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TutoringCreditPurchase"
  ADD CONSTRAINT "TutoringCreditPurchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TutoringRequest"
  ADD CONSTRAINT "TutoringRequest_learnerId_fkey"
  FOREIGN KEY ("learnerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TutoringRequest"
  ADD CONSTRAINT "TutoringRequest_assignedTeacherId_fkey"
  FOREIGN KEY ("assignedTeacherId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TutoringRequest"
  ADD CONSTRAINT "TutoringRequest_tutoringSessionId_fkey"
  FOREIGN KEY ("tutoringSessionId") REFERENCES "TutoringSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TutoringBooking"
  ADD CONSTRAINT "TutoringBooking_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "TutoringRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TutoringBooking"
  ADD CONSTRAINT "TutoringBooking_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TutoringBooking"
  ADD CONSTRAINT "TutoringBooking_tutoringSessionId_fkey"
  FOREIGN KEY ("tutoringSessionId") REFERENCES "TutoringSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TutoringCreditLedgerEntry"
  ADD CONSTRAINT "TutoringCreditLedgerEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TutoringCreditLedgerEntry"
  ADD CONSTRAINT "TutoringCreditLedgerEntry_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "TutoringCreditPurchase"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TutoringCreditLedgerEntry"
  ADD CONSTRAINT "TutoringCreditLedgerEntry_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "TutoringRequest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TutoringCreditLedgerEntry"
  ADD CONSTRAINT "TutoringCreditLedgerEntry_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "TutoringBooking"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
