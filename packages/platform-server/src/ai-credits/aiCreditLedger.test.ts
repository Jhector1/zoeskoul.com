import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
vi.mock("server-only", () => ({}));
import {
  getAiCreditBalance, grantAiCreditLot, releaseUnusedAiReservation,
  reserveAiCredits, settleAiCredits, settleAiCreditsFromRecordedProviderReceipt,
  freezeAiCreditWalletForVerifiedStripeRisk,
} from "./aiCreditLedger";

const conversion = {
  versionId: "retail-v1", creditUnitsPerCredit: "1000000",
  creditValueUsdNano: "10000000", markupNumerator: "1", markupDenominator: "1",
};
const now = new Date("2026-10-19T03:00:00Z");
// A transactional in-memory Prisma shape. Financial integration tests must also
// run against real PostgreSQL before deploying migration/runtime enforcement.
function memoryClient() {
  type Row = Record<string, any>;
  type State = {
    seq: number; wallets: Map<string, Row>; lots: Map<string, Row>;
    reservations: Map<string, Row>; allocations: Map<string, Row>; entries: Map<string, Row>;
    providerRequests: Map<string, Row>; cases: Map<string, Row>; caseEvents: Map<string, Row>;
    riskEvents: Map<string, Row>; reversalSnapshots: Map<string, Row>;
  };
  let state: State = {
    seq: 0, wallets: new Map(), lots: new Map(), reservations: new Map(),
    allocations: new Map(), entries: new Map(),
    providerRequests: new Map(), cases: new Map(), caseEvents: new Map(), riskEvents: new Map(), reversalSnapshots: new Map(),
  };
  let queue: Promise<void> = Promise.resolve();
  const matches = (row: Row, where: Row) => {
    if (where?.userId && row.userId !== where.userId) return false;
    if (where?.availableUnits?.gt !== undefined && row.availableUnits <= where.availableUnits.gt) return false;
    if (where?.expiresAt?.lte && (!row.expiresAt || row.expiresAt > where.expiresAt.lte)) return false;
    if (where?.OR && !where.OR.some((v: Row) => v.expiresAt === null
      ? row.expiresAt === null : row.expiresAt !== null && row.expiresAt > v.expiresAt.gt)) return false;
    return true;
  };
  const createTx = (s: State) => {
    const nextId = () => `mock-${++s.seq}`;
    const changed = (row: Row, data: Row) => {
      for (const [k, v] of Object.entries(data)) {
        row[k] = typeof v === "object" && v !== null && "increment" in v
          ? row[k] + v.increment
          : typeof v === "object" && v !== null && "decrement" in v
            ? row[k] - v.decrement : v;
      }
      return row;
    };
    const allocationsFor = (reservationId: string) => [...s.allocations.values()]
      .filter(a => a.reservationId === reservationId).map(a => ({ ...a, lot: s.lots.get(a.lotId) }));
    return {
      $queryRaw: async () => [],
      aiCreditWallet: {
        findUnique: async ({where}:Row) => s.wallets.get(where.userId) ?? null,
        updateMany: async ({where,data}:Row) => {
          const wallet=s.wallets.get(where.userId);
          if (!wallet || (where.riskFrozenAt===null && wallet.riskFrozenAt!==null)) return {count:0};
          changed(wallet,data);return {count:1};
        },
        createMany: async ({ data, skipDuplicates }: Row) => {
          if (skipDuplicates !== true) throw Error("Expected idempotent wallet insertion");
          let count = 0;
          for (const row of data) {
            if (!s.wallets.has(row.userId)) {
              s.wallets.set(row.userId, { userId: row.userId, riskFrozenAt: null });
              count++;
            }
          }
          return { count };
        },
      },
      aiCreditLot: {
        findUnique: async ({ where }: Row) => where.id
          ? (s.lots.get(where.id) ?? null)
          : ([...s.lots.values()].find(l => l.sourceKey === where.sourceKey) ?? null),
        findMany: async ({ where }: Row) => [...s.lots.values()].filter(l => matches(l, where)),
        create: async ({ data }: Row) => {
          const row = { id: nextId(), createdAt: now, reservedUnits: 0n, consumedUnits: 0n,
            expiredUnits: 0n, reversedUnits: 0n, reversalTargetUnits: 0n,
            reversalShortfallUnits: 0n, ...data };
          s.lots.set(row.id, row); return row;
        },
        update: async ({ where, data }: Row) => changed(s.lots.get(where.id)!, data),
      },
      aiCreditReservation: {
        findUnique: async ({ where, include }: Row) => {
          const row = [...s.reservations.values()].find(r => r.idempotencyKey === where.idempotencyKey);
          return !row ? null : include ? { ...row, allocations: allocationsFor(row.id) } : row;
        },
        create: async ({ data }: Row) => {
          const row = { id: nextId(), status: "reserved", settledUnits: 0n, ...data };
          s.reservations.set(row.id, row); return row;
        },
        update: async ({ where, data }: Row) => changed(s.reservations.get(where.id)!, data),
      },
      aiCreditReservationAllocation: {
        create: async ({ data }: Row) => {
          const row = { consumedUnits: 0n, releasedUnits: 0n, ...data };
          s.allocations.set(`${row.reservationId}:${row.lotId}`, row); return row;
        },
        update: async ({ where, data }: Row) => {
          const key = where.reservationId_lotId;
          return changed(s.allocations.get(`${key.reservationId}:${key.lotId}`)!, data);
        },
      },
      aiCreditLedgerEntry: {
        create: async ({ data }: Row) => {
          if ([...s.entries.values()].some(e => e.eventKey === data.eventKey)) throw Error("duplicate event");
          const row = { id: nextId(), ...data }; s.entries.set(row.id, row); return row;
        },
      },
      aiCreditPaymentReversalSnapshot: {
        createMany: async ({data}:Row) => {
          const row=data[0];const key=`${row.lotId}:${row.refundedAmountUsdMinor}`;
          if(s.reversalSnapshots.has(key))return {count:0};
          s.reversalSnapshots.set(key,{...row,id:nextId()});return {count:1};
        },
        findUnique: async ({where}:Row) => {
          const key=where.lotId_refundedAmountUsdMinor;
          return s.reversalSnapshots.get(`${key.lotId}:${key.refundedAmountUsdMinor}`)??null;
        },
      },
      aiCreditPaymentRiskEvent: {
        createMany: async ({data}:Row) => {
          const row=data[0];if(s.riskEvents.has(row.eventKey))return {count:0};
          s.riskEvents.set(row.eventKey,{...row,id:nextId()});return {count:1};
        },
        findUnique: async ({where}:Row)=>s.riskEvents.get(where.eventKey)??null,
      },
      aiCreditProviderRequest: {
        findUnique: async ({where}:Row) => s.providerRequests.get(where.reservationId) ?? null,
      },
      aiCreditReconciliationCase: {
        createMany: async ({data}:Row) => {
          const found=s.cases.get(data[0].reservationId);
          if (found) return {count:0};
          s.cases.set(data[0].reservationId, {...data[0],id:nextId()});
          return {count:1};
        },
        findUnique: async ({where}:Row) => s.cases.get(where.reservationId) ?? null,
      },
      aiCreditReconciliationEvent: {
        createMany: async ({data}:Row) => {
          const row=data[0];
          if (s.caseEvents.has(row.eventKey)) return {count:0};
          s.caseEvents.set(row.eventKey,{...row,id:nextId()});return {count:1};
        },
      },
    };
  };
  const client = {
    $transaction: async (callback: (tx: ReturnType<typeof createTx>) => Promise<any>) => {
      const pending = queue;
      let unlock!: () => void;
      queue = new Promise<void>(resolve => { unlock = resolve; });
      await pending;
      const copy = structuredClone(state);
      try { const result = await callback(createTx(copy)); state = copy; return result; }
      finally { unlock(); }
    },
    aiCreditLot: {
      findUnique: async ({ where }: Row) => [...state.lots.values()].find(l => l.sourceKey === where.sourceKey) ?? null,
      findMany: async ({ where }: Row) => [...state.lots.values()].filter(l => matches(l, where)),
    },
  } as unknown as PrismaClient;
  return { client, inspect: () => state };
}

