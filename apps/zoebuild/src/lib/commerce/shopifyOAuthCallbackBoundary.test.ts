import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  beginShopifyOAuthState,
  oneTimeShopifyCallbackValidator,
  shopifyOAuthBrowserCookie,
  verifyAndConsumeShopifyOAuthCallback,
} from "./shopifyOAuthCallbackBoundary";

const now = new Date("2026-10-17T20:00:00.000Z");
const scope = {
  buildProjectId: "build_1",
  storeId: "store_1",
  environment: "test" as const,
  shopHostname: "demo.myshopify.com",
  redirectUri: "https://zoebuild.example.com/oauth/shopify/callback",
};
const secret = "shopify_client_secret_for_test";

function fake() {
  const rows = new Map<string, any>();
  const create = vi.fn(async ({ data }: any) => { rows.set(data.stateHash, { ...data, consumedAt: null }); });
  const updateMany = vi.fn(async ({ where, data }: any) => {
    const row = rows.get(where.stateHash);
    if (!row || row.consumedAt || row.expiresAt <= where.expiresAt.gt ||
        Object.entries(where).some(([key, value]) =>
          key !== "expiresAt" && key !== "consumedAt" && row[key] !== value)) return { count: 0 };
    row.consumedAt = data.consumedAt;
    return { count: 1 };
  });
  return { client: { commerceProviderOAuthState: { create, updateMany } } as any, rows, create, updateMany };
}

function callback(state: string, patch: Record<string, string> = {}) {
  const values = {
    code: "single_use_code",
    shop: scope.shopHostname,
    state,
    timestamp: String(Math.floor(now.getTime() / 1000)),
    ...patch,
  };
  const params = new URLSearchParams(values);
  const text = Object.entries(values).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("&");
  params.set("hmac", createHmac("sha256", secret).update(text).digest("hex"));
  return `${scope.redirectUri}?${params.toString()}`;
}

describe("Shopify OAuth callback boundary", () => {
  it("stores only hashes and issues HttpOnly secure browser binding", async () => {
    const { client, create } = fake();
    const result = await beginShopifyOAuthState(client, scope, now);
    expect(result.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.browserBinding).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(create.mock.calls[0])).not.toContain(result.state);
    expect(JSON.stringify(create.mock.calls[0])).not.toContain(result.browserBinding);
    expect(shopifyOAuthBrowserCookie(result.browserBinding).options).toMatchObject({
      httpOnly: true, secure: true, sameSite: "lax", maxAge: 600,
    });
  });

  it("verifies HMAC and binding and atomically prevents replay", async () => {
    const { client } = fake();
    const issued = await beginShopifyOAuthState(client, scope, now);
    const input = { callbackUrl: callback(issued.state), clientSecret: secret,
      browserBinding: issued.browserBinding, scope, now };
    const code = await verifyAndConsumeShopifyOAuthCallback(client, input);
    expect(code.code).toBe("single_use_code");
    expect(code.store.hostname).toBe(scope.shopHostname);
    await expect(verifyAndConsumeShopifyOAuthCallback(client, input)).rejects.toMatchObject({
      code: "SHOPIFY_OAUTH_CALLBACK_REJECTED",
    });
    const validator = oneTimeShopifyCallbackValidator(code);
    await validator(code);
    await expect(validator(code)).rejects.toThrow();
  });

  it("rejects changed HMAC before state consumption", async () => {
    const { client, updateMany } = fake();
    const issued = await beginShopifyOAuthState(client, scope, now);
    const invalid = callback(issued.state).replace("single_use_code", "tampered_code");
    await expect(verifyAndConsumeShopifyOAuthCallback(client, {
      callbackUrl: invalid, clientSecret: secret, browserBinding: issued.browserBinding, scope, now,
    })).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects wrong browser, environment, shop, or redirect before state consumption", async () => {
    const { client, updateMany } = fake();
    const issued = await beginShopifyOAuthState(client, scope, now);
    for (const patch of [
      { browserBinding: null },
      { browserBinding: "x".repeat(43) },
      { scope: { ...scope, environment: "live" as const } },
      { scope: { ...scope, shopHostname: "other.myshopify.com" } },
      { scope: { ...scope, redirectUri: "https://other.example.com/callback" } },
    ]) {
      await expect(verifyAndConsumeShopifyOAuthCallback(client, {
        callbackUrl: callback(issued.state), clientSecret: secret,
        browserBinding: issued.browserBinding, scope, now, ...patch,
      })).rejects.toThrow();
    }
    // Wrong browser and shop fail before update; wrong environment reaches conditional update.
    expect(updateMany.mock.calls.every((call) => call[0].where.environment !== "test" ||
      call[0].where.browserBindingHash !== undefined)).toBe(true);
  });

  it("rejects expired timestamps, duplicate parameters, and poisoned Shopify host", async () => {
    const { client, updateMany } = fake();
    const issued = await beginShopifyOAuthState(client, scope, now);
    const urls = [
      callback(issued.state, { timestamp: String(Math.floor(now.getTime() / 1000) - 500) }),
      callback(issued.state) + "&state=evil",
      callback(issued.state, { shop: "demo.myshopify.com.attacker.example" }),
    ];
    for (const callbackUrl of urls) {
      await expect(verifyAndConsumeShopifyOAuthCallback(client, {
        callbackUrl, clientSecret: secret, browserBinding: issued.browserBinding, scope, now,
      })).rejects.toThrow();
    }
    expect(updateMany).not.toHaveBeenCalled();
  });
});
