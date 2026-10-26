import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
vi.mock("server-only", () => ({}));
import { listAgedAiCreditReservations, recordUncertainAiCreditCharge } from "./aiCreditReconciliation";

function fakeClient(status: "reserved" | "settled" = "reserved", owner = "u1") {
  const cases = new Map<string, { id: string; userId: string }>();
  const events = new Set<string>();
  const calls = { journal: 0, cases: 0, findMany: 0 };
  const tx = {
    aiCreditReservation: {
      findUnique: vi.fn(async ({where}: {where: {idempotencyKey: string}}) =>
        where.idempotencyKey === "op-1" ? {id: "r1", userId: owner, status} : null),
    },
    aiCreditReconciliationCase: {
      createMany: vi.fn(async ({data}: {data: {reservationId: string; userId: string}[]}) => {
        if (!cases.has(data[0]!.reservationId)) {cases.set(data[0]!.reservationId, {id:"c1", userId:data[0]!.userId});calls.cases++;}
        return {count:1};
      }),
      findUnique: vi.fn(async ({where}: {where: {reservationId: string}}) => cases.get(where.reservationId) ?? null),
    },
    aiCreditReconciliationEvent: {
      createMany: vi.fn(async ({data}: {data: {eventKey: string}[]}) => {
        const key = data[0]!.eventKey;
        if (events.has(key)) return {count:0};
        events.add(key); calls.journal++;
        return {count:1};
      }),
    },
  };
  const client = {
    $transaction: async <T>(fn: (transaction: typeof tx) => Promise<T>) => fn(tx),
    aiCreditReservation: {
      findMany: vi.fn(async () => { calls.findMany++; return [{id:"r1",userId:"u1",idempotencyKey:"op-1"}]; }),
    },
  } as unknown as PrismaClient;
  return {client, calls, tx};
}

const input = (client: PrismaClient) => ({client,userId:"u1",idempotencyKey:"op-1",
  reason:"AI_METERING_PROVIDER_OUTCOME_UNKNOWN" as const});

describe("E16C4E1A review-only AI credit reconciliation", () => {
  it("journals a reserved provider-uncertain charge once on replay", async () => {
    const {client,calls}=fakeClient();
    expect(await recordUncertainAiCreditCharge(input(client))).toEqual({caseId:"c1",newEvent:true});
    expect(await recordUncertainAiCreditCharge(input(client))).toEqual({caseId:"c1",newEvent:false});
    expect(calls.journal).toBe(1);
    expect(calls.cases).toBe(1);
  });
  it("records distinct reasons without duplicating the held case", async () => {
    const {client,calls}=fakeClient();
    await recordUncertainAiCreditCharge(input(client));
    await recordUncertainAiCreditCharge({...input(client),reason:"AI_METERING_SETTLEMENT_PENDING"});
    expect(calls.journal).toBe(2);
    expect(calls.cases).toBe(1);
  });
  it("rejects a different user before any journal insert", async () => {
    const {client,calls}=fakeClient();
    await expect(recordUncertainAiCreditCharge({...input(client),userId:"other"}))
      .rejects.toThrow("AI_RECONCILIATION_RESERVATION_NOT_FOUND");
    expect(calls.cases).toBe(0);
  });
  it("never opens a case after financial finalization", async () => {
    const {client,calls}=fakeClient("settled");
    await expect(recordUncertainAiCreditCharge(input(client)))
      .rejects.toThrow("AI_RECONCILIATION_RESERVATION_NOT_HELD");
    expect(calls.cases).toBe(0);
  });
  it("rejects unknown reason codes and missing reservations", async () => {
    const {client,calls}=fakeClient();
    await expect(recordUncertainAiCreditCharge({...input(client),reason:"BILLED" as never}))
      .rejects.toThrow("AI_RECONCILIATION_INVALID_REASON");
    await expect(recordUncertainAiCreditCharge({...input(client),idempotencyKey:"not-found"}))
      .rejects.toThrow("AI_RECONCILIATION_RESERVATION_NOT_FOUND");
    expect(calls.journal).toBe(0);
  });
  it("scans aged RESERVED holds even if journal write was lost", async () => {
    const {client,calls}=fakeClient();
    const cutoff=new Date("2026-10-18T00:00:00Z");
    expect(await listAgedAiCreditReservations({client,olderThan:cutoff,limit:25}))
      .toMatchObject([{id:"r1"}]);
    expect(calls.findMany).toBe(1);
    const call=vi.mocked(client.aiCreditReservation.findMany).mock.calls[0]![0];
    expect(call).toMatchObject({where:{status:"reserved",createdAt:{lte:cutoff}},take:25});
  });
  it("rejects invalid scan bounds before database access", async () => {
    const {client,calls}=fakeClient();
    await expect(listAgedAiCreditReservations({client,olderThan:new Date("invalid")}))
      .rejects.toThrow("AI_RECONCILIATION_INVALID_CUTOFF");
    await expect(listAgedAiCreditReservations({client,olderThan:new Date(),limit:251}))
      .rejects.toThrow("AI_RECONCILIATION_INVALID_LIMIT");
    expect(calls.findMany).toBe(0);
  });
});