const grant = (client: PrismaClient, kind: "subscription" | "purchased", sourceKey: string,
  units: string, expiresAt: Date | null) => grantAiCreditLot({
    client, userId: "user-1", kind, sourceKey, units, expiresAt, now,
    origin: kind === "subscription" ? "verified-subscription-period" : "verified-stripe-payment",
  });
const reserve = (client: PrismaClient, idempotencyKey: string, maximumUnits: string) =>
  reserveAiCredits({ client, userId: "user-1", idempotencyKey, maximumUnits,
    pricingVersionId: "verified-price-1", conversion, now });

describe("atomic AI credit ledger service", () => {
  const receipt = (reservationId:string, costUsdNano="2500000") => ({
    reservationId, provider:"openai", model:"gpt-unit", providerResponseId:"resp-from-https-1",
    clientRequestId:"zb-trace-123",requestSha256:"a".repeat(64),
    receiptPricingVersionId:"verified-price-1",receiptCostUsdNano:costUsdNano,
    receiptUsageSha256:"b".repeat(64),
  });
  it("recovers from an original provider receipt and commits an atomic audit", async () => {
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","payment:recovery","1000000",null);
    await reserve(client,"recover-1","900000");
    const reservation=[...inspect().reservations.values()][0]!;
    inspect().providerRequests.set(reservation.id,receipt(reservation.id));
    expect(await settleAiCreditsFromRecordedProviderReceipt({client,userId:"user-1",idempotencyKey:"recover-1",now}))
      .toMatchObject({created:true,settledUnits:"250000"});
    expect(inspect().caseEvents.size).toBe(1);
    expect(inspect().cases.size).toBe(1);
    expect((await getAiCreditBalance({client,userId:"user-1",now})).reservedUnits).toBe("0");
    expect(await settleAiCreditsFromRecordedProviderReceipt({client,userId:"user-1",idempotencyKey:"recover-1",now}))
      .toMatchObject({created:false,settledUnits:"250000"});
    expect(inspect().caseEvents.size).toBe(1);
  });
  it("refuses recovery for a missing or incomplete original receipt", async () => {
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","payment:missing","1000000",null);
    await reserve(client,"recover-2","900000");
    const id=[...inspect().reservations.values()][0]!.id;
    await expect(settleAiCreditsFromRecordedProviderReceipt({client,userId:"user-1",idempotencyKey:"recover-2",now}))
      .rejects.toThrow("TRUSTED_PROVIDER_RECEIPT_MISSING");
    inspect().providerRequests.set(id,{...receipt(id),receiptUsageSha256:null});
    await expect(settleAiCreditsFromRecordedProviderReceipt({client,userId:"user-1",idempotencyKey:"recover-2",now}))
      .rejects.toThrow("TRUSTED_PROVIDER_RECEIPT_MISSING");
    expect(inspect().caseEvents.size).toBe(0);
    expect((await getAiCreditBalance({client,userId:"user-1",now})).reservedUnits).toBe("900000");
  });
  it("never settles an over-reservation charge from even a trusted receipt", async () => {
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","payment:overspend","1000000",null);
    await reserve(client,"recover-3","500000");
    const id=[...inspect().reservations.values()][0]!.id;
    inspect().providerRequests.set(id,receipt(id,"6000000"));
    await expect(settleAiCreditsFromRecordedProviderReceipt({client,userId:"user-1",idempotencyKey:"recover-3",now}))
      .rejects.toThrow("SETTLEMENT_EXCEEDS_RESERVED");
    expect(inspect().caseEvents.size).toBe(0);
    expect((await getAiCreditBalance({client,userId:"user-1",now})).reservedUnits).toBe("500000");
  });
  it("rolls back credit movement when reconciliation audit cannot be created", async () => {
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","payment:audit","1000000",null);
    await reserve(client,"recover-4","500000");
    const id=[...inspect().reservations.values()][0]!.id;
    inspect().providerRequests.set(id,receipt(id));
    // Pre-existing conflicting audit means the all-or-nothing transaction fails.
    inspect().caseEvents.set(`resolved:original-response:${id}`,{id:"tampered-event"});
    await expect(settleAiCreditsFromRecordedProviderReceipt({client,userId:"user-1",idempotencyKey:"recover-4",now}))
      .rejects.toThrow("RECONCILIATION_AUDIT_CONFLICT");
    expect(inspect().reservations.get(id)?.status).toBe("reserved");
    expect((await getAiCreditBalance({client,userId:"user-1",now})).reservedUnits).toBe("500000");
  });
  const risk = (client: PrismaClient, eventId="evt_risk123") => ({
    client, sourceKey:"stripe:zoebuild:pi:pi_test123", stripeEventId:eventId,
    kind:"refund" as const, providerObjectId:"re_test123",
    paymentIntentId:"pi_test123",chargeId:"ch_test123",
    refundedAmountUsdMinor:1200,chargedAmountUsdMinor:1200,now,
  });
  it("freezes NEW spend and grant after independently verified Stripe risk, retaining in-flight holds",async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","1000000",null);
    await reserve(client,"inflight-before-refund","500000");
    expect(await freezeAiCreditWalletForVerifiedStripeRisk(risk(client)))
      .toEqual({kind:"frozen",created:true});
    expect(inspect().riskEvents.size).toBe(1);
    expect(await freezeAiCreditWalletForVerifiedStripeRisk(risk(client)))
      .toEqual({kind:"frozen",created:false});
    await expect(reserve(client,"new-spend-after-risk","100"))
      .rejects.toThrow("AI_CREDIT_WALLET_RISK_FROZEN");
    await expect(grant(client,"purchased","stripe:zoebuild:pi:pi_another","100",null))
      .rejects.toThrow("AI_CREDIT_WALLET_RISK_FROZEN");
    // Accepted holds still settle; previously consumed credits are never erased.
    await settleAiCredits({client,userId:"user-1",idempotencyKey:"inflight-before-refund",
      pricedUsage:{pricingVersionId:"verified-price-1",costUsdNano:"1000000"},now});
    expect(inspect().riskEvents.size).toBe(1);
    expect([...inspect().lots.values()][0]?.consumedUnits).toBe(100000n);
    expect(inspect().wallets.get("user-1")?.riskFrozenAt).toEqual(now);
  });
  it("reverses cumulative partial refunds once and records remaining shortfall", async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","1000",null);
    await reserve(client,"pre-refund-hold","600");
    const first={...risk(client),refundedAmountUsdMinor:600,chargedAmountUsdMinor:1200};
    await freezeAiCreditWalletForVerifiedStripeRisk(first);
    const lot=[...inspect().lots.values()][0]!;
    expect(lot.availableUnits).toBe(0n);
    expect(lot.reservedUnits).toBe(600n);
    expect(lot.reversedUnits).toBe(400n);
    expect(lot.reversalTargetUnits).toBe(500n);
    expect(lot.reversalShortfallUnits).toBe(100n);
    expect(inspect().reversalSnapshots.size).toBe(1);
    // Duplicate event and a new event for the same cumulative amount cannot debit twice.
    await freezeAiCreditWalletForVerifiedStripeRisk(first);
    await freezeAiCreditWalletForVerifiedStripeRisk({...first,stripeEventId:"evt_another"});
    expect(inspect().reversalSnapshots.size).toBe(1);
    expect([...inspect().lots.values()][0]!.reversedUnits).toBe(400n);
    // Previously held work can settle, while newly released balance is
    // reclaimed inside the settlement transaction before becoming spendable.
    await settleAiCredits({client,userId:"user-1",idempotencyKey:"pre-refund-hold",
      pricedUsage:{pricingVersionId:"verified-price-1",costUsdNano:"100"},now});
    const after=[...inspect().lots.values()][0]!;
    expect(after.consumedUnits).toBe(10n);
    expect(after.reversedUnits).toBe(500n);
    expect(after.reversalShortfallUnits).toBe(0n);
    expect(after.availableUnits).toBe(490n);
    expect(after.availableUnits+after.reservedUnits+after.consumedUnits+
      after.expiredUnits+after.reversedUnits).toBe(after.grantedUnits);
  });
  it("ratchets cumulative partial refund targets without per-event rounding loss",async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","1000",null);
    const partial={...risk(client),refundedAmountUsdMinor:400,chargedAmountUsdMinor:1200};
    await freezeAiCreditWalletForVerifiedStripeRisk(partial);
    let lot=[...inspect().lots.values()][0]!;
    expect(lot.reversedUnits).toBe(333n);
    await freezeAiCreditWalletForVerifiedStripeRisk({...partial,
      refundedAmountUsdMinor:800,stripeEventId:"evt_later"});
    lot=[...inspect().lots.values()][0]!;
    expect(lot.reversedUnits).toBe(666n);
    expect(lot.availableUnits).toBe(334n);
    expect(inspect().reversalSnapshots.size).toBe(2);
    // A stale refund notification cannot reduce an already-applied target.
    await freezeAiCreditWalletForVerifiedStripeRisk({...partial,stripeEventId:"evt_stale"});
    expect([...inspect().lots.values()][0]!.reversedUnits).toBe(666n);
    expect(inspect().reversalSnapshots.size).toBe(2);
    await freezeAiCreditWalletForVerifiedStripeRisk({...partial,
      refundedAmountUsdMinor:1200,stripeEventId:"evt_final"});
    lot=[...inspect().lots.values()][0]!;
    expect(lot.reversedUnits).toBe(1000n);
    expect(lot.availableUnits).toBe(0n);
  });
  it("tracks full-refund shortfall without rewriting past consumed credits", async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","1000",null);
    await reserve(client,"pre-consumption","800");
    await settleAiCredits({client,userId:"user-1",idempotencyKey:"pre-consumption",
      pricedUsage:{pricingVersionId:"verified-price-1",costUsdNano:"5000"},now});
    await freezeAiCreditWalletForVerifiedStripeRisk(risk(client));
    const lot=[...inspect().lots.values()][0]!;
    expect(lot.consumedUnits).toBe(500n);
    expect(lot.reversedUnits).toBe(500n);
    expect(lot.reversalTargetUnits).toBe(1000n);
    expect(lot.reversalShortfallUnits).toBe(500n);
    expect(lot.availableUnits).toBe(0n);
    expect(inspect().reversalSnapshots.size).toBe(1);
  });
  it("keeps disputed credits frozen without claiming the dispute is a confirmed refund", async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","1000",null);
    const disputed={...risk(client),kind:"dispute" as const,
      providerObjectId:"dp_test123",refundedAmountUsdMinor:0};
    await freezeAiCreditWalletForVerifiedStripeRisk(disputed);
    const lot=[...inspect().lots.values()][0]!;
    expect(lot.reversedUnits).toBe(0n);
    expect(lot.availableUnits).toBe(1000n);
    expect(inspect().reversalSnapshots.size).toBe(0);
    expect(inspect().wallets.get("user-1")?.riskFrozenAt).toEqual(now);
  });
  it("refuses forged charged-amount ratios before touching the wallet",async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","1000",null);
    await expect(freezeAiCreditWalletForVerifiedStripeRisk({...risk(client),
      chargedAmountUsdMinor:1000})).rejects.toThrow("STRIPE_RISK_IDENTITY_INVALID");
    expect(inspect().reversalSnapshots.size).toBe(0);
    expect(inspect().wallets.get("user-1")?.riskFrozenAt).toBeNull();
  });
  it("refuses mismatched Stripe funding identity and preserves state", async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","10000",null);
    await expect(freezeAiCreditWalletForVerifiedStripeRisk({...risk(client),paymentIntentId:"pi_wrong"}))
      .rejects.toThrow("STRIPE_RISK_IDENTITY_INVALID");
    expect(inspect().wallets.get("user-1")?.riskFrozenAt).toBeNull();
    expect(inspect().riskEvents.size).toBe(0);
  });
  it("rolls back wallet freeze and debit on a conflicting immutable reversal snapshot", async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","1000",null);
    const lot=[...inspect().lots.values()][0]!;
    inspect().reversalSnapshots.set(`${lot.id}:1200`,{id:"collision",lotId:lot.id,
      chargedAmountUsdMinor:999n,refundedAmountUsdMinor:1200n,targetUnits:1000n});
    await expect(freezeAiCreditWalletForVerifiedStripeRisk(risk(client)))
      .rejects.toThrow("STRIPE_REVERSAL_SNAPSHOT_CONFLICT");
    expect(inspect().wallets.get("user-1")?.riskFrozenAt).toBeNull();
    expect(inspect().lots.get(lot.id)?.availableUnits).toBe(1000n);
    expect(inspect().riskEvents.size).toBe(0);
  });
  it("quarantines only an existing purchased lot and refuses replay audit identity conflicts",async()=>{
    const {client,inspect}=memoryClient();
    expect(await freezeAiCreditWalletForVerifiedStripeRisk(risk(client)))
      .toEqual({kind:"not_funded"});
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","10000",null);
    await freezeAiCreditWalletForVerifiedStripeRisk(risk(client));
    await expect(freezeAiCreditWalletForVerifiedStripeRisk({...risk(client),chargeId:"ch_other"}))
      .rejects.toThrow("STRIPE_RISK_AUDIT_CONFLICT");
    expect(inspect().riskEvents.size).toBe(1);
  });
  it("does not freeze a wallet when its financial-risk audit key conflicts", async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","stripe:zoebuild:pi:pi_test123","10000",null);
    inspect().riskEvents.set("stripe:zoebuild:risk:evt_risk123",{
      lotId:"another-lot",userId:"user-1",kind:"dispute",providerObjectId:"dp_other",
      paymentIntentId:"pi_test123",chargeId:"ch_test123",
    });
    await expect(freezeAiCreditWalletForVerifiedStripeRisk(risk(client)))
      .rejects.toThrow("STRIPE_RISK_AUDIT_CONFLICT");
    expect(inspect().wallets.get("user-1")?.riskFrozenAt).toBeNull();
  });
  it("grants once and reserves subscription before purchased, with exact settlement", async () => {
    const { client, inspect } = memoryClient();
    expect((await grant(client, "subscription", "invoice:1:period:1", "2000000",
      new Date("2026-11-01"))).created).toBe(true);
    expect((await grant(client, "subscription", "invoice:1:period:1", "2000000",
      new Date("2026-11-01"))).created).toBe(false);
    await grant(client, "purchased", "payment:1", "1000000", null);
    expect((await reserve(client, "request-1", "2500000")).created).toBe(true);
    expect((await reserve(client, "request-1", "2500000")).created).toBe(false);
    expect(await getAiCreditBalance({ client, userId: "user-1", now }))
      .toEqual({ subscriptionAvailableUnits: "0", purchasedAvailableUnits: "500000", reservedUnits: "2500000" });
    const result = await settleAiCredits({ client, userId: "user-1", idempotencyKey: "request-1",
      pricedUsage: { pricingVersionId: "verified-price-1", costUsdNano: "5000000" }, now });
    expect(result).toMatchObject({ created: true, settledUnits: "500000" });
    expect((await settleAiCredits({ client, userId: "user-1", idempotencyKey: "request-1",
      pricedUsage: { pricingVersionId: "verified-price-1", costUsdNano: "5000000" }, now })).created).toBe(false);
    expect(await getAiCreditBalance({ client, userId: "user-1", now }))
      .toEqual({ subscriptionAvailableUnits: "1500000", purchasedAvailableUnits: "1000000", reservedUnits: "0" });
    expect(inspect().entries.size).toBe(7); // 2 grants + 2 holds + consume/release on two lots
  });
  it("blocks overspend, duplicate conflicting keys, and unverified release", async () => {
    const { client } = memoryClient();
    await grant(client, "purchased", "payment:2", "1000", null);
    await reserve(client, "request-2", "900");
    await expect(reserve(client, "request-2", "800")).rejects.toThrow("RESERVATION_KEY_CONFLICT");
    await expect(reserve(client, "request-3", "200")).rejects.toThrow("INSUFFICIENT_CREDITS");
    await expect(settleAiCredits({ client, userId: "user-1", idempotencyKey: "request-2",
      pricedUsage: { pricingVersionId: "verified-price-1", costUsdNano: "1000000" }, now }))
      .rejects.toThrow("SETTLEMENT_EXCEEDS_RESERVED");
    expect((await getAiCreditBalance({ client, userId: "user-1", now })).reservedUnits).toBe("900");
    await releaseUnusedAiReservation({ client, userId: "user-1", idempotencyKey: "request-2",
      pricingVersionId: "verified-price-1", providerNotBilledConfirmed: true, now });
    expect((await getAiCreditBalance({ client, userId: "user-1", now })).purchasedAvailableUnits)
      .toBe("1000");
  });
  it("does not reinstate expired subscription units after settlement", async () => {
    const { client } = memoryClient();
    await grant(client, "subscription", "invoice:2:period:1", "1000", new Date("2026-10-20"));
    await reserve(client, "request-4", "800");
    const later = new Date("2026-10-21");
    await settleAiCredits({ client, userId: "user-1", idempotencyKey: "request-4",
      pricedUsage: { pricingVersionId: "verified-price-1", costUsdNano: "1000" }, now: later });
    expect(await getAiCreditBalance({ client, userId: "user-1", now: later }))
      .toEqual({ subscriptionAvailableUnits: "0", purchasedAvailableUnits: "0", reservedUnits: "0" });
  });
  it("rejects a corrupted incomplete reservation allocation and rolls back the settlement",async()=>{
    const {client,inspect}=memoryClient();
    await grant(client,"purchased","payment:allocation-gap","1000",null);
    await reserve(client,"allocation-gap","900");
    const reservation=[...inspect().reservations.values()][0]!;
    const allocation=[...inspect().allocations.values()][0]!;
    // Simulate inconsistent persisted allocation data. The client must not
    // charge missing units or commit only part of the financial transaction.
    allocation.reservedUnits=500n;
    const ledgerEntriesBefore=inspect().entries.size;
    await expect(settleAiCredits({client,userId:"user-1",idempotencyKey:"allocation-gap",
      pricedUsage:{pricingVersionId:"verified-price-1",costUsdNano:"8000"},now}))
      .rejects.toThrow("CREDIT_SETTLEMENT_ALLOCATION_SHORTFALL");
    expect(inspect().entries.size).toBe(ledgerEntriesBefore);
    expect(inspect().reservations.get(reservation.id)?.status).toBe("reserved");
    expect((await getAiCreditBalance({client,userId:"user-1",now})).reservedUnits).toBe("900");
  });
  it("serializes concurrent requests so they cannot double-spend", async () => {
    const { client } = memoryClient();
    await grant(client, "purchased", "payment:3", "1000", null);
    const results = await Promise.allSettled([reserve(client, "parallel-a", "800"),
      reserve(client, "parallel-b", "800")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
});
