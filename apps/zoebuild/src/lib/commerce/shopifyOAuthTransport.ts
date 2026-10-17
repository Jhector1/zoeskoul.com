import "server-only";

import {
  parseShopifyStoreIdentity,
  type ShopifyAuthorizationCode,
  type ShopifyAuthorizationCredential,
  type ShopifyAuthorizationPort,
  type ShopifyAuthorizationRefreshRequest,
  type ShopifyAuthorizationRequest,
  type ShopifyAuthorizationScope,
  type ShopifyStoreIdentity,
} from "@zoeskoul/build-imports";

type FetchPort = typeof fetch;

export type ShopifyOAuthTransportOptions = Readonly<{
  clientId: string;
  clientSecret: string;
  // Required: callback HMAC, exact stored nonce, timestamp, scope and
  // project/environment binding must be validated BEFORE a code exchange.
  validateCallback: (input: ShopifyAuthorizationCode) => Promise<void>;
  requiredScopes: readonly ShopifyAuthorizationScope[];
  fetchImpl?: FetchPort;
  now?: () => number;
}>;

export class ShopifyOAuthTransportError extends Error {
  readonly code:
    | "SHOPIFY_OAUTH_CONFIG_INVALID"
    | "SHOPIFY_OAUTH_STORE_INVALID"
    | "SHOPIFY_OAUTH_CALLBACK_INVALID"
    | "SHOPIFY_OAUTH_AUTHORIZATION_FAILED"
    | "SHOPIFY_OAUTH_SCOPE_INSUFFICIENT"
    | "SHOPIFY_OAUTH_TOKEN_INVALID"
    | "SHOPIFY_OAUTH_UNAVAILABLE";

  constructor(code: ShopifyOAuthTransportError["code"], message: string) {
    super(message);
    this.name = "ShopifyOAuthTransportError";
    this.code = code;
  }
}

// Only canonical Shopify hostnames can be used as an OAuth token endpoint.
// The general-purpose import parser also accepts custom domains; OAuth does not.
const SHOP_HOST_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function canonicalShop(input: ShopifyStoreIdentity): string {
  let parsed: ShopifyStoreIdentity;
  try {
    parsed = parseShopifyStoreIdentity(input.origin);
  } catch {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_STORE_INVALID",
      "A canonical Shopify store hostname is required.",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !SHOP_HOST_PATTERN.test(hostname) ||
    input.hostname !== hostname ||
    parsed.origin !== `https://${hostname}/` ||
    input.origin !== `https://${hostname}/`
  ) {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_STORE_INVALID",
      "A canonical HTTPS myshopify.com store hostname is required.",
    );
  }

  return hostname;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_CONFIG_INVALID",
      `${label} is required.`,
    );
  }
  return normalized;
}

function nonEmptyScopeList(value: readonly ShopifyAuthorizationScope[]): readonly string[] {
  const scopes = [...new Set(value.map((scope) => scope.trim()))];
  if (!scopes.length || scopes.some((scope) => !scope)) {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_CONFIG_INVALID",
      "Explicit Shopify access scopes are required.",
    );
  }
  return scopes;
}

function tokenEndpoint(hostname: string): string {
  return `https://${hostname}/admin/oauth/access_token`;
}

function validSeconds(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 365 * 24 * 60 * 60
  ) {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_TOKEN_INVALID",
      "Shopify did not return valid expiring offline-token lifetimes.",
    );
  }
  return value;
}

function tokenCredential(
  payload: unknown,
  requiredScopes: readonly string[],
  now: () => number,
): ShopifyAuthorizationCredential {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_TOKEN_INVALID",
      "Shopify returned an invalid OAuth token response.",
    );
  }
  const record = payload as Record<string, unknown>;
  const accessToken = typeof record.access_token === "string"
    ? record.access_token.trim()
    : "";
  const refreshToken = typeof record.refresh_token === "string"
    ? record.refresh_token.trim()
    : "";
  const scopes = typeof record.scope === "string"
    ? record.scope.split(",").map((scope) => scope.trim()).filter(Boolean)
    : [];
  const accessLifetime = validSeconds(record.expires_in);
  const refreshLifetime = validSeconds(record.refresh_token_expires_in);
  const current = now();

  if (
    !accessToken || !refreshToken || !scopes.length ||
    !Number.isFinite(current)
  ) {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_TOKEN_INVALID",
      "Shopify did not return a complete expiring offline token pair with required scopes.",
    );
  }

  if (requiredScopes.some((scope) => !scopes.includes(scope))) {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_SCOPE_INSUFFICIENT",
      "Shopify did not grant all required access scopes.",
    );
  }

  const accessDate = new Date(current + accessLifetime * 1000);
  const refreshDate = new Date(current + refreshLifetime * 1000);
  if (!Number.isFinite(accessDate.getTime()) || !Number.isFinite(refreshDate.getTime())) {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_TOKEN_INVALID",
      "Shopify returned invalid token expiry times.",
    );
  }

  return {
    accessToken,
    refreshToken,
    scopes,
    accessTokenExpiresAt: accessDate.toISOString(),
    refreshTokenExpiresAt: refreshDate.toISOString(),
  };
}

