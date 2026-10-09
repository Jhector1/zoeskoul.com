import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const account = {
    findFirst: mocks.findFirst,
    update: mocks.update,
    deleteMany: mocks.deleteMany,
    upsert: mocks.upsert,
  };
  return {
    prisma: {
      account,
      $transaction: vi.fn(
        async (work: (tx: { account: typeof account }) => Promise<unknown>) =>
          work({ account }),
      ),
    },
  };
});

vi.mock("@zoeskoul/app-config", () => ({
  getProductionAppOrigin: vi.fn(() => "https://zoeskoul.com"),
}));

import {
  buildTikTokPublisherAuthorizationUrl,
  getTikTokPublisherAccessToken,
  persistTikTokPublisherAuthorization,
} from "./publicChallengeTikTokConnection";

describe("single-account TikTok publisher OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the one-time authorization URL without exposing the client secret", () => {
    const url = new URL(
      buildTikTokPublisherAuthorizationUrl({
        state: "state-123",
        env: {
          TIKTOK_CLIENT_KEY: "client-key",
          TIKTOK_CLIENT_SECRET: "client-secret",
          TIKTOK_REDIRECT_URI:
            "https://zoeskoul.com/api/integrations/tiktok/callback",
        },
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://www.tiktok.com/v2/auth/authorize/",
    );
    expect(url.searchParams.get("client_key")).toBe("client-key");
    expect(url.searchParams.get("scope")).toBe(
      "user.info.basic,video.publish",
    );
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.toString()).not.toContain("client-secret");
  });

  it("keeps the existing static token as a test/backward-compatible escape hatch", async () => {
    await expect(
      getTikTokPublisherAccessToken({
        env: { TIKTOK_ACCESS_TOKEN: "static-token" },
      }),
    ).resolves.toBe("static-token");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("refreshes an expired persisted token and rotates the refresh token", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "account-1",
      providerAccountId: "open-1",
      access_token: "expired-token",
      refresh_token: "refresh-old",
      expires_at: 1,
      scope: "user.info.basic,video.publish",
    });
    mocks.update.mockResolvedValue({ id: "account-1" });

    const fetcher = vi.fn(async () =>
      Response.json({
        access_token: "access-new",
        expires_in: 86400,
        open_id: "open-1",
        refresh_expires_in: 31536000,
        refresh_token: "refresh-new",
        scope: "user.info.basic,video.publish",
        token_type: "Bearer",
      }),
    ) as unknown as typeof fetch;

    await expect(
      getTikTokPublisherAccessToken({
        env: {
          TIKTOK_CLIENT_KEY: "client-key",
          TIKTOK_CLIENT_SECRET: "client-secret",
        },
        fetcher,
      }),
    ).resolves.toBe("access-new");

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "account-1" },
        data: expect.objectContaining({
          access_token: "access-new",
          refresh_token: "refresh-new",
        }),
      }),
    );
  });

  it("stores only the one authorized TikTok publisher identity", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        access_token: "access-1",
        expires_in: 86400,
        open_id: "open-1",
        refresh_expires_in: 31536000,
        refresh_token: "refresh-1",
        scope: "user.info.basic,video.publish",
        token_type: "Bearer",
      }),
    ) as unknown as typeof fetch;

    await expect(
      persistTikTokPublisherAuthorization({
        userId: "publisher-1",
        code: "oauth-code",
        env: {
          TIKTOK_CLIENT_KEY: "client-key",
          TIKTOK_CLIENT_SECRET: "client-secret",
          TIKTOK_REDIRECT_URI:
            "https://zoeskoul.com/api/integrations/tiktok/callback",
        },
        fetcher,
      }),
    ).resolves.toEqual({
      openId: "open-1",
      scope: "user.info.basic,video.publish",
    });

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        provider: "zoeskoul-tiktok-publisher",
        providerAccountId: { not: "open-1" },
      },
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "publisher-1",
          provider: "zoeskoul-tiktok-publisher",
          providerAccountId: "open-1",
        }),
      }),
    );
  });
});
