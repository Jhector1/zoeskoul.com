// Platform-server owner: keep this module restricted to server entry points.
// Match aiCreditLedger.ts; this package does not depend on the Next-only sentinel.
import type { PrismaClient } from "@zoeskoul/db";

/** E16C4E1A: review-only journal, NEVER a permission to settle or release. */
export type AiCreditHoldReason =
  | "AI_METERING_PROVIDER_OUTCOME_UNKNOWN"
  | "AI_METERING_SETTLEMENT_PENDING";

function identifier(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) {
    throw new Error(`AI_RECONCILIATION_INVALID_${label}`);
  }
  return value.trim();
}

/**
 * Creates the durable case only for a reservation still held by this user.
 * A failed journal write MUST NOT release funds. The aged-reservation scanner
 * can find such a hold later, including after a process crash.
 *
 * No prompts, model outputs, provider credentials, or raw exceptions are kept.
 */
export async function recordUncertainAiCreditCharge(input: Readonly<{
  client: PrismaClient;
  userId: string;
  idempotencyKey: string;
  reason: AiCreditHoldReason;
}>): Promise<{ caseId: string; newEvent: boolean }> {
  const userId = identifier(input.userId, "USER");
  const idempotencyKey = identifier(input.idempotencyKey, "KEY");
  if (input.reason !== "AI_METERING_PROVIDER_OUTCOME_UNKNOWN" &&
      input.reason !== "AI_METERING_SETTLEMENT_PENDING") {
    throw new Error("AI_RECONCILIATION_INVALID_REASON");
  }
  return input.client.$transaction(async (tx) => {
    const reservation = await tx.aiCreditReservation.findUnique({
      where: { idempotencyKey },
      select: { id: true, userId: true, status: true },
    });
    if (!reservation || reservation.userId !== userId) {
      throw new Error("AI_RECONCILIATION_RESERVATION_NOT_FOUND");
    }
    if (reservation.status !== "reserved") {
      // Never manufacture an open case for money already finalized.
      throw new Error("AI_RECONCILIATION_RESERVATION_NOT_HELD");
    }
    await tx.aiCreditReconciliationCase.createMany({
      data: [{ reservationId: reservation.id, userId }], skipDuplicates: true,
    });
    const found = await tx.aiCreditReconciliationCase.findUnique({
      where: { reservationId: reservation.id }, select: { id: true, userId: true },
    });
    if (!found || found.userId !== userId) {
      throw new Error("AI_RECONCILIATION_CASE_CONFLICT");
    }
    const eventKey = `held:${reservation.id}:${input.reason}`;
    const inserted = await tx.aiCreditReconciliationEvent.createMany({
      data: [{ caseId: found.id, eventKey, reasonCode: input.reason }],
      skipDuplicates: true,
    });
    return { caseId: found.id, newEvent: inserted.count === 1 };
  });
}

/**
 * Read-only scan to recover holds even when a process crashed before it wrote
 * the optional journal. Must be invoked only by authenticated internal ops.
 * Returns NO secrets or prompts; never changes a wallet balance.
 */
export async function listAgedAiCreditReservations(input: Readonly<{
  client: PrismaClient;
  olderThan: Date;
  limit?: number;
}>) {
  if (!(input.olderThan instanceof Date) || !Number.isFinite(input.olderThan.getTime())) {
    throw new Error("AI_RECONCILIATION_INVALID_CUTOFF");
  }
  const limit = input.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250) {
    throw new Error("AI_RECONCILIATION_INVALID_LIMIT");
  }
  return input.client.aiCreditReservation.findMany({
    where: { status: "reserved", createdAt: { lte: input.olderThan } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true, userId: true, idempotencyKey: true, pricingVersionId: true,
      maximumUnits: true, createdAt: true,
      reconciliationCase: { select: { id: true, openedAt: true } },
    },
  });
}
