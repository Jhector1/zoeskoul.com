import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  parseShopifyStoreIdentity,
  getShopifyCommerceAccessScopes,
} from "@zoeskoul/build-imports";

import {
  createShopifyOAuthTransport,
  ShopifyOAuthTransportError,
} from "./shopifyOAuthTransport";

const store = parseShopifyStoreIdentity("demo.myshopify.com");
const current = Date.parse("2026-10-17T20:00:00.000Z");
const scopes = getShopifyCommerceAccessScopes();
const nonce = "opaque_nonce_generated_server_side_123456789";

function response(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    access_token: "access_secret",
    refresh_token: "refresh_secret",
    scope: scopes.join(","),
    expires_in: 3600,
    refresh_token_expires_in: 7_776_000,
    ...overrides,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function transport(options: {
  fetchImpl?: typeof fetch;
  validateCallback?: () => Promise<void>;
} = {}) {
  return createShopifyOAuthTransport({
    clientId: "app_client_id",
    clientSecret: "app_client_secret",
    requiredScopes: scopes,
    now: () => current,
    fetchImpl: options.fetchImpl ?? vi.fn(async () => response()),
    validateCallback: options.validateCallback ?? vi.fn(async () => undefined),
  });
}

describe("Shopify expiring offline OAuth transport", () => {
  it("constructs HTTPS authorization URL with state and requested scopes", async () => {
    const redirect = await transport().createAuthorizationRedirect({
      store,
      redirectUri: "https://zoebuild.example.com/api/shopify/callback",
      state: nonce,
      scopes,
    });
    const url = new URL(redirect.url);
    expect(url.origin).toBe("https://demo.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("app_client_id");
    expect(url.searchParams.get("scope")).toBe(scopes.join(","));
    expect(url.searchParams.get("state")).toBe(nonce);
    expect(url.searchParams.get("redirect_uri")).toBe("https://zoebuild.example.com/api/shopify/callback");
    expect(redirect.url).not.toContain("app_client_secret");
  });

  it("exchanges verified callback code for an expiring offline credential", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    const validateCallback = vi.fn(async () => undefined);
    const result = await transport({ fetchImpl, validateCallback }).exchangeAuthorizationCode({
      store, code: "single_use_code", state: nonce,
    });
    expect(validateCallback).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      accessToken: "access_secret",
      refreshToken: "refresh_secret",
      scopes: [...scopes],
      accessTokenExpiresAt: "2026-10-17T21:00:00.000Z",
      refreshTokenExpiresAt: "2027-01-15T20:00:00.000Z",
    });
    const [endpoint, init] = fetchImpl.mock.calls[0]!;
    expect(endpoint).toBe("https://demo.myshopify.com/admin/oauth/access_token");
    expect(init?.method).toBe("POST");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("code")).toBe("single_use_code");
    expect(form.get("expiring")).toBe("1");
    expect(form.get("client_secret")).toBe("app_client_secret");
    expect(form.get("grant_type")).toBeNull();
  });

  it("fails closed before network calls when callback verifier rejects", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    await expect(transport({
      fetchImpl,
      validateCallback: async () => { throw new Error("invalid hmac"); },
    }).exchangeAuthorizationCode({ store, code: "code", state: nonce }))
      .rejects.toMatchObject({ code: "SHOPIFY_OAUTH_CALLBACK_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes using rotating offline refresh-token grant, without expiring=1", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response({
      access_token: "access_rotated", refresh_token: "refresh_rotated",
    }));
    const result = await transport({ fetchImpl }).refreshAuthorizationCredential({
      store, refreshToken: "refresh_previous",
    });
    expect(result.refreshToken).toBe("refresh_rotated");
    const form = new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("refresh_previous");
    expect(form.has("expiring")).toBe(false);
    expect(form.has("code")).toBe(false);
  });

  it("rejects token responses with missing refresh token or incomplete scopes", async () => {
    const noRefresh = vi.fn(async () => response({ refresh_token: null }));
    await expect(transport({ fetchImpl: noRefresh }).refreshAuthorizationCredential({
      store, refreshToken: "previous",
    })).rejects.toBeInstanceOf(ShopifyOAuthTransportError);

    const missingScope = vi.fn(async () => response({ scope: "unauthenticated_read_product_listings" }));
    await expect(transport({ fetchImpl: missingScope }).refreshAuthorizationCredential({
      store, refreshToken: "previous",
    })).rejects.toMatchObject({ code: "SHOPIFY_OAUTH_SCOPE_INSUFFICIENT" });
  });

  it("rejects non-expiring token responses and invalid lifetimes", async () => {
    const fetchImpl = vi.fn(async () => response({
      expires_in: null, refresh_token_expires_in: 0,
    }));
    await expect(transport({ fetchImpl }).refreshAuthorizationCredential({
      store, refreshToken: "previous",
    })).rejects.toMatchObject({ code: "SHOPIFY_OAUTH_TOKEN_INVALID" });
  });

  it("rejects custom domains and poisoned Shopify hostnames before external calls", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    await expect(transport({ fetchImpl }).refreshAuthorizationCredential({
      store: parseShopifyStoreIdentity("shop.example.com"),
      refreshToken: "previous",
    })).rejects.toMatchObject({ code: "SHOPIFY_OAUTH_STORE_INVALID" });
    await expect(transport({ fetchImpl }).refreshAuthorizationCredential({
      store: { hostname: "demo.myshopify.com.attacker.example", origin: "https://demo.myshopify.com.attacker.example/" },
      refreshToken: "previous",
    })).rejects.toMatchObject({ code: "SHOPIFY_OAUTH_STORE_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed on invalid nonce and missing required OAuth scopes", async () => {
    await expect(transport().createAuthorizationRedirect({
      store, redirectUri: "https://zoebuild.example.com/callback",
      state: "weak", scopes,
    })).rejects.toMatchObject({ code: "SHOPIFY_OAUTH_CONFIG_INVALID" });
    await expect(transport().createAuthorizationRedirect({
      store, redirectUri: "https://zoebuild.example.com/callback",
      state: nonce, scopes: ["unauthenticated_read_product_listings"],
    })).rejects.toMatchObject({ code: "SHOPIFY_OAUTH_SCOPE_INSUFFICIENT" });
  });

  it("never returns raw Shopify provider errors or credentials on HTTP failures", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      "access_token=secret; refresh_token=secret", { status: 401 },
    ));
    await expect(transport({ fetchImpl }).refreshAuthorizationCredential({
      store, refreshToken: "original_refresh_secret",
    })).rejects.toMatchObject({
      code: "SHOPIFY_OAUTH_AUTHORIZATION_FAILED",
      message: "Shopify rejected the authorization request.",
    });
  });
});
