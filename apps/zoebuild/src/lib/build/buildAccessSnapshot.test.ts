import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeatureKey } from "@zoeskoul/db";

const mocks = vi.hoisted(() => ({
  featureGrantFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@zoeskoul/platform-server/prisma", () => ({
  prisma: {
    featureGrant: {
      findMany: mocks.featureGrantFindMany,
    },
  },
}));

import { loadBuildAccessSnapshot } from "./buildAccessSnapshot";

describe("ZoeBuild FeatureGrant entitlement adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not query FeatureGrant for an unauthenticated/blank user id", async () => {
    await expect(loadBuildAccessSnapshot("   ")).resolves.toEqual({
      userId: null,
      entitlements: [],
    });
    expect(mocks.featureGrantFindMany).not.toHaveBeenCalled();
  });

  it("maps an active canonical FeatureGrant to build_ai_generate", async () => {
    const now = Date.now();
    mocks.featureGrantFindMany.mockResolvedValue([
      {
        feature: FeatureKey.build_ai_generate,
        startsAt: new Date(now - 60_000),
        endsAt: new Date(now + 60_000),
      },
    ]);

    await expect(loadBuildAccessSnapshot(" user_1 ")).resolves.toEqual({
      userId: "user_1",
      entitlements: ["build_ai_generate"],
    });

    expect(mocks.featureGrantFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        feature: { in: [FeatureKey.build_ai_generate, FeatureKey.build_ai_edit] },
        revokedAt: null,
      },
      select: {
        feature: true,
        startsAt: true,
        endsAt: true,
      },
    });
  });

  it("fails closed for a grant that has not started yet", async () => {
    const now = Date.now();
    mocks.featureGrantFindMany.mockResolvedValue([
      {
        feature: FeatureKey.build_ai_generate,
        startsAt: new Date(now + 60_000),
        endsAt: new Date(now + 120_000),
      },
    ]);

    await expect(loadBuildAccessSnapshot("user_1")).resolves.toEqual({
      userId: "user_1",
      entitlements: [],
    });
  });

  it("fails closed for an expired grant", async () => {
    const now = Date.now();
    mocks.featureGrantFindMany.mockResolvedValue([
      {
        feature: FeatureKey.build_ai_generate,
        startsAt: new Date(now - 120_000),
        endsAt: new Date(now - 60_000),
      },
    ]);

    await expect(loadBuildAccessSnapshot("user_1")).resolves.toEqual({
      userId: "user_1",
      entitlements: [],
    });
  });

  it("accepts an open-ended active grant", async () => {
    mocks.featureGrantFindMany.mockResolvedValue([
      {
        feature: FeatureKey.build_ai_generate,
        startsAt: null,
        endsAt: null,
      },
    ]);

    await expect(loadBuildAccessSnapshot("user_1")).resolves.toEqual({
      userId: "user_1",
      entitlements: ["build_ai_generate"],
    });
  });
  it("reads a separate active AI-edit grant without granting AI generation", async () => {
    mocks.featureGrantFindMany.mockResolvedValue([
      {
        feature: FeatureKey.build_ai_edit,
        startsAt: null,
        endsAt: null,
      },
    ]);

    await expect(loadBuildAccessSnapshot("user_1")).resolves.toEqual({
      userId: "user_1",
      entitlements: ["build_ai_edit"],
    });
  });

  it("only returns currently active entitlements when grants differ", async () => {
    mocks.featureGrantFindMany.mockResolvedValue([
      { feature: FeatureKey.build_ai_generate, startsAt: null, endsAt: null },
      { feature: FeatureKey.build_ai_edit, startsAt: null, endsAt: new Date(Date.now() - 60_000) },
    ]);

    await expect(loadBuildAccessSnapshot("user_1")).resolves.toEqual({
      userId: "user_1",
      entitlements: ["build_ai_generate"],
    });
  });

});
