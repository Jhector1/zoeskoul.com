import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertDistinctShopifyEnvironment,
  completeShopifyOAuthFlow,
  shopifyOAuthCallbackUri,
  shopifyOAuthRoutesConfigured,
  startShopifyOAuthFlow,
  trustedShopifyOAuthOrigin,
} from "./shopifyOAuthRouteFlow";

const project = "project_123";
const storeId = "store_123";
const shop = "demo.myshopify.com";
const secret = "shopify_test_app_secret";
const origin = "https://build.example.com";
const redirectUri = shopifyOAuthCallbackUri({
  zoebuildOrigin: origin, buildProjectId: project, environment: "test",
});

function fakeDatabase() {
  const states = new Map<string, any>();
  const secrets = new Map<string, unknown>();
  let secretCount = 0;
  let opposite: any = null;
  const db = {
    commerceProviderOAuthState: {
      create: vi.fn(async ({ data }: any) => {
        states.set(data.stateHash, { ...data, consumedAt: null });
        return data;
      }),
      findUnique: vi.fn(async ({ where }: any) => states.get(where.stateHash) ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = states.get(where.stateHash);
        if (!row || row.consumedAt || row.browserBindingHash !== where.browserBindingHash ||
            row.buildProjectId !== where.buildProjectId || row.storeId !== where.storeId ||
            row.environment !== where.environment || row.shopHostname !== where.shopHostname ||
            row.provider !== where.provider || row.redirectUri !== where.redirectUri ||
            row.expiresAt <= where.expiresAt.gt) return { count: 0 };
        row.consumedAt = data.consumedAt;
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        states.delete(where.stateHash);
        return { count: 1 };
      }),
    },
    commerceProviderConnection: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.storeId_provider_environment.environment === "live") return opposite;
        return null;
      }),
      upsert: vi.fn(async () => ({ id: "shopify_connection" })),
    },
  } as any;
  const secretStore = {
    put: vi.fn(async ({ value }: any) => {
      const secretRef = `private_${++secretCount}`;
      secrets.set(secretRef, value);
      return { secretRef };
    }),
    read: vi.fn(async ({ secretRef }: any) => secrets.get(secretRef)),
    delete: vi.fn(async ({ secretRef }: any) => { secrets.delete(secretRef); }),
  } as any;
  return {
    db, secretStore, states, secrets,
    oppositeConnection(value: any) { opposite = value; },
  };
}

