/**
 * V12J.8A: canonical AI ledger settlement against real, explicitly confirmed
 * DEVELOPMENT PostgreSQL. Test-only synthetic funding and synthetic provider
 * identity/receipt. Not actual Stripe funding or OpenAI usage verification.
 * All synthetic immutable ledger records remain in the approved DB for audit.
 * Never run against a production DB. Ordinary Vitest runs skip this suite.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@zoeskoul/db";

vi.mock("server-only", () => ({}));
const APPROVAL = "V12J8A_VERIFIED_DEVELOPMENT_DATABASE";
const enabled = process.env.AI_SETTLEMENT_ACCEPTANCE_RUN === APPROVAL &&
  process.env.BILLING_ACCEPTANCE_RUN === "V12J5_VERIFIED_DEVELOPMENT_DATABASE";
const conversion = {
  versionId: "v12j8a-synthetic-priced-usage-v1", creditUnitsPerCredit: "1000000",
  creditValueUsdNano: "10000000", markupNumerator: "1", markupDenominator: "1",
};
const price = conversion.versionId;
type Ledger = typeof import("@zoeskoul/platform-server/ai-credits/ledger");
type Requests = typeof import("../../../../../packages/platform-server/src/ai-credits/aiCreditProviderRequest");

describe.runIf(enabled)("V12J.8A real PostgreSQL synthetic AI credit settlement", () => {
  let db: PrismaClient;
  let ledger: Ledger;
  let requests: Requests;
  const fixtureUsers: string[] = [];
  let connected = false;
  const token = () => randomUUID().replace(/-/g, "");
  const key = (name: string) => `v12j8a:${name}:${token()}`;

  async function createUser() {
    const userId = `pg-ai-v12j8a-${randomUUID()}`;
    await db.user.create({ data: { id: userId } });
    fixtureUsers.push(userId);
    return userId;
  }
  async function grant(userId: string, units = "1000000", kind: "subscription" | "purchased" = "purchased", sourceKey = key("funding")) {
    return ledger.grantAiCreditLot({ client: db, userId, sourceKey, kind,
      origin: kind === "subscription" ? "verified-subscription-period" : "verified-stripe-payment",
      units, expiresAt: kind === "subscription" ? new Date(Date.now() + 30 * 86400000) : null });
  }
  async function reserve(userId: string, idempotencyKey: string, maximumUnits = "700000") {
    return ledger.reserveAiCredits({client: db, userId, idempotencyKey, maximumUnits,
      pricingVersionId: price, conversion});
  }
  async function balance(userId: string) { return ledger.getAiCreditBalance({ client: db, userId }); }
  async function lotSum(userId: string) {
    const lots = await db.aiCreditLot.findMany({ where: { userId } });
    for (const lot of lots) {
      expect(lot.availableUnits + lot.reservedUnits + lot.consumedUnits +
        lot.expiredUnits + lot.reversedUnits).toBe(lot.grantedUnits);
      expect(lot.availableUnits).toBeGreaterThanOrEqual(0n);
      expect(lot.reservedUnits).toBeGreaterThanOrEqual(0n);
    }
    return lots;
  }
  async function recordSyntheticProviderReceipt(userId: string, reservationId: string,
    idempotencyKey: string, costUsdNano: string) {
    // These are *synthetic* original-response identifiers, NOT real provider
    // authentication. This tests only atomic persistence and recovery mechanics.
    const clientRequestId = `client_v12j8a_${token()}`;
    const providerResponseId = `resp_v12j8a_${token()}`;
    await requests.bindAiCreditProviderRequest({client: db, userId, reservationId,
      idempotencyKey, provider: "openai", model: "v12j8a-synthetic-model",
      clientRequestId, requestSha256: "a".repeat(64)});
    await requests.captureAiCreditProviderResponse({client: db, userId, reservationId,
      clientRequestId, providerResponseId, providerHttpRequestId: `req_${token()}`});
    return requests.recordAiCreditPricedProviderReceipt({client: db, userId, reservationId,
      clientRequestId, providerResponseId, pricingVersionId: price,
      costUsdNano, usageSha256: "b".repeat(64)});
  }
  async function syntheticRefund(userId: string, sourceKey: string, paymentIntentId: string,
    eventSuffix: string, cumulativeRefundMinor: number, chargedMinor = 1000,
    chargeId = `ch_v12j8a_${token()}`) {
    const eventId = `evt_v12j8a_${eventSuffix}_${token()}`;
    return ledger.freezeAiCreditWalletForVerifiedStripeRisk({client: db, sourceKey,
      stripeEventId: eventId, kind: "refund", providerObjectId: `re_v12j8a_${token()}`,
      paymentIntentId, chargeId,
      refundedAmountUsdMinor: cumulativeRefundMinor, chargedAmountUsdMinor: chargedMinor});
  }

  beforeAll(async () => {
    // Fail closed on both independently supplied approvals and real DB identity.
    if (!enabled) throw Error("AI_SETTLEMENT_EXPLICIT_APPROVAL_REQUIRED");
    const {preflightBillingDevelopmentDatabase, selectedDevDatabaseUrl} = await import(
      "../../../../../packages/db/scripts/billing-postgres-dev-preflight.mjs");
    const candidate = selectedDevDatabaseUrl();
    const preflight = await preflightBillingDevelopmentDatabase(candidate);
    if (!candidate || !preflight.ok) throw Error("AI_SETTLEMENT_PREFLIGHT_FAILED");
    // The canonical DB factory prefers ADMIN/WEB; pin all to inspected target.
    process.env.ADMIN_DATABASE_URL = candidate;
    process.env.WEB_DATABASE_URL = candidate;
    process.env.DATABASE_URL = candidate;
    const {getPrismaClient} = await import("@zoeskoul/db");
    db = getPrismaClient();
    const rows = await db.$queryRaw<Array<{ database: string; db_role: string;
      server_address: string | null; server_port: number | null; server_started_at: string }>>`
      SELECT current_database() AS database, current_user AS db_role,
      inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
      pg_postmaster_start_time()::text AS server_started_at`;
    if (rows[0]?.database !== preflight.database || rows[0]?.db_role !== preflight.role ||
      rows[0]?.server_address !== preflight.serverAddress ||
      rows[0]?.server_port !== preflight.serverPort ||
      rows[0]?.server_started_at !== preflight.serverStartedAt)
      throw Error("AI_SETTLEMENT_PRISMA_TARGET_MISMATCH");
    connected = true;
    ledger = await import("@zoeskoul/platform-server/ai-credits/ledger");
    requests = await import("../../../../../packages/platform-server/src/ai-credits/aiCreditProviderRequest");
  }, 30000);

  afterAll(async () => {
    if (!connected) return;
    try {
      const ids = [...new Set(fixtureUsers)];
      if (ids.length) {
        if (ids.some(id => !/^pg-ai-v12j8a-[0-9a-f-]{36}$/.test(id)))
          throw Error("AI_SETTLEMENT_FIXTURE_ID_CONFLICT");
        const [users, entries, reservations] = await Promise.all([
          db.user.count({where: {id: {in: ids}}}),
          db.aiCreditLedgerEntry.count({where: {userId: {in: ids}}}),
          db.aiCreditReservation.count({where: {userId: {in: ids}}}),
        ]);
        if (users !== ids.length || entries === 0)
          throw Error("AI_SETTLEMENT_FIXTURE_AUDIT_MISMATCH");
        console.log(`AI_SETTLEMENT_PG_AUDIT_PASS users=${users} reservations=${reservations} ledgerEntries=${entries} retained=YES writes=NO`);
      }
    } finally { await db.$disconnect(); }
  }, 30000);

  it("settles exact priced cost atomically; replay does not double-consume", async () => {
    const id = await createUser();
    await grant(id);
    const idem = key("settle");
    const held = await reserve(id, idem, "500000");
    const result = await ledger.settleAiCredits({client: db, userId: id,
      idempotencyKey: idem, pricedUsage: {pricingVersionId: price, costUsdNano: "2500000"}});
    expect(result).toMatchObject({id: held.id, settledUnits: "250000", created: true});
    expect(await ledger.settleAiCredits({client: db, userId: id,
      idempotencyKey: idem, pricedUsage: {pricingVersionId: price, costUsdNano: "2500000"}}))
      .toMatchObject({id: held.id, settledUnits: "250000", created: false});
    expect(await balance(id)).toMatchObject({purchasedAvailableUnits: "750000", reservedUnits: "0"});
    const rows = await db.aiCreditLedgerEntry.findMany({where: {userId: id}});
    expect(rows.filter(row => row.kind === "consume")).toHaveLength(1);
    expect(rows.filter(row => row.kind === "release")).toHaveLength(1);
    expect((await lotSum(id))[0]?.consumedUnits).toBe(250000n);
  }, 30000);

  it("reserves subscription units first and settles across purchased units deterministically", async () => {
    const id = await createUser();
    await grant(id, "400000", "subscription");
    await grant(id, "400000", "purchased");
    const idem = key("priority");
    await reserve(id, idem, "600000");
    expect((await balance(id)).reservedUnits).toBe("600000");
    await ledger.settleAiCredits({client: db, userId: id, idempotencyKey: idem,
      pricedUsage: {pricingVersionId: price, costUsdNano: "4500000"}});
    const lots = await lotSum(id);
    expect(lots.find(l => l.kind === "subscription")?.consumedUnits).toBe(400000n);
    expect(lots.find(l => l.kind === "purchased")?.consumedUnits).toBe(50000n);
    expect(await balance(id)).toMatchObject({reservedUnits: "0", purchasedAvailableUnits: "350000"});
  }, 30000);

  it("rejects unfunded reservation without creating financial movement", async () => {
    const id = await createUser();
    await expect(reserve(id, key("unfunded"))).rejects.toThrow("INSUFFICIENT_CREDITS");
    expect(await db.aiCreditReservation.count({where: {userId: id}})).toBe(0);
    expect(await db.aiCreditLedgerEntry.count({where: {userId: id}})).toBe(0);
    // No synthetic grant is needed: the user identity alone remains for audit.
  }, 30000);

  it("keeps uncertain dispatch held and forbids unverified release", async () => {
    const id = await createUser();
    await grant(id);
    const idem = key("uncertain");
    const reservation = await reserve(id, idem, "600000");
    const clientRequestId = `client_v12j8a_${token()}`;
    await requests.bindAiCreditProviderRequest({client: db, userId: id,
      reservationId: reservation.id, idempotencyKey: idem, provider: "openai",
      model: "v12j8a-synthetic-model", clientRequestId, requestSha256: "a".repeat(64)});
    await expect(ledger.settleAiCreditsFromRecordedProviderReceipt({client: db,
      userId: id, idempotencyKey: idem})).rejects.toThrow("TRUSTED_PROVIDER_RECEIPT_MISSING");
    // This guard is synchronous: the invalid provider evidence is rejected
    // before any transaction or Promise is created.
    expect(() => ledger.releaseUnusedAiReservation({client: db, userId: id,
      idempotencyKey: idem, pricingVersionId: price,
      providerNotBilledConfirmed: false as never})).toThrow("RELEASE_NOT_VERIFIED");
    expect(await balance(id)).toMatchObject({purchasedAvailableUnits: "400000", reservedUnits: "600000"});
    expect((await db.aiCreditReservation.findUniqueOrThrow({where: {id: reservation.id}})).status).toBe("reserved");
    await lotSum(id);
  }, 30000);

  it("records synthetic original-response receipt and recovers settlement with one immutable audit", async () => {
    const id = await createUser();
    await grant(id);
    const idem = key("receipt");
    const reservation = await reserve(id, idem, "700000");
    expect(await recordSyntheticProviderReceipt(id, reservation.id, idem, "2000000"))
      .toEqual({recorded: true});
    const recovered = await ledger.settleAiCreditsFromRecordedProviderReceipt({client: db,
      userId: id, idempotencyKey: idem});
    expect(recovered).toMatchObject({settledUnits: "200000", created: true});
    expect(await ledger.settleAiCreditsFromRecordedProviderReceipt({client: db,
      userId: id, idempotencyKey: idem})).toMatchObject({settledUnits: "200000", created: false});
    expect(await balance(id)).toMatchObject({purchasedAvailableUnits: "800000", reservedUnits: "0"});
    const audit = await db.aiCreditReconciliationCase.findUniqueOrThrow({
      where: {reservationId: reservation.id}, include: {events: true}});
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]?.reasonCode).toBe("AI_RECONCILIATION_ORIGINAL_RESPONSE_SETTLED");
    await lotSum(id);
  }, 30000);

  it("rejects over-ceiling synthetic priced receipt and leaves reservation held", async () => {
    const id = await createUser();
    await grant(id);
    const idem = key("too-high");
    const reservation = await reserve(id, idem, "700000");
    await recordSyntheticProviderReceipt(id, reservation.id, idem, "10000000");
    const before = await db.aiCreditLedgerEntry.count({where: {userId: id}});
    await expect(ledger.settleAiCreditsFromRecordedProviderReceipt({client: db,
      userId: id, idempotencyKey: idem})).rejects.toThrow("SETTLEMENT_EXCEEDS_RESERVED");
    expect(await db.aiCreditLedgerEntry.count({where: {userId: id}})).toBe(before);
    expect(await db.aiCreditReconciliationCase.count({where: {userId: id}})).toBe(0);
    expect(await balance(id)).toMatchObject({purchasedAvailableUnits: "300000", reservedUnits: "700000"});
    await lotSum(id);
  }, 30000);

  it("follows cumulative synthetic refund evidence, freezes wallet and does not double-reverse", async () => {
    const id = await createUser();
    const pi = `pi_v12j8a_${token()}`;
    const sourceKey = `stripe:zoebuild:pi:${pi}`;
    await grant(id, "1000000", "purchased", sourceKey);
    const first = await syntheticRefund(id, sourceKey, pi, "quarter", 250);
    expect(first).toMatchObject({kind: "frozen", created: true});
    const lot = (await lotSum(id))[0]!;
    expect(lot.reversedUnits).toBe(250000n);
    expect(lot.availableUnits).toBe(750000n);
    expect((await db.aiCreditWallet.findUniqueOrThrow({where: {userId: id}})).riskFrozenAt).not.toBeNull();
    await expect(reserve(id, key("frozen"), "100000")).rejects.toThrow("AI_CREDIT_WALLET_RISK_FROZEN");
    const event = await db.aiCreditPaymentRiskEvent.findFirstOrThrow({where: {userId: id}});
    const replay = await ledger.freezeAiCreditWalletForVerifiedStripeRisk({client: db,
      sourceKey, stripeEventId: event.eventKey.replace(/^stripe:zoebuild:risk:/, ""),
      kind: "refund", providerObjectId: event.providerObjectId, paymentIntentId: pi,
      chargeId: event.chargeId, refundedAmountUsdMinor: 250, chargedAmountUsdMinor: 1000});
    expect(replay).toMatchObject({kind: "frozen", created: false});
    expect((await lotSum(id))[0]?.reversedUnits).toBe(250000n);
    await syntheticRefund(id, sourceKey, pi, "half", 500, 1000, event.chargeId);
    expect((await lotSum(id))[0]?.reversedUnits).toBe(500000n);
    expect(await db.aiCreditPaymentReversalSnapshot.count({where: {lotId: lot.id}})).toBe(2);
  }, 30000);

  it("records refund shortfall against held units, then claws back on verified release", async () => {
    const id = await createUser();
    const pi = `pi_v12j8a_${token()}`;
    const sourceKey = `stripe:zoebuild:pi:${pi}`;
    await grant(id, "1000000", "purchased", sourceKey);
    const idem = key("held-refund");
    await reserve(id, idem, "800000");
    await syntheticRefund(id, sourceKey, pi, "half", 500);
    const lot = (await lotSum(id))[0]!;
    expect(lot.reversedUnits).toBe(200000n);
    expect(lot.reversalShortfallUnits).toBe(300000n);
    expect(lot.reservedUnits).toBe(800000n);
    await ledger.releaseUnusedAiReservation({client: db, userId: id, idempotencyKey: idem,
      pricingVersionId: price, providerNotBilledConfirmed: true});
    const after = (await lotSum(id))[0]!;
    expect(after.reversedUnits).toBe(500000n);
    expect(after.reversalShortfallUnits).toBe(0n);
    expect(after.availableUnits).toBe(500000n);
    expect(after.reservedUnits).toBe(0n);
    expect(await balance(id)).toMatchObject({reservedUnits: "0", purchasedAvailableUnits: "500000"});
  }, 30000);

  it("refuses cross-user settlement and preserves original owner's held units", async () => {
    const id = await createUser();
    const other = await createUser();
    await grant(id);
    const idem = key("foreign");
    await reserve(id, idem, "500000");
    await expect(ledger.settleAiCredits({client: db, userId: other,
      idempotencyKey: idem, pricedUsage: {pricingVersionId: price, costUsdNano: "1000000"}}))
      .rejects.toThrow("RESERVATION_NOT_FOUND");
    expect(await balance(id)).toMatchObject({purchasedAvailableUnits: "500000", reservedUnits: "500000"});
    expect(await db.aiCreditLedgerEntry.count({where: {userId: other}})).toBe(0);
    await lotSum(id);
  }, 30000);
});
