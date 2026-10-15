import { describe, expect, it, vi } from "vitest";

import { FeatureKey, type PrismaClient } from "@zoeskoul/db";

vi.mock("server-only", () => ({}));

import {
  canonicalUserActorKey,
  deterministicFeatureGrantId,
  reconcileFeatureGrant,
} from "./reconcileFeatureGrant";

function client() {
  return {
    featureGrant: {
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  } as unknown as PrismaClient;
}

describe("canonical FeatureGrant reconciler", () => {
  it("uses the canonical hashed user actor-key format", () => {
    expect(canonicalUserActorKey("user_1")).toMatch(/^u:[0-9a-f]{64}$/);
    expect(canonicalUserActorKey(" user_1 ")).toBe(
      canonicalUserActorKey("user_1"),
    );
  });

  it("uses one deterministic row identity for concurrent convergence paths", () => {
    expect(
      deterministicFeatureGrantId({
        userId: "user_1",
        feature: FeatureKey.build_ai_generate,
        type: "subscription",
      }),
    ).toBe(
      deterministicFeatureGrantId({
        userId: "user_1",
        feature: FeatureKey.build_ai_generate,
        type: "subscription",
      }),
    );
  });

  it("upserts an active typed grant and clears revocation", async () => {
    const store = client();
    const now = new Date("2026-10-15T06:00:00.000Z");
    const endsAt = new Date("2026-11-15T06:00:00.000Z");

    const result = await reconcileFeatureGrant({
      client: store,
      userId: " user_1 ",
      actorKey: "u:actor",
      feature: FeatureKey.build_ai_generate,
      type: "subscription",
      active: true,
      now,
      endsAt,
      meta: { source: "billing_subscription" },
    });

    expect(result.active).toBe(true);
    expect(store.featureGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user_1",
          actorKey: "u:actor",
          feature: FeatureKey.build_ai_generate,
          type: "subscription",
          revokedAt: null,
          endsAt,
        }),
        update: expect.objectContaining({
          revokedAt: null,
          endsAt,
        }),
      }),
    );
  });

  it("revokes only the deterministic owned row when access ends", async () => {
    const store = client();
    const now = new Date("2026-10-15T06:00:00.000Z");

    const result = await reconcileFeatureGrant({
      client: store,
      userId: "user_1",
      actorKey: "u:actor",
      feature: FeatureKey.build_ai_generate,
      type: "subscription",
      active: false,
      now,
    });

    expect(result).toMatchObject({ active: false, changed: true });
    expect(store.featureGrant.updateMany).toHaveBeenCalledWith({
      where: {
        id: result.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        endsAt: now,
      },
    });
  });
});
