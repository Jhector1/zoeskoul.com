import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import { assessAiCreditReconciliationEvidence } from "./aiCreditReconciliationAssessment";

const now = new Date("2026-10-19T18:00:00Z");
const digest = "a".repeat(64);
type Evidence = {
  provider: string;
  sourceType: string;
  referenceId: string;
  statementSha256: string;
  outcome: string;
  reportedCostUsdNano: string | null;
  reviewerId: string;
  observedAt: Date;
};
const claim: Evidence = {
  provider: "openai", sourceType: "provider_invoice", referenceId: "inv-openai-2026",
  statementSha256: digest, outcome: "billed", reportedCostUsdNano: "2500000",
  reviewerId: "internal-operator-1", observedAt: new Date("2026-10-19T12:00:00Z"),
};
function fake(options: {
  owner?: string; caseOwner?: string; status?: string; caseMissing?: boolean;
  reservationMissing?: boolean; evidence?: Evidence[];
} = {}) {
  const read = vi.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
    if (where.idempotencyKey !== "request-12345" || options.reservationMissing) return null;
    return {
      id: "reservation-1", userId: options.owner ?? "user-12345",
      status: options.status ?? "reserved",
      reconciliationCase: options.caseMissing ? null : {
        id: "case-1", userId: options.caseOwner ?? "user-12345",
        evidence: options.evidence ?? [claim],
      },
    };
  });
  const client = {aiCreditReservation: { findUnique: read }} as unknown as PrismaClient;
  return { client, read };
}
const args = (client: PrismaClient) => ({client, userId: "user-12345", idempotencyKey: "request-12345", now});

describe("E16C4E1B2A held charge case assessment: no financial authorization", () => {
  it("labels a consistent claimed bill as still needing independent provider verification", async () => {
    const {client, read} = fake();
    expect(await assessAiCreditReconciliationEvidence(args(client))).toEqual({
      reservationId: "reservation-1", caseId: "case-1", evidenceCount: 1,
      reason: "INDEPENDENT_PROVIDER_VERIFICATION_REQUIRED", claimedOutcome: "billed",
      claimedCostUsdNano: "2500000", monetaryResolutionAllowed: false,
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("does not authorize release for an unverified not-billed claim", async () => {
    const {client} = fake({evidence: [{...claim, outcome: "not_billed", reportedCostUsdNano: null}]});
    expect(await assessAiCreditReconciliationEvidence(args(client))).toMatchObject({
      claimedOutcome: "not_billed", claimedCostUsdNano: null,
      reason: "INDEPENDENT_PROVIDER_VERIFICATION_REQUIRED", monetaryResolutionAllowed: false,
    });
  });
  it("reports a missing case or missing evidence without manufacturing one", async () => {
    const missing = fake({caseMissing: true});
    expect((await assessAiCreditReconciliationEvidence(args(missing.client))).reason)
      .toBe("CASE_NOT_RECORDED");
    const empty = fake({evidence: []});
    expect((await assessAiCreditReconciliationEvidence(args(empty.client))).reason)
      .toBe("EVIDENCE_MISSING");
  });
  it("does not reopen a settled or released reservation", async () => {
    for (const status of ["settled", "released"]) {
      const {client} = fake({status});
      expect((await assessAiCreditReconciliationEvidence(args(client))).reason)
        .toBe("RESERVATION_FINALIZED");
    }
  });
  it("rejects unknown users and inconsistent case ownership", async () => {
    const wrong = fake({owner: "another-user"});
    await expect(assessAiCreditReconciliationEvidence(args(wrong.client)))
      .rejects.toThrow("AI_ASSESSMENT_RESERVATION_NOT_FOUND");
    const conflicting = fake({caseOwner: "another-user"});
    await expect(assessAiCreditReconciliationEvidence(args(conflicting.client)))
      .rejects.toThrow("AI_ASSESSMENT_CASE_OWNERSHIP_CONFLICT");
  });
  it("holds contradictory billed and not-billed claims", async () => {
    const {client} = fake({evidence: [claim, {...claim, outcome:"not_billed", reportedCostUsdNano:null,
      referenceId: "other-claim-123"}]});
    expect(await assessAiCreditReconciliationEvidence(args(client))).toMatchObject({
      reason: "EVIDENCE_CONFLICT", monetaryResolutionAllowed: false, claimedOutcome: null,
    });
  });
  it("holds differing claimed costs and inconsistent reference digests", async () => {
    const costs = fake({evidence: [claim, {...claim, sourceType:"provider_usage_export",
      reportedCostUsdNano:"5000000"}]});
    expect((await assessAiCreditReconciliationEvidence(args(costs.client))).reason)
      .toBe("EVIDENCE_CONFLICT");
    const ref = fake({evidence: [claim, {...claim, statementSha256:"b".repeat(64)}]});
    expect((await assessAiCreditReconciliationEvidence(args(ref.client))).reason)
      .toBe("EVIDENCE_CONFLICT");
  });
  it("fails closed on unknown or incomplete provider outcomes", async () => {
    const unknown = fake({evidence: [{...claim, outcome:"unknown", reportedCostUsdNano:null}]});
    expect((await assessAiCreditReconciliationEvidence(args(unknown.client))).reason)
      .toBe("EVIDENCE_OUTCOME_UNKNOWN");
    const incomplete = fake({evidence: [{...claim, reportedCostUsdNano:null}]});
    expect((await assessAiCreditReconciliationEvidence(args(incomplete.client))).reason)
      .toBe("EVIDENCE_INCOMPLETE");
    const zero = fake({evidence: [{...claim, reportedCostUsdNano:"0"}]});
    expect((await assessAiCreditReconciliationEvidence(args(zero.client))).reason)
      .toBe("EVIDENCE_INCOMPLETE");
  });
  it("flags invalid or future records and rejects invalid invocation", async () => {
    const invalid = fake({evidence: [{...claim, provider: "gemini"}]});
    expect((await assessAiCreditReconciliationEvidence(args(invalid.client))).reason)
      .toBe("EVIDENCE_INTEGRITY_REVIEW_REQUIRED");
    const future = fake({evidence: [{...claim, observedAt:new Date("2026-10-20T00:00:00Z")}]});
    expect((await assessAiCreditReconciliationEvidence(args(future.client))).reason)
      .toBe("EVIDENCE_INTEGRITY_REVIEW_REQUIRED");
    await expect(assessAiCreditReconciliationEvidence({...args(invalid.client), now: new Date("invalid")}))
      .rejects.toThrow("AI_ASSESSMENT_INVALID_TIME");
    const {client, read} = fake();
    await expect(assessAiCreditReconciliationEvidence({...args(client), userId: "!"}))
      .rejects.toThrow("AI_ASSESSMENT_INVALID_IDENTIFIER");
    expect(read).not.toHaveBeenCalled();
  });
  it("refuses to classify a truncated evidence collection as complete", async () => {
    const {client} = fake({evidence: Array.from({length: 201}, () => ({...claim}))});
    expect((await assessAiCreditReconciliationEvidence(args(client))).reason)
      .toBe("EVIDENCE_LIMIT_EXCEEDED");
  });
});
