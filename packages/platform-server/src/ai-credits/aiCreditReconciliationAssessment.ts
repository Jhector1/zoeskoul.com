import type { PrismaClient } from "@zoeskoul/db";

/**
 * E16C4E1B2A: READ-ONLY case triage. Submitted evidence is an operator claim,
 * NOT proof that the provider charged (or did not charge) for a request.
 * This module deliberately exports no settle, release or approval primitive.
 * Callers MUST independently authenticate and authorize internal reviewers.
 */
export class AiCreditAssessmentError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiCreditAssessmentError";
  }
}

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/#-]{0,159}$/;
const EVIDENCE_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/#-]{7,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const COST = /^(?:0|[1-9][0-9]{0,79})$/;
const SOURCES = [
  "provider_usage_export", "provider_invoice", "provider_support_confirmation",
] as const;
const MAX_EVIDENCE = 200;

type ClaimedOutcome = "billed" | "not_billed";
export type AiCreditAssessmentReason =
  | "RESERVATION_FINALIZED"
  | "CASE_NOT_RECORDED"
  | "EVIDENCE_MISSING"
  | "EVIDENCE_LIMIT_EXCEEDED"
  | "EVIDENCE_INTEGRITY_REVIEW_REQUIRED"
  | "EVIDENCE_CONFLICT"
  | "EVIDENCE_INCOMPLETE"
  | "EVIDENCE_OUTCOME_UNKNOWN"
  | "INDEPENDENT_PROVIDER_VERIFICATION_REQUIRED";

export type AiCreditReconciliationAssessment = Readonly<{
  reservationId: string;
  caseId: string | null;
  evidenceCount: number;
  reason: AiCreditAssessmentReason;
  /** Only a consistent OPERATOR CLAIM, never a verified/provider-priced charge. */
  claimedOutcome: ClaimedOutcome | null;
  /** Not trusted as a cost to pass to settlement. */
  claimedCostUsdNano: string | null;
  monetaryResolutionAllowed: false;
}>;

type Evidence = Readonly<{
  provider: string;
  sourceType: string;
  referenceId: string;
  statementSha256: string;
  outcome: string;
  reportedCostUsdNano: string | null;
  reviewerId: string;
  observedAt: Date;
}>;

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}
function validEvidence(value: Evidence, now: Date): boolean {
  if (value.provider !== "openai" ||
      !SOURCES.some(source => source === value.sourceType) ||
      !EVIDENCE_REF_PATTERN.test(value.referenceId) ||
      !EVIDENCE_REF_PATTERN.test(value.reviewerId) ||
      !DIGEST.test(value.statementSha256) ||
      !(value.observedAt instanceof Date) ||
      !Number.isFinite(value.observedAt.getTime()) ||
      value.observedAt.getTime() > now.getTime() ||
      !["billed", "not_billed", "unknown"].includes(value.outcome)) return false;
  if (value.reportedCostUsdNano !== null &&
      !COST.test(value.reportedCostUsdNano)) return false;
  return value.outcome === "billed" || value.reportedCostUsdNano === null;
}

/**
 * A bounded, tenant-checked, non-mutating assessment of a held reservation.
 * Even a consistent invoice/export claim ALWAYS requires an independent check
 * against a provider-controlled source bound to the original paid request.
 * Do not use the result as permission to call settleAiCredits/releaseUnusedAiReservation.
 */
export async function assessAiCreditReconciliationEvidence(input: Readonly<{
  client: PrismaClient;
  userId: string;
  idempotencyKey: string;
  now?: Date;
}>): Promise<AiCreditReconciliationAssessment> {
  if (!validIdentifier(input.userId) || !validIdentifier(input.idempotencyKey))
    throw new AiCreditAssessmentError("AI_ASSESSMENT_INVALID_IDENTIFIER");
  const now = input.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new AiCreditAssessmentError("AI_ASSESSMENT_INVALID_TIME");

  const reservation = await input.client.aiCreditReservation.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: {
      id: true, userId: true, status: true,
      reconciliationCase: {
        select: {
          id: true, userId: true,
          evidence: {
            select: {
              provider: true, sourceType: true, referenceId: true,
              statementSha256: true, outcome: true, reportedCostUsdNano: true,
              reviewerId: true, observedAt: true,
            },
            orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
            take: MAX_EVIDENCE + 1,
          },
        },
      },
    },
  });
  if (!reservation || reservation.userId !== input.userId)
    throw new AiCreditAssessmentError("AI_ASSESSMENT_RESERVATION_NOT_FOUND");
  if (reservation.reconciliationCase &&
      reservation.reconciliationCase.userId !== input.userId)
    throw new AiCreditAssessmentError("AI_ASSESSMENT_CASE_OWNERSHIP_CONFLICT");

  const caseId = reservation.reconciliationCase?.id ?? null;
  const evidence: Evidence[] = reservation.reconciliationCase?.evidence ?? [];
  const basic = (reason: AiCreditAssessmentReason,
    claimedOutcome: ClaimedOutcome | null = null,
    claimedCostUsdNano: string | null = null): AiCreditReconciliationAssessment => ({
    reservationId: reservation.id, caseId, evidenceCount: evidence.length,
    reason, claimedOutcome, claimedCostUsdNano, monetaryResolutionAllowed: false,
  });
  // A finalized reservation may already have moved money. Never reopen it.
  if (reservation.status !== "reserved") return basic("RESERVATION_FINALIZED");
  if (!caseId) return basic("CASE_NOT_RECORDED");
  if (!evidence.length) return basic("EVIDENCE_MISSING");
  if (evidence.length > MAX_EVIDENCE) return basic("EVIDENCE_LIMIT_EXCEEDED");
  if (evidence.some(row => !validEvidence(row, now)))
    return basic("EVIDENCE_INTEGRITY_REVIEW_REQUIRED");

  // A reference reused with different content is suspicious even if the
  // operators agree on the billed/not-billed outcome.
  const references = new Map<string, string>();
  for (const row of evidence) {
    const key = `${row.provider}:${row.sourceType}:${row.referenceId}`;
    const prior = references.get(key);
    if (prior !== undefined && prior !== row.statementSha256)
      return basic("EVIDENCE_CONFLICT");
    references.set(key, row.statementSha256);
  }
  const outcomes = new Set(evidence.filter(row => row.outcome !== "unknown")
    .map(row => row.outcome));
  const costs = new Set(evidence.filter(row => row.outcome === "billed" &&
    row.reportedCostUsdNano !== null).map(row => row.reportedCostUsdNano));
  if (outcomes.size > 1 || costs.size > 1) return basic("EVIDENCE_CONFLICT");
  if (evidence.some(row => row.outcome === "unknown"))
    return basic("EVIDENCE_OUTCOME_UNKNOWN");
  if (!outcomes.size) return basic("EVIDENCE_OUTCOME_UNKNOWN");
  const outcome = [...outcomes][0] as ClaimedOutcome;
  if (outcome === "billed" &&
      (evidence.some(row => row.reportedCostUsdNano === null) || costs.size !== 1))
    return basic("EVIDENCE_INCOMPLETE");
  // Treat a "billed" report for zero cost as ambiguous, not as a release.
  if (outcome === "billed" && costs.has("0")) return basic("EVIDENCE_INCOMPLETE");
  return basic("INDEPENDENT_PROVIDER_VERIFICATION_REQUIRED",
    outcome, outcome === "billed" ? [...costs][0] ?? null : null);
}