export function createShopifyOAuthTransport(
  options: ShopifyOAuthTransportOptions,
): ShopifyAuthorizationPort {
  const clientId = requiredText(options.clientId, "Shopify client ID");
  const clientSecret = requiredText(options.clientSecret, "Shopify client secret");
  if (typeof options.validateCallback !== "function") {
    throw new ShopifyOAuthTransportError(
      "SHOPIFY_OAUTH_CONFIG_INVALID",
      "A verified OAuth callback boundary is required.",
    );
  }
  const requiredScopes = nonEmptyScopeList(options.requiredScopes);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  async function exchangeToken(
    hostname: string,
    form: URLSearchParams,
  ): Promise<ShopifyAuthorizationCredential> {
    let response: Response;
    try {
      response = await fetchImpl(tokenEndpoint(hostname), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ShopifyOAuthTransportError(
        "SHOPIFY_OAUTH_UNAVAILABLE",
        "Shopify authorization is temporarily unavailable.",
      );
    }
    if (!response.ok) {
      // Never propagate response bodies: Shopify may echo sensitive parameters.
      throw new ShopifyOAuthTransportError(
        "SHOPIFY_OAUTH_AUTHORIZATION_FAILED",
        "Shopify rejected the authorization request.",
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ShopifyOAuthTransportError(
        "SHOPIFY_OAUTH_TOKEN_INVALID",
        "Shopify returned an invalid OAuth token response.",
      );
    }
    return tokenCredential(payload, requiredScopes, now);
  }

  return {
    async createAuthorizationRedirect(request: ShopifyAuthorizationRequest) {
      const hostname = canonicalShop(request.store);
      let redirect: URL;
      try {
        redirect = new URL(request.redirectUri);
      } catch {
        throw new ShopifyOAuthTransportError(
          "SHOPIFY_OAUTH_CONFIG_INVALID",
          "Shopify OAuth callback URL is invalid.",
        );
      }
      if (
        redirect.protocol !== "https:" || redirect.username ||
        redirect.password || redirect.hash
      ) {
        throw new ShopifyOAuthTransportError(
          "SHOPIFY_OAUTH_CONFIG_INVALID",
          "Shopify OAuth callback must use an exact HTTPS redirect URL.",
        );
      }
      if (!/^[A-Za-z0-9_-]{32,}$/.test(request.state)) {
        throw new ShopifyOAuthTransportError(
          "SHOPIFY_OAUTH_CONFIG_INVALID",
          "Shopify OAuth state must be an unpredictable stored nonce.",
        );
      }
      const requestScopes = nonEmptyScopeList(request.scopes);
      if (requiredScopes.some((scope) => !requestScopes.includes(scope))) {
        throw new ShopifyOAuthTransportError(
          "SHOPIFY_OAUTH_SCOPE_INSUFFICIENT",
          "The authorization request must include every required scope.",
        );
      }
      const url = new URL(`https://${hostname}/admin/oauth/authorize`);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("scope", requestScopes.join(","));
      url.searchParams.set("redirect_uri", redirect.href);
      url.searchParams.set("state", request.state);
      return { url: url.href };
    },

    async exchangeAuthorizationCode(request: ShopifyAuthorizationCode) {
      const hostname = canonicalShop(request.store);
      // Route implementation must verify HMAC + nonce and consume pending state.
      // No code exchange is allowed until that trusted boundary succeeds.
      try {
        await options.validateCallback(request);
      } catch {
        throw new ShopifyOAuthTransportError(
          "SHOPIFY_OAUTH_CALLBACK_INVALID",
          "Shopify OAuth callback validation failed.",
        );
      }
      if (!request.code.trim() || !request.state.trim()) {
        throw new ShopifyOAuthTransportError(
          "SHOPIFY_OAUTH_CALLBACK_INVALID",
          "Shopify OAuth callback is incomplete.",
        );
      }
      return exchangeToken(hostname, new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: request.code,
        expiring: "1",
      }));
    },

    async refreshAuthorizationCredential(request: ShopifyAuthorizationRefreshRequest) {
      const hostname = canonicalShop(request.store);
      if (!request.refreshToken.trim()) {
        throw new ShopifyOAuthTransportError(
          "SHOPIFY_OAUTH_CONFIG_INVALID",
          "A Shopify offline refresh token is required.",
        );
      }
      return exchangeToken(hostname, new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: request.refreshToken,
      }));
    },
  };
}