function signedCallback(state: string, code = "verified_oauth_code") {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const pairs: [string, string][] = [
    ["code", code], ["shop", shop], ["state", state], ["timestamp", timestamp],
  ];
  const signature = createHmac("sha256", secret)
    .update(pairs.sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`).join("&"))
    .digest("hex");
  const url = new URL(redirectUri);
  for (const [key, value] of pairs) url.searchParams.set(key, value);
  url.searchParams.set("hmac", signature);
  return url.toString();
}

const scope = { buildProjectId: project, storeId, shopHostname: shop,
  environment: "test" as const, redirectUri };

const tokens = () => ({
  access_token: "access_example_not_real",
  refresh_token: "refresh_example_not_real",
  scope: "unauthenticated_read_product_listings,unauthenticated_read_checkouts,unauthenticated_write_checkouts",
  expires_in: 3600,
  refresh_token_expires_in: 7776000,
});

describe("Shopify OAuth route composition", () => {
  it("constructs an exact HTTPS callback independent of request Host headers", () => {
    expect(redirectUri).toBe(
      "https://build.example.com/api/build/projects/project_123/commerce/providers/shopify/oauth/test/callback",
    );
    expect(() => trustedShopifyOAuthOrigin("http://build.example.com/")).toThrow();
    expect(() => trustedShopifyOAuthOrigin("https://build.example.com.evil.test/")).not.toThrow();
    expect(() => trustedShopifyOAuthOrigin("https://build.example.com/path")).toThrow();
    expect(() => shopifyOAuthCallbackUri({
      zoebuildOrigin: origin, buildProjectId: "../unsafe", environment: "live",
    })).toThrow();
  });

  it("fails closed until explicitly enabled with both server-side app credentials", () => {
    expect(shopifyOAuthRoutesConfigured({ enabled: undefined, clientId: "a", clientSecret: "b" })).toBe(false);
    expect(shopifyOAuthRoutesConfigured({ enabled: "true", clientId: "a", clientSecret: "" })).toBe(false);
    expect(shopifyOAuthRoutesConfigured({ enabled: "true", clientId: "a", clientSecret: "b" })).toBe(true);
  });

  it("generates a stored nonce, a Shopify-only redirect, and a browser binding", async () => {
    const f = fakeDatabase();
    const result = await startShopifyOAuthFlow({
      client: f.db, secretStore: f.secretStore, scope,
      clientId: "app_id", clientSecret: secret,
    });
    const url = new URL(result.authorizationUrl);
    expect(url.hostname).toBe(shop);
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.browserBinding).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f.db.commerceProviderOAuthState.create).toHaveBeenCalledOnce();
    expect(f.secrets.size).toBe(0);
  });

  it("exchanges only after a valid HMAC and one-time state consume, then encrypts credentials", async () => {
    const f = fakeDatabase();
    const started = await startShopifyOAuthFlow({
      client: f.db, secretStore: f.secretStore, scope,
      clientId: "app_id", clientSecret: secret,
    });
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => Response.json(tokens()));
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      await expect(completeShopifyOAuthFlow({
        client: f.db, secretStore: f.secretStore,
        buildProjectId: project, storeId, environment: "test", redirectUri,
        browserBinding: started.browserBinding, callbackUrl: signedCallback(state),
        clientId: "app_id", clientSecret: secret,
      })).resolves.toEqual({ provider: "shopify", environment: "test", status: "active" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(f.db.commerceProviderConnection.upsert).toHaveBeenCalledOnce();
      expect(f.secrets.size).toBe(1);
      expect(JSON.stringify([...f.states.values()])).not.toContain("access_example_not_real");

      await expect(completeShopifyOAuthFlow({
        client: f.db, secretStore: f.secretStore,
        buildProjectId: project, storeId, environment: "test", redirectUri,
        browserBinding: started.browserBinding, callbackUrl: signedCallback(state),
        clientId: "app_id", clientSecret: secret,
      })).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { globalThis.fetch = originalFetch; }
  });

  it("rejects tampered callback signatures without consuming state or contacting Shopify", async () => {
    const f = fakeDatabase();
    const started = await startShopifyOAuthFlow({
      client: f.db, secretStore: f.secretStore, scope, clientId: "app_id", clientSecret: secret,
    });
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    const callbackUrl = signedCallback(state).replace("verified_oauth_code", "attacker_code");
    await expect(completeShopifyOAuthFlow({
      client: f.db, secretStore: f.secretStore,
      buildProjectId: project, storeId, environment: "test", redirectUri,
      browserBinding: started.browserBinding, callbackUrl,
      clientId: "app_id", clientSecret: secret,
    })).rejects.toThrow();
    expect(f.db.commerceProviderOAuthState.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a callback for a different environment before consuming state", async () => {
    const f = fakeDatabase();
    const started = await startShopifyOAuthFlow({
      client: f.db, secretStore: f.secretStore, scope, clientId: "app_id", clientSecret: secret,
    });
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    await expect(completeShopifyOAuthFlow({
      client: f.db, secretStore: f.secretStore,
      buildProjectId: project, storeId, environment: "live", redirectUri,
      browserBinding: started.browserBinding, callbackUrl: signedCallback(state),
      clientId: "app_id", clientSecret: secret,
    })).rejects.toThrow();
    expect(f.db.commerceProviderOAuthState.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to reuse an active live Shopify shop as a test shop", async () => {
    const f = fakeDatabase();
    f.oppositeConnection({ status: "active", credentialsSecretRef: "private_other" });
    f.secrets.set("private_other", {
      kind: "shopify-offline-oauth", version: 1,
      buildProjectId: project, storeId, environment: "live", shopHostname: shop,
    });
    await expect(assertDistinctShopifyEnvironment(f.db, f.secretStore, scope)).rejects.toThrow();
    expect(f.secretStore.read).toHaveBeenCalledOnce();
  });

  it("fails closed if the opposite active environment's secret is unreadable", async () => {
    const f = fakeDatabase();
    f.oppositeConnection({ status: "active", credentialsSecretRef: "missing" });
    await expect(assertDistinctShopifyEnvironment(f.db, f.secretStore, scope)).rejects.toThrow();
  });
});
