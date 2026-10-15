import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeatureKey, type PrismaClient } from "@zoeskoul/db";

const mocks = vi.hoisted(() => ({
  reconcileFeatureGrant: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@zoeskoul/platform-server/access/reconcileFeatureGrant", () => ({
  canonicalUserActorKey: (_userId: string) => `u:${"a".repeat(64)}`,
  reconcileFeatureGrant: mocks.reconcileFeatureGrant,
}));

import { reconcileBuildAiSubscriptionGrantForUser } from "./buildAiFeatureGrant";

function client(rows: Array<{
  status:
    | "trialing"
    | "active"
    | "past_due"
    | "unpaid"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "paused";
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
}>) {
  return {
    subscription: {
      findMany: vi.fn(async () => rows),
    },
  } as unknown as PrismaClient;
}

describe("Build AI subscription FeatureGrant projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reconcileFeatureGrant.mockResolvedValue({
      id: "fg_1",
      active: true,
      changed: true,
    });
  });

  it("grants while an active subscription is within its billing period", async () => {
    const now = new Date("2026-10-15T06:00:00.000Z");
    const periodEnd = new Date("2026-11-15T06:00:00.000Z");
    const store = client([
      {
        status: "active",
        trialEnd: null,
        currentPeriodEnd: periodEnd,
      },
    ]);

    await reconcileBuildAiSubscriptionGrantForUser("user_1", {
      client: store,
      now,
    });

    expect(mocks.reconcileFeatureGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        client: store,
        userId: "user_1",
        actorKey: expect.stringMatching(/^u:[0-9a-f]{64}$/),
        feature: FeatureKey.build_ai_generate,
        type: "subscription",
        active: true,
        endsAt: periodEnd,
        now,
      }),
    );
  });

  it("uses the trial end for an entitled trial", async () => {
    const now = new Date("2026-10-15T06:00:00.000Z");
    const trialEnd = new Date("2026-10-22T06:00:00.000Z");

    await reconcileBuildAiSubscriptionGrantForUser("user_1", {
      client: client([
        {
          status: "trialing",
          trialEnd,
          currentPeriodEnd: new Date("2026-11-15T06:00:00.000Z"),
        },
      ]),
      now,
    });

    expect(mocks.reconcileFeatureGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        endsAt: trialEnd,
      }),
    );
  });

  it("revokes when no local subscription is currently entitled", async () => {
    const now = new Date("2026-10-15T06:00:00.000Z");

    await reconcileBuildAiSubscriptionGrantForUser("user_1", {
      client: client([
        {
          status: "active",
          trialEnd: null,
          currentPeriodEnd: new Date("2026-10-14T06:00:00.000Z"),
        },
        {
          status: "unpaid",
          trialEnd: null,
          currentPeriodEnd: new Date("2026-11-15T06:00:00.000Z"),
        },
      ]),
      now,
    });

    expect(mocks.reconcileFeatureGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        active: false,
        endsAt: null,
      }),
    );
  });
});
