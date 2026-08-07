import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  STRIPE_EVENT_ERROR_MAX_LENGTH,
  claimStripeEvent,
  stripeEventErrorText,
  type StripeEventLedgerClient,
} from "./stripeEventLedger";

function client(args: {
  create?: StripeEventLedgerClient["stripeEvent"]["create"];
  findUnique?: StripeEventLedgerClient["stripeEvent"]["findUnique"];
  updateMany?: StripeEventLedgerClient["stripeEvent"]["updateMany"];
}): StripeEventLedgerClient {
  return {
    stripeEvent: {
      create:
        args.create ??
        (vi.fn(
          async ({ data }: Parameters<
            StripeEventLedgerClient["stripeEvent"]["create"]
          >[0]) => ({
            id: data.id,
            status: data.status,
            attemptCount: data.attemptCount,
            updatedAt: data.updatedAt,
          }),
        ) as StripeEventLedgerClient["stripeEvent"]["create"]),
      findUnique:
        args.findUnique ??
        (vi.fn(async () => null) as StripeEventLedgerClient["stripeEvent"]["findUnique"]),
      updateMany:
        args.updateMany ??
        (vi.fn(async () => ({ count: 0 })) as StripeEventLedgerClient["stripeEvent"]["updateMany"]),
    },
  };
}

const input = {
  id: "evt_1",
  type: "customer.subscription.updated",
  livemode: false,
  created: 123,
  objectId: "sub_1",
  customerId: "cus_1",
  subscriptionId: "sub_1",
};

function uniqueConflict() {
  return Object.assign(new Error("unique"), { code: "P2002" });
}

describe("claimStripeEvent", () => {
  it("claims a first delivery", async () => {
    const store = client({});

    await expect(
      claimStripeEvent(input, {
        client: store,
        now: new Date("2026-08-06T20:00:00.000Z"),
      }),
    ).resolves.toEqual({
      kind: "claimed",
      recovered: false,
      attemptCount: 1,
    });
  });

  it.each(["processed", "ignored"] as const)(
    "treats %s rows as terminal duplicates",
    async (status) => {
      const store = client({
        create: vi.fn(async () => {
          throw uniqueConflict();
        }),
        findUnique: vi.fn(async () => ({
          id: input.id,
          status,
          attemptCount: 1,
          updatedAt: new Date("2026-08-06T20:00:00.000Z"),
        })),
      });

      await expect(claimStripeEvent(input, { client: store })).resolves.toEqual({
        kind: "duplicate",
        status,
      });
    },
  );

  it("reclaims a failed event atomically", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const store = client({
      create: vi.fn(async () => {
        throw uniqueConflict();
      }),
      findUnique: vi.fn(async () => ({
        id: input.id,
        status: "failed",
        attemptCount: 2,
        updatedAt: new Date("2026-08-06T19:00:00.000Z"),
      })),
      updateMany,
    });

    await expect(claimStripeEvent(input, { client: store })).resolves.toEqual({
      kind: "claimed",
      recovered: true,
      attemptCount: 3,
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: input.id, status: "failed", attemptCount: 2 },
        data: expect.objectContaining({
          status: "processing",
          attemptCount: { increment: 1 },
        }),
      }),
    );
  });

  it("reclaims processing rows older than five minutes", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const now = new Date("2026-08-06T20:10:00.000Z");
    const store = client({
      create: vi.fn(async () => {
        throw uniqueConflict();
      }),
      findUnique: vi.fn(async () => ({
        id: input.id,
        status: "processing",
        attemptCount: 4,
        updatedAt: new Date("2026-08-06T20:00:00.000Z"),
      })),
      updateMany,
    });

    await expect(
      claimStripeEvent(input, { client: store, now }),
    ).resolves.toEqual({
      kind: "claimed",
      recovered: true,
      attemptCount: 5,
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: input.id,
          status: "processing",
          attemptCount: 4,
          updatedAt: { lte: new Date("2026-08-06T20:05:00.000Z") },
        },
      }),
    );
  });

  it("does not claim a fresh processing row concurrently", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const store = client({
      create: vi.fn(async () => {
        throw uniqueConflict();
      }),
      findUnique: vi.fn(async () => ({
        id: input.id,
        status: "processing",
        attemptCount: 7,
        updatedAt: new Date("2026-08-06T20:09:00.000Z"),
      })),
      updateMany,
    });

    await expect(
      claimStripeEvent(input, {
        client: store,
        now: new Date("2026-08-06T20:10:00.000Z"),
      }),
    ).resolves.toEqual({ kind: "in_progress" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("requires the active attempt when marking terminal state", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const store = client({ updateMany });

    const { markStripeEventProcessed } = await import("./stripeEventLedger");
    await expect(
      markStripeEventProcessed("evt_1", 2, { client: store }),
    ).resolves.toBe(false);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt_1", status: "processing", attemptCount: 2 },
      }),
    );
  });
});

describe("stripeEventErrorText", () => {
  it("bounds persisted errors", () => {
    const text = stripeEventErrorText(new Error("x".repeat(5000)));
    expect(text).toHaveLength(STRIPE_EVENT_ERROR_MAX_LENGTH);
  });
});
