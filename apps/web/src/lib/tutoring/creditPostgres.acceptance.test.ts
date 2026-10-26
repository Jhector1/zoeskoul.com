/**
 * V12I.4 REAL POSTGRES acceptance. This file is inert during normal Vitest runs.
 * It REQUIRES an explicit, independently provisioned and marked disposable DB.
 * Does not contact Stripe, AI providers, or mutate any application database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@zoeskoul/db";
import type { TutoringCommercialDb } from "./tutoringCommercial";

vi.mock("server-only", () => ({}));

const DISPOSABLE_APPROVAL = "V12I4_DISPOSABLE_DATABASE_ONLY";
const DEV_APPROVAL = "V12I4_VERIFIED_DEVELOPMENT_DATABASE";
const acceptanceMode = process.env.CREDIT_ACCEPTANCE_RUN;
const enabled = acceptanceMode === DISPOSABLE_APPROVAL || acceptanceMode === DEV_APPROVAL;
const conversion = {
  versionId: "pg-acceptance-conversion-v1", creditUnitsPerCredit: "1",
  creditValueUsdNano: "1", markupNumerator: "1", markupDenominator: "1",
};

type Tutoring = typeof import("./tutoringCommercial");
type Ai = typeof import("@zoeskoul/platform-server/ai-credits/ledger");

// `describe.runIf` ensures ordinary monorepo test runs cannot accidentally spend credits.
describe.runIf(enabled)("V12I.4 real PostgreSQL credit concurrency acceptance", () => {
  let db: PrismaClient;
  let tutoring: Tutoring;
  let ai: Ai;
  const testUsers: string[] = [];
  let validated = false;
  const key = (kind: string) => `pg-acceptance:${kind}:${randomUUID()}`;

  async function user() {
    const id = `pg-credit-${randomUUID()}`;
    await db.user.create({ data: { id } });
    testUsers.push(id);
    return id;
  }
  async function request(learnerId: string, minutes = 60) {
    return db.tutoringRequest.create({ data: {
      learnerId, requestAttemptId: randomUUID(), requestedMinutes: minutes,
    } });
  }
  const tutoringDb = () => db as unknown as TutoringCommercialDb;
  async function tutorGrant(userId: string, minutes: number) {
    return tutoring.grantTutoringMinutes({
      userId, minutes, kind: "admin_grant", idempotencyKey: key("tutor-grant"),
    }, { db: tutoringDb() });
  }
  async function aiGrant(userId: string, units: string) {
    return ai.grantAiCreditLot({ client: db, userId, sourceKey: key("ai-grant"),
      kind: "purchased", origin: "verified-stripe-payment", units, expiresAt: null });
  }
  async function aiReserve(userId: string, idempotencyKey: string, units: string) {
    return ai.reserveAiCredits({ client: db, userId, idempotencyKey,
      maximumUnits: units, pricingVersionId: conversion.versionId, conversion });
  }

  beforeAll(async () => {
    // Fail closed BEFORE importing/initializing Prisma or the app's lazy client.
    let candidate: string | undefined;
    let preflight: { ok: true; database: string; role?: string;
      serverAddress?: string | null; serverPort?: number | null; serverStartedAt?: string };
    if (acceptanceMode === DEV_APPROVAL) {
      // Use exactly the already configured app DB connection, only after
      // explicit manual identity confirmation and a read-only PG inspection.
      candidate = process.env.ADMIN_DATABASE_URL || process.env.WEB_DATABASE_URL || process.env.DATABASE_URL;
      const { preflightDevelopmentCreditAcceptance } = await import(
        "../../../../../packages/db/scripts/credit-postgres-dev-preflight.mjs");
      preflight = await preflightDevelopmentCreditAcceptance(candidate);
    } else {
      // Retain the separately isolated disposable-database acceptance mode.
      candidate = process.env.CREDIT_ACCEPTANCE_DATABASE_URL;
      const { preflightCreditAcceptance } = await import(
        "../../../../../packages/db/scripts/credit-postgres-acceptance-preflight.mjs");
      const existing = [process.env.DATABASE_URL, process.env.WEB_DATABASE_URL,
        process.env.ADMIN_DATABASE_URL].filter(Boolean);
      if (!candidate || existing.includes(candidate)) throw Error("ACCEPTANCE_DATABASE_NOT_SEPARATELY_CONFIGURED");
      preflight = await preflightCreditAcceptance(candidate);
    }
    if (!candidate || !preflight.ok) throw Error("ACCEPTANCE_PREFLIGHT_FAILED");
    // The @zoeskoul/db client chooses ADMIN/WEB before DATABASE_URL.
    process.env.ADMIN_DATABASE_URL = candidate;
    process.env.WEB_DATABASE_URL = candidate;
    process.env.DATABASE_URL = candidate;
    const { getPrismaClient } = await import("@zoeskoul/db");
    db = getPrismaClient();
    const actualTarget = await db.$queryRaw<Array<{ database: string; db_role: string;
      server_address: string | null; server_port: number | null; server_started_at: string }>>`
      SELECT current_database() AS database, current_user AS db_role,
             inet_server_addr()::text AS server_address,
             inet_server_port() AS server_port,
             pg_postmaster_start_time()::text AS server_started_at`;
    if (actualTarget[0]?.database !== preflight.database) throw Error("PRISMA_POOL_TARGET_MISMATCH");
    if (acceptanceMode === DEV_APPROVAL && (
      actualTarget[0]?.db_role !== preflight.role ||
      actualTarget[0]?.server_address !== preflight.serverAddress ||
      actualTarget[0]?.server_port !== preflight.serverPort ||
      actualTarget[0]?.server_started_at !== preflight.serverStartedAt
    )) throw Error("PRISMA_POOL_SERVER_OR_ROLE_MISMATCH");
    validated = true;
    tutoring = await import("./tutoringCommercial");
    ai = await import("@zoeskoul/platform-server/ai-credits/ledger");
  }, 30000);

  afterAll(async () => {
    if (!validated) return;
    // The AI ledger is append-only by database design. Never delete financial
    // records, disable triggers, or cascade-delete their owning test users.
    // Retain uniquely prefixed synthetic fixtures for an auditable dev run.
    // This audit is read-only and scoped strictly to IDs created by this run.
    try {
      if (testUsers.length) {
        const ids = [...new Set(testUsers)];
        const [users, aiEntries, tutoringEntries] = await Promise.all([
          db.user.count({ where: { id: { in: ids } } }),
          db.aiCreditLedgerEntry.count({ where: { userId: { in: ids } } }),
          db.tutoringCreditLedgerEntry.count({ where: { userId: { in: ids } } }),
        ]);
        if (users !== ids.length) throw Error("ACCEPTANCE_FIXTURE_USER_AUDIT_MISMATCH");
        if (ids.some(id => !/^pg-credit-[0-9a-f-]{36}$/.test(id))) {
          throw Error("ACCEPTANCE_FIXTURE_ID_AUDIT_MISMATCH");
        }
        console.log(`CREDIT_PG_FIXTURE_AUDIT_PASS users=${users} aiLedgerEntries=${aiEntries} tutoringLedgerEntries=${tutoringEntries} retained=YES writes=NO`);
      }
    } finally {
      await db.$disconnect();
    }
  }, 45000);

  it("tutoring: concurrent distinct reservations cannot overspend 60 minutes", async () => {
    const id = await user();
    await tutorGrant(id, 60);
    const a = await request(id), b = await request(id);
    const results = await Promise.allSettled([a, b].map(r =>
      tutoring.ensureTutoringRequestCreditsReserved({ requestId: r.id, learnerId: id,
        requestedMinutes: 60 }, { db: tutoringDb() })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(await tutoring.getTutoringCreditBalance(id, { db: tutoringDb() }))
      .toEqual({ availableMinutes: 0, reservedMinutes: 60, totalMinutes: 60 });
    const reservations = await db.tutoringCreditLedgerEntry.count({
      where: { userId: id, kind: "reservation" },
    });
    expect(reservations).toBe(1);
  }, 30000);

  it("tutoring: same request retries do not double-reserve; release restores exact balance", async () => {
    const id = await user();
    await tutorGrant(id, 120);
    const r = await request(id);
    const args = { requestId: r.id, learnerId: id, requestedMinutes: 60 };
    await tutoring.ensureTutoringRequestCreditsReserved(args, { db: tutoringDb() });
    await tutoring.ensureTutoringRequestCreditsReserved(args, { db: tutoringDb() });
    expect(await tutoring.getTutoringCreditBalance(id, { db: tutoringDb() }))
      .toEqual({ availableMinutes: 60, reservedMinutes: 60, totalMinutes: 120 });
    expect((await tutoring.releaseTutoringRequestCredits({ requestId: r.id, learnerId: id },
      { db: tutoringDb() })).releasedReservedMinutes).toBe(true);
    expect(await tutoring.getTutoringCreditBalance(id, { db: tutoringDb() }))
      .toEqual({ availableMinutes: 120, reservedMinutes: 0, totalMinutes: 120 });
    expect(await db.tutoringCreditLedgerEntry.count({ where: { userId: id, kind: "reservation" } })).toBe(1);
    expect(await db.tutoringCreditLedgerEntry.count({ where: { userId: id, kind: "reservation_release" } })).toBe(1);
  }, 30000);

  it("tutoring: pending refund hold reduces spendable minutes, never reserved minutes", async () => {
    const id = await user();
    await tutorGrant(id, 90);
    const purchase = await db.tutoringCreditPurchase.create({ data: {
      userId: id, checkoutAttemptId: randomUUID(), packageMinutes: 90,
      amountMinor: 900, currency: "usd", status: "paid",
    } });
    await db.tutoringCreditRefund.create({ data: {
      purchaseId: purchase.id, userId: id, refundAttemptId: randomUUID(),
      minutes: 30, amountMinor: 300, currency: "usd", status: "pending",
    } });
    expect(await tutoring.getTutoringCreditBalance(id, { db: tutoringDb() }))
      .toEqual({ availableMinutes: 60, reservedMinutes: 0, totalMinutes: 60 });
    const r = await request(id);
    await tutoring.ensureTutoringRequestCreditsReserved({ requestId: r.id,
      learnerId: id, requestedMinutes: 60 }, { db: tutoringDb() });
    expect(await tutoring.getTutoringCreditBalance(id, { db: tutoringDb() }))
      .toEqual({ availableMinutes: 0, reservedMinutes: 60, totalMinutes: 60 });
  }, 30000);

  it("tutoring: forced PostgreSQL transaction rollback leaves no partial ledger entry", async () => {
    const id = await user();
    const eventKey = key("rolled-back");
    await expect(db.$transaction(async tx => {
      await tx.tutoringCreditLedgerEntry.create({ data: { userId: id,
        idempotencyKey: eventKey, kind: "admin_grant", availableMinutesDelta: 30 } });
      throw Error("FORCED_ROLLBACK");
    })).rejects.toThrow("FORCED_ROLLBACK");
    expect(await db.tutoringCreditLedgerEntry.count({ where: { idempotencyKey: eventKey } })).toBe(0);
  });

  it("AI: two concurrent independent 70-unit reservations cannot spend the same 100 units", async () => {
    const id = await user();
    await aiGrant(id, "100");
    const results = await Promise.allSettled([
      aiReserve(id, key("ai-reserve-a"), "70"),
      aiReserve(id, key("ai-reserve-b"), "70"),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(await ai.getAiCreditBalance({ client: db, userId: id }))
      .toMatchObject({ purchasedAvailableUnits: "30", reservedUnits: "70" });
    const lot = await db.aiCreditLot.findFirstOrThrow({ where: { userId: id } });
    expect(lot.availableUnits + lot.reservedUnits + lot.consumedUnits + lot.expiredUnits + lot.reversedUnits)
      .toBe(lot.grantedUnits);
  }, 30000);

  it("AI: same idempotency key reuses one reservation, then verified zero-cost release returns units", async () => {
    const id = await user();
    await aiGrant(id, "100");
    const reservationKey = key("ai-idempotent");
    const first = await aiReserve(id, reservationKey, "70");
    const repeated = await aiReserve(id, reservationKey, "70");
    expect(first.id).toBe(repeated.id);
    expect(repeated.created).toBe(false);
    expect(await db.aiCreditReservation.count({ where: { userId: id } })).toBe(1);
    await ai.releaseUnusedAiReservation({ client: db, userId: id,
      idempotencyKey: reservationKey, pricingVersionId: conversion.versionId,
      providerNotBilledConfirmed: true });
    expect(await ai.getAiCreditBalance({ client: db, userId: id }))
      .toMatchObject({ purchasedAvailableUnits: "100", reservedUnits: "0" });
  }, 30000);

  it("AI: allocation shortfall aborts provider-priced settlement and rolls back all lot/ledger writes", async () => {
    const id = await user();
    await aiGrant(id, "100");
    const reservationKey = key("ai-rollback");
    const reservation = await aiReserve(id, reservationKey, "90");
    const original = await db.aiCreditReservationAllocation.findFirstOrThrow({
      where: { reservationId: reservation.id },
    });
    // Deliberately corrupt ONLY this disposable fixture, never a live record.
    await db.aiCreditReservationAllocation.update({
      where: { reservationId_lotId: { reservationId: reservation.id, lotId: original.lotId } },
      data: { reservedUnits: 50n },
    });
    const before = await db.aiCreditLedgerEntry.count({ where: { userId: id } });
    const lotBefore = await db.aiCreditLot.findFirstOrThrow({ where: { userId: id } });
    await expect(ai.settleAiCredits({ client: db, userId: id,
      idempotencyKey: reservationKey,
      pricedUsage: { pricingVersionId: conversion.versionId, costUsdNano: "80" } }))
      .rejects.toThrow("CREDIT_SETTLEMENT_ALLOCATION_SHORTFALL");
    expect(await db.aiCreditLedgerEntry.count({ where: { userId: id } })).toBe(before);
    const lotAfter = await db.aiCreditLot.findFirstOrThrow({ where: { userId: id } });
    expect(lotAfter.availableUnits).toBe(lotBefore.availableUnits);
    expect(lotAfter.reservedUnits).toBe(lotBefore.reservedUnits);
    expect((await db.aiCreditReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status)
      .toBe("reserved");
  }, 30000);

  it("separate tutoring minutes and AI units never cross-subsidize a user's other wallet", async () => {
    const id = await user();
    await tutorGrant(id, 60);
    await aiGrant(id, "100");
    const r = await request(id);
    await tutoring.ensureTutoringRequestCreditsReserved({ requestId: r.id, learnerId: id,
      requestedMinutes: 60 }, { db: tutoringDb() });
    expect(await ai.getAiCreditBalance({ client: db, userId: id }))
      .toMatchObject({ purchasedAvailableUnits: "100", reservedUnits: "0" });
  }, 30000);
});
