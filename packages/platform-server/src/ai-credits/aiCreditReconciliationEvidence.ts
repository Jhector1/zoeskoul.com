import type { PrismaClient } from "@zoeskoul/db";

/**
 * E16C4E1B1: store operator-submitted provider evidence METADATA for review.
 * No monetary API is exported. Cryptographic digests are integrity identifiers,
 * NOT provider signatures or proof that a bill has/has not occurred.
 * Caller MUST authenticate and authorize internal operators before invoking.
 */
export type AiCreditEvidenceSource =
  | "provider_usage_export"
  | "provider_invoice"
  | "provider_support_confirmation";
export type AiCreditReportedOutcome = "billed" | "not_billed" | "unknown";

export class AiCreditEvidenceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiCreditEvidenceError";
  }
}

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/#-]{0,159}$/;
const EVIDENCE_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/#-]{7,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COST_PATTERN = /^(?:0|[1-9][0-9]{0,79})$/;
const SOURCES = ["provider_usage_export", "provider_invoice", "provider_support_confirmation"] as const;
const OUTCOMES = ["billed", "not_billed", "unknown"] as const;

function identifier(value: string, label: string, strictReference = false) {
  if (typeof value !== "string" ||
      !(strictReference ? EVIDENCE_REF_PATTERN : ID_PATTERN).test(value))
    throw new AiCreditEvidenceError(`AI_EVIDENCE_INVALID_${label}`);
  return value;
}

export type AiCreditEvidenceInput = Readonly<{
  client: PrismaClient;
  userId: string;
  idempotencyKey: string;
  evidenceKey: string;
  provider: "openai";
  sourceType: AiCreditEvidenceSource;
  referenceId: string;
  statementSha256: string;
  outcome: AiCreditReportedOutcome;
  /** Provider-report claim, never a trusted charge without independent verification. */
  reportedCostUsdNano: string | null;
  reviewerId: string;
  observedAt: Date;
  now?: Date;
}>;

/**
 * Append immutable evidence metadata against an ALREADY opened held case.
 * Duplicate same-key submissions must match every field; no silent overwrite.
 * The existing wallet and reservation balances remain unchanged.
 */
export async function recordAiCreditReconciliationEvidence(input: AiCreditEvidenceInput):
  Promise<{ caseId: string; evidenceId: string; created: boolean }> {
  const userId = identifier(input.userId, "USER");
  const idempotencyKey = identifier(input.idempotencyKey, "RESERVATION_KEY");
  const evidenceKey = identifier(input.evidenceKey, "KEY", true);
  const reviewerId = identifier(input.reviewerId, "REVIEWER", true);
  const referenceId = identifier(input.referenceId, "REFERENCE", true);
  if (input.provider !== "openai") throw new AiCreditEvidenceError("AI_EVIDENCE_PROVIDER_UNSUPPORTED");
  if (!SOURCES.includes(input.sourceType)) throw new AiCreditEvidenceError("AI_EVIDENCE_SOURCE_UNSUPPORTED");
  if (!OUTCOMES.includes(input.outcome)) throw new AiCreditEvidenceError("AI_EVIDENCE_OUTCOME_INVALID");
  if (typeof input.statementSha256 !== "string" || !SHA256_PATTERN.test(input.statementSha256))
    throw new AiCreditEvidenceError("AI_EVIDENCE_DIGEST_INVALID");
  if (input.reportedCostUsdNano !== null &&
      (typeof input.reportedCostUsdNano !== "string" || !COST_PATTERN.test(input.reportedCostUsdNano)))
    throw new AiCreditEvidenceError("AI_EVIDENCE_COST_INVALID");
  if (input.outcome !== "billed" && input.reportedCostUsdNano !== null)
    throw new AiCreditEvidenceError("AI_EVIDENCE_NON_BILLED_COST_INVALID");
  const now = input.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !(input.observedAt instanceof Date) || !Number.isFinite(input.observedAt.getTime()) ||
      input.observedAt.getTime() > now.getTime())
    throw new AiCreditEvidenceError("AI_EVIDENCE_TIME_INVALID");

  return input.client.$transaction(async (tx) => {
    const reservation = await tx.aiCreditReservation.findUnique({
      where: { idempotencyKey },
      select: { id: true, userId: true, status: true },
    });
    if (!reservation || reservation.userId !== userId)
      throw new AiCreditEvidenceError("AI_EVIDENCE_RESERVATION_NOT_FOUND");
    if (reservation.status !== "reserved")
      throw new AiCreditEvidenceError("AI_EVIDENCE_RESERVATION_NOT_HELD");
    const caseRow = await tx.aiCreditReconciliationCase.findUnique({
      where: { reservationId: reservation.id }, select: { id: true, userId: true },
    });
    if (!caseRow || caseRow.userId !== userId)
      throw new AiCreditEvidenceError("AI_EVIDENCE_CASE_NOT_FOUND");

    const data = {
      caseId: caseRow.id, evidenceKey, provider: input.provider,
      sourceType: input.sourceType, referenceId, statementSha256: input.statementSha256,
      outcome: input.outcome, reportedCostUsdNano: input.reportedCostUsdNano,
      reviewerId, observedAt: input.observedAt,
    } as const;
    const insert = await tx.aiCreditReconciliationEvidence.createMany({
      data: [data], skipDuplicates: true,
    });
    const existing = await tx.aiCreditReconciliationEvidence.findUnique({
      where: { evidenceKey },
      select: { id: true, caseId: true, provider: true, sourceType: true,
        referenceId: true, statementSha256: true, outcome: true,
        reportedCostUsdNano: true, reviewerId: true, observedAt: true },
    });
    if (!existing || existing.caseId !== data.caseId ||
        existing.provider !== data.provider || existing.sourceType !== data.sourceType ||
        existing.referenceId !== data.referenceId ||
        existing.statementSha256 !== data.statementSha256 ||
        existing.outcome !== data.outcome ||
        existing.reportedCostUsdNano !== data.reportedCostUsdNano ||
        existing.reviewerId !== data.reviewerId ||
        existing.observedAt.getTime() !== data.observedAt.getTime())
      throw new AiCreditEvidenceError("AI_EVIDENCE_KEY_CONFLICT");

    // Reserve one append-only audit event per immutable evidence record.
    await tx.aiCreditReconciliationEvent.createMany({
      data: [{ caseId: caseRow.id, eventKey: `evidence:${existing.id}`,
        reasonCode: "AI_RECONCILIATION_EVIDENCE_SUBMITTED" }], skipDuplicates: true,
    });
    return { caseId: caseRow.id, evidenceId: existing.id, created: insert.count === 1 };
  });
}
