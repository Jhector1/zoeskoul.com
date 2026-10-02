import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_CHALLENGE_X_OAUTH_SCOPES,
  completePublicChallengeXAuthorization,
  createPublicChallengeXAuthorizationRequest,
  getPublicChallengeXAccessToken,
} from "./publicChallengeSocialXAuth";

type Row = {
  provider: string;
  accessTokenCiphertext: string | null;
  refreshTokenCiphertext: string | null;
  accessTokenExpiresAt: Date | null;
  scope: string | null;
  connectedAt: Date | null;
};

function testEnv() {
  return {
    NODE_ENV: "test",
    X_OAUTH_CLIENT_ID: "client-id",
    X_OAUTH_CLIENT_SECRET: "client-secret",
    X_OAUTH_REDIRECT_URI:
      "https://zoeskoul.com/api/admin/public-challenges/social/x/callback",
    ZOESKOUL_SOCIAL_CREDENTIAL_KEY: Buffer.alloc(32, 7).toString("base64"),
  } as NodeJS.ProcessEnv;
}

function memoryStore() {
  let row: Row | null = null;
  return {
    get row() {
      return row;
    },
    store: {
      findUnique: vi.fn(async () => row),
      upsert: vi.fn(async (args: any) => {
        const nextRow: Row = {
          ...(row ?? {
            provider: "x",
            accessTokenCiphertext: null,
            refreshTokenCiphertext: null,
            accessTokenExpiresAt: null,
            scope: null,
            connectedAt: null,
          }),
          ...(row ? args.update : args.create),
        };
        row = nextRow;
        return nextRow;
      }),
      update: vi.fn(async (args: any) => {
        if (!row) throw new Error("missing row");
        const nextRow: Row = { ...row, ...args.data };
        row = nextRow;
        return nextRow;
      }),
    },
  };
}

function tokenResponse(args: {
  access: string;
  refresh: string;
  expiresIn?: number;
  scopes?: string[];
}) {
  return new Response(
    JSON.stringify({
      token_type: "bearer",
      expires_in: args.expiresIn ?? 7200,
      access_token: args.access,
      refresh_token: args.refresh,
      scope: (args.scopes ?? [...PUBLIC_CHALLENGE_X_OAUTH_SCOPES]).join(" "),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("public challenge X OAuth", () => {
  it("requests media.write and offline.access and stores encrypted tokens", async () => {
    const env = testEnv();
    const now = new Date("2026-10-02T01:00:00.000Z");
    const oauth = createPublicChallengeXAuthorizationRequest(env, now);
    const authorizationUrl = new URL(oauth.authorizationUrl);
    const state = authorizationUrl.searchParams.get("state") ?? "";
    const scopes = authorizationUrl.searchParams.get("scope") ?? "";

    expect(scopes).toContain("media.write");
    expect(scopes).toContain("tweet.write");
    expect(scopes).toContain("offline.access");

    const memory = memoryStore();
    const fetcher = vi.fn(async () =>
      tokenResponse({ access: "access-one", refresh: "refresh-one" }),
    ) as unknown as typeof fetch;

    await completePublicChallengeXAuthorization({
      code: "authorization-code",
      state,
      cookieValue: oauth.cookieValue,
      env,
      now,
      fetcher,
      store: memory.store,
    });

    expect(memory.row?.accessTokenCiphertext).not.toContain("access-one");
    expect(memory.row?.refreshTokenCiphertext).not.toContain("refresh-one");
    expect(memory.row?.scope).toContain("media.write");

    const [, init] = vi.mocked(fetcher).mock.calls[0]!;
    expect(String(init?.headers && new Headers(init.headers).get("Authorization"))).toMatch(
      /^Basic /,
    );
    const params = new URLSearchParams(String(init?.body));
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code_verifier")).toBeTruthy();
  });

  it("refreshes before expiry and persists the rotated refresh token", async () => {
    const env = testEnv();
    const memory = memoryStore();
    const connectedAt = new Date("2026-10-02T01:00:00.000Z");
    const oauth = createPublicChallengeXAuthorizationRequest(env, connectedAt);
    const state = new URL(oauth.authorizationUrl).searchParams.get("state") ?? "";

    const connectFetcher = vi.fn(async () =>
      tokenResponse({
        access: "access-one",
        refresh: "refresh-one",
        expiresIn: 60,
      }),
    ) as unknown as typeof fetch;

    await completePublicChallengeXAuthorization({
      code: "authorization-code",
      state,
      cookieValue: oauth.cookieValue,
      env,
      now: connectedAt,
      fetcher: connectFetcher,
      store: memory.store,
    });

    const refreshFetcher = vi.fn(async (_input, init) => {
      const params = new URLSearchParams(String(init?.body));
      expect(params.get("grant_type")).toBe("refresh_token");
      expect(params.get("refresh_token")).toBe("refresh-one");
      return tokenResponse({
        access: "access-two",
        refresh: "refresh-two",
      });
    }) as unknown as typeof fetch;

    const token = await getPublicChallengeXAccessToken({
      env,
      now: new Date("2026-10-02T01:02:00.000Z"),
      fetcher: refreshFetcher,
      store: memory.store,
    });

    expect(token).toBe("access-two");
    expect(refreshFetcher).toHaveBeenCalledOnce();

    const reuseFetcher = vi.fn() as unknown as typeof fetch;
    const reused = await getPublicChallengeXAccessToken({
      env,
      now: new Date("2026-10-02T01:03:00.000Z"),
      fetcher: reuseFetcher,
      store: memory.store,
    });
    expect(reused).toBe("access-two");
    expect(reuseFetcher).not.toHaveBeenCalled();
  });

  it("rejects an authorization that omits media.write", async () => {
    const env = testEnv();
    const oauth = createPublicChallengeXAuthorizationRequest(env);
    const state = new URL(oauth.authorizationUrl).searchParams.get("state") ?? "";
    const memory = memoryStore();
    const fetcher = vi.fn(async () =>
      tokenResponse({
        access: "access-one",
        refresh: "refresh-one",
        scopes: [
          "tweet.read",
          "tweet.write",
          "users.read",
          "offline.access",
        ],
      }),
    ) as unknown as typeof fetch;

    await expect(
      completePublicChallengeXAuthorization({
        code: "authorization-code",
        state,
        cookieValue: oauth.cookieValue,
        env,
        fetcher,
        store: memory.store,
      }),
    ).rejects.toThrow("media.write");
  });
});
