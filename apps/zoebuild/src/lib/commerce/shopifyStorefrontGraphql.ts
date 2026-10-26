import "server-only";

import { isIP } from "node:net";

// Deliberately pinned until ZoeBuild's API-version upgrade is validated.
export const SHOPIFY_STOREFRONT_GRAPHQL_VERSION = "2026-10" as const;

const CANONICAL_SHOP = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;
const MAX_DOCUMENT_LENGTH = 16_384;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_TOKEN_LENGTH = 4096;

type FetchPort = typeof fetch;

export type ShopifyStorefrontGraphqlAudience =
  | Readonly<{ kind: "system" }>
  | Readonly<{ kind: "buyer"; ip: string }>;

export type ShopifyStorefrontGraphqlOptions = Readonly<{
  shopHostname: string;
  environment: "test" | "live";
  // This is a server-side, scoped private credential resolved from the vault.
  // Never provide the token from a request body or generated storefront code.
  privateToken?: string;
  /** Provisioned server-side from the merchant-authorized Shopify app. */
  publicToken?: string;
  fetchImpl?: FetchPort;
}>;

export type ShopifyStorefrontGraphqlRequest = Readonly<{
  document: string;
  variables?: Readonly<Record<string, unknown>>;
  audience: ShopifyStorefrontGraphqlAudience;
}>;

export class ShopifyStorefrontGraphqlError extends Error {
  readonly code:
    | "SHOPIFY_STOREFRONT_CONFIG_INVALID"
    | "SHOPIFY_STOREFRONT_INPUT_INVALID"
    | "SHOPIFY_STOREFRONT_AUTH_FAILED"
    | "SHOPIFY_STOREFRONT_RATE_LIMITED"
    | "SHOPIFY_STOREFRONT_UNAVAILABLE"
    | "SHOPIFY_STOREFRONT_RESPONSE_INVALID"
    | "SHOPIFY_STOREFRONT_GRAPHQL_FAILED";

  constructor(code: ShopifyStorefrontGraphqlError["code"]) {
    super("Shopify Storefront operation could not be completed securely.");
    this.name = "ShopifyStorefrontGraphqlError";
    this.code = code;
  }
}

function fail(code: ShopifyStorefrontGraphqlError["code"]): never {
  throw new ShopifyStorefrontGraphqlError(code);
}

function validConfig(input: ShopifyStorefrontGraphqlOptions) {
  const hostname = input.shopHostname;
  const token = input.publicToken ?? input.privateToken;
  if (!CANONICAL_SHOP.test(hostname) || hostname.length > 253 ||
      (input.environment !== "test" && input.environment !== "live") ||
      Boolean(input.publicToken) === Boolean(input.privateToken) ||
      !token || token !== token.trim() ||
      token.length > MAX_TOKEN_LENGTH ||
      /[\r\n\x00-\x1f\x7f]/.test(token)) {
    fail("SHOPIFY_STOREFRONT_CONFIG_INVALID");
  }
  return { hostname, token, isPublic: Boolean(input.publicToken) };
}

function graphqlInput(input: ShopifyStorefrontGraphqlRequest) {
  if (!input || typeof input.document !== "string" ||
      !input.document.trim() || input.document.length > MAX_DOCUMENT_LENGTH ||
      !input.audience ||
      (input.audience.kind !== "buyer" && input.audience.kind !== "system")) {
    fail("SHOPIFY_STOREFRONT_INPUT_INVALID");
  }
  if (input.variables !== undefined && (
    input.variables === null || typeof input.variables !== "object" ||
    Array.isArray(input.variables)
  )) fail("SHOPIFY_STOREFRONT_INPUT_INVALID");
  if (input.audience.kind === "buyer" && isIP(input.audience.ip) === 0) {
    fail("SHOPIFY_STOREFRONT_INPUT_INVALID");
  }
  let body: string;
  try {
    body = JSON.stringify({ query: input.document, variables: input.variables ?? {} });
  } catch {
    return fail("SHOPIFY_STOREFRONT_INPUT_INVALID");
  }
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    fail("SHOPIFY_STOREFRONT_INPUT_INVALID");
  }
  return body;
}

/**
 * Server-only, credential-injected Shopify Storefront GraphQL transport.
 * The caller must select and validate the exact merchant/project/environment,
 * read the private credential from BuildSecretStore, and refresh it if needed.
 * This adapter never chooses an environment or falls back to another shop.
 * Only trusted server-authored GraphQL documents may be passed to execute().
 */
export function createShopifyStorefrontGraphql(options: ShopifyStorefrontGraphqlOptions) {
  const { hostname, token, isPublic } = validConfig(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `https://${hostname}/api/${SHOPIFY_STOREFRONT_GRAPHQL_VERSION}/graphql.json`;

  return {
    async execute<T extends Readonly<Record<string, unknown>>>(
      input: ShopifyStorefrontGraphqlRequest,
    ): Promise<T> {
      const body = graphqlInput(input);
      const headers = new Headers({
        "Content-Type": "application/json",
        Accept: "application/json",
      });
      headers.set(
        isPublic ? "X-Shopify-Storefront-Access-Token" : "Shopify-Storefront-Private-Token",
        token,
      );
      if (input.audience.kind === "buyer") {
        headers.set("Shopify-Storefront-Buyer-IP", input.audience.ip);
      }
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers,
          body,
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        return fail("SHOPIFY_STOREFRONT_UNAVAILABLE");
      }
      // No retry of mutations: remote cart writes may already have completed.
      if (response.status === 401 || response.status === 403) {
        return fail("SHOPIFY_STOREFRONT_AUTH_FAILED");
      }
      if (response.status === 429) return fail("SHOPIFY_STOREFRONT_RATE_LIMITED");
      if (!response.ok) return fail("SHOPIFY_STOREFRONT_UNAVAILABLE");
      const length = response.headers.get("content-length");
      if (length && Number(length) > MAX_RESPONSE_BYTES) {
        return fail("SHOPIFY_STOREFRONT_RESPONSE_INVALID");
      }
      let payload: unknown;
      try {
        const raw = await response.text();
        if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
          return fail("SHOPIFY_STOREFRONT_RESPONSE_INVALID");
        }
        payload = JSON.parse(raw);
      } catch {
        return fail("SHOPIFY_STOREFRONT_RESPONSE_INVALID");
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return fail("SHOPIFY_STOREFRONT_RESPONSE_INVALID");
      }
      const result = payload as Record<string, unknown>;
      if (result.errors !== undefined &&
          (!Array.isArray(result.errors) || result.errors.length > 0)) {
        return fail("SHOPIFY_STOREFRONT_GRAPHQL_FAILED");
      }
      if (!result.data || typeof result.data !== "object" ||
          Array.isArray(result.data)) {
        return fail("SHOPIFY_STOREFRONT_RESPONSE_INVALID");
      }
      // Domain-specific callers validate product/cart shapes and userErrors.
      return result.data as T;
    },
  };
}
