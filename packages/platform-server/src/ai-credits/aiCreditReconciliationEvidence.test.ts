import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import { recordAiCreditReconciliationEvidence } from "./aiCreditReconciliationEvidence";

const observedAt = new Date("2026-10-19T12:00:00Z");
const sha = "a".repeat(64);

function fakeClient(options: {owner?: string; status?: "reserved" | "settled"; hasCase?: boolean} = {}) {
  const owner = options.owner ?? "user-12345";
  const status = options.status ?? "reserved";
  const records = new Map<string, Record<string, unknown>>();
  const events = new Set<string>();
  const calls = { evidenceInserts: 0, audits: 0 };
  const tx = {
    aiCreditReservation: { findUnique: vi.fn(async ({ where }: {where: {idempotencyKey: string}}) =>
      where.idempotencyKey === "operation-1234" ? { id: "reservation-1", userId: owner, status } : null) },
    aiCreditReconciliationCase: { findUnique: vi.fn(async () =>
      options.hasCase === false ? null : { id: "case-1", userId: owner }) },
    aiCreditReconciliationEvidence: {
      createMany: vi.fn(async ({data}: {data: Record<string, unknown>[]}) => {
        const row = data[0]!;
        const key = row.evidenceKey as string;
        if (records.has(key)) return {count: 0};
        records.set(key, { id: "evidence-1", ...row }); calls.evidenceInserts++;
        return {count: 1};
      }),
      findUnique: vi.fn(async ({where}: {where: {evidenceKey: string}}) => records.get(where.evidenceKey) ?? null),
    },
    aiCreditReconciliationEvent: {
      createMany: vi.fn(async ({data}: {data: {eventKey: string}[]}) => {
        if (events.has(data[0]!.eventKey)) return {count:0};
        events.add(data[0]!.eventKey); calls.audits++; return {count:1};
      }),
    },
  };
  const client = { $transaction: async <T>(fn: (transaction: typeof tx) => Promise<T>) => fn(tx) } as unknown as PrismaClient;
  return {client, calls, tx};
}

function details(client: PrismaClient) {
  return {
    client, userId: "user-12345", idempotencyKey: "operation-1234",
    evidenceKey: "review-event-0001", provider: "openai" as const,
    sourceType: "provider_usage_export" as const,
    referenceId: "provider-response-1234", statementSha256: sha,
    outcome: "billed" as const, reportedCostUsdNano: "1230000",
    reviewerId: "auditor-12345", observedAt,
    now: new Date("2026-10-19T15:00:00Z"),
  };
}

describe("E16C4E1B1 immutable operator-submitted evidence (not monetary authorization)", () => {
  it("persists one immutable reference, then idempotently replays it", async () => {
    const {client,calls}=fakeClient();
    const input=details(client);
    expect(await recordAiCreditReconciliationEvidence(input)).toEqual({
      caseId:"case-1",evidenceId:"evidence-1",created:true,
    });
    expect(await recordAiCreditReconciliationEvidence(input)).toEqual({
      caseId:"case-1",evidenceId:"evidence-1",created:false,
    });
    expect(calls).toEqual({evidenceInserts:1,audits:1});
  });
  it("refuses to overwrite a changed cost, outcome, digest or reviewer under the same key", async () => {
    const {client,calls}=fakeClient();
    const input=details(client);
    await recordAiCreditReconciliationEvidence(input);
    for (const changed of [
      {...input,reportedCostUsdNano:"1250000"},
      {...input,outcome:"unknown" as const,reportedCostUsdNano:null},
      {...input,statementSha256:"b".repeat(64)},
      {...input,reviewerId:"another-auditor"},
    ]) await expect(recordAiCreditReconciliationEvidence(changed))
      .rejects.toThrow("AI_EVIDENCE_KEY_CONFLICT");
    expect(calls.evidenceInserts).toBe(1);
  });
  it("refuses wrong user or unrecognized reservation", async () => {
    const {client,calls}=fakeClient();
    await expect(recordAiCreditReconciliationEvidence({...details(client),userId:"other-user-123"}))
      .rejects.toThrow("AI_EVIDENCE_RESERVATION_NOT_FOUND");
    await expect(recordAiCreditReconciliationEvidence({...details(client),idempotencyKey:"other-reservation"}))
      .rejects.toThrow("AI_EVIDENCE_RESERVATION_NOT_FOUND");
    expect(calls.evidenceInserts).toBe(0);
  });
  it("refuses a finalized reservation and missing case", async () => {
    const settled=fakeClient({status:"settled"});
    await expect(recordAiCreditReconciliationEvidence(details(settled.client)))
      .rejects.toThrow("AI_EVIDENCE_RESERVATION_NOT_HELD");
    const noCase=fakeClient({hasCase:false});
    await expect(recordAiCreditReconciliationEvidence(details(noCase.client)))
      .rejects.toThrow("AI_EVIDENCE_CASE_NOT_FOUND");
  });
  it("rejects unsupported providers and source types before DB access", async () => {
    const {client,tx}=fakeClient();
    await expect(recordAiCreditReconciliationEvidence({...details(client),provider:"gemini" as never}))
      .rejects.toThrow("AI_EVIDENCE_PROVIDER_UNSUPPORTED");
    await expect(recordAiCreditReconciliationEvidence({...details(client),sourceType:"free_text" as never}))
      .rejects.toThrow("AI_EVIDENCE_SOURCE_UNSUPPORTED");
    expect(tx.aiCreditReservation.findUnique).not.toHaveBeenCalled();
  });
  it("rejects malformed digests and references before DB access", async () => {
    const {client,tx}=fakeClient();
    await expect(recordAiCreditReconciliationEvidence({...details(client),statementSha256:"short"}))
      .rejects.toThrow("AI_EVIDENCE_DIGEST_INVALID");
    await expect(recordAiCreditReconciliationEvidence({...details(client),referenceId:"https://site/secret?token=123"}))
      .rejects.toThrow("AI_EVIDENCE_INVALID_REFERENCE");
    expect(tx.aiCreditReservation.findUnique).not.toHaveBeenCalled();
  });
  it("rejects invalid costs and a cost attached to zero-billing/unknown report", async () => {
    const {client}=fakeClient();
    for (const cost of ["-1","1.02","001", "a".repeat(81)]) {
      await expect(recordAiCreditReconciliationEvidence({...details(client),reportedCostUsdNano:cost}))
        .rejects.toThrow("AI_EVIDENCE_COST_INVALID");
    }
    await expect(recordAiCreditReconciliationEvidence({...details(client),outcome:"not_billed",reportedCostUsdNano:"0"}))
      .rejects.toThrow("AI_EVIDENCE_NON_BILLED_COST_INVALID");
  });
  it("allows incomplete billed-cost evidence as an unresolved report, never settlement", async () => {
    const {client,calls}=fakeClient();
    const input={...details(client),reportedCostUsdNano:null};
    await recordAiCreditReconciliationEvidence(input);
    expect(calls.evidenceInserts).toBe(1);
    // No calls whatsoever to financial settlement or release are available.
  });
  it("refuses future or invalid observation times", async () => {
    const {client}=fakeClient();
    await expect(recordAiCreditReconciliationEvidence({...details(client),observedAt:new Date("2026-10-20") }))
      .rejects.toThrow("AI_EVIDENCE_TIME_INVALID");
    await expect(recordAiCreditReconciliationEvidence({...details(client),now:new Date("invalid") }))
      .rejects.toThrow("AI_EVIDENCE_TIME_INVALID");
  });
});
