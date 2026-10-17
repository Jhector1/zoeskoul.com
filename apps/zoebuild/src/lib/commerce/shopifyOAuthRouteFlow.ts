import "server-only";

import { createHash } from "node:crypto";
import type { PrismaClient } from "@zoeskoul/db";
import {
  getShopifyCommerceAccessScopes,
  parseShopifyStoreIdentity,
} from "@zoeskoul/build-imports";
import type { BuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import {
  beginShopifyOAuthState,
  oneTimeShopifyCallbackValidator,
  verifyAndConsumeShopifyOAuthCallback,
  type ShopifyOAuthScope,
} from "./shopifyOAuthCallbackBoundary";
import { activateShopifyOfflineConnection } from "./shopifyOAuthCredentialVault";
import { createShopifyOAuthTransport } from "./shopifyOAuthTransport";

const CANONICAL_SHOP = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const NONCE = /^[A-Za-z0-9_-]{43}$/;

export class ShopifyOAuthRouteFlowError extends Error {
  readonly code = "SHOPIFY_OAUTH_ROUTE_REJECTED" as const;
  constructor() {
    super("Shopify connection could not be completed securely.");
    this.name = "ShopifyOAuthRouteFlowError";
  }
}

function reject(): never { throw new ShopifyOAuthRouteFlowError(); }

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactShop(value: string): string {
  if (!CANONICAL_SHOP.test(value)) reject();
  const parsed = parseShopifyStoreIdentity(value);
  if (parsed.hostname !== value || parsed.origin !== `https://${value}/`) reject();
  return value;
}

export function trustedShopifyOAuthOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { return reject(); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.port || url.search || url.hash || url.pathname !== "/") reject();
  return url.origin;
}

export function shopifyOAuthCallbackUri(input: Readonly<{
  zoebuildOrigin: string;
  buildProjectId: string;
  environment: "test" | "live";
}>): string {
  const origin = trustedShopifyOAuthOrigin(input.zoebuildOrigin);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.buildProjectId) ||
      (input.environment !== "test" && input.environment !== "live")) reject();
  return new URL(
    `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/commerce/providers/shopify/oauth/${input.environment}/callback`,
    `${origin}/`,
  ).toString();
}

export function shopifyOAuthRoutesConfigured(config: Readonly<{
  enabled: string | undefined;
  clientId: string | undefined;
  clientSecret: string | undefined;
}>): boolean {
  return config.enabled === "true" && Boolean(config.clientId?.trim()) &&
    Boolean(config.clientSecret?.trim());
}

/**
 * Existing active connections for the opposite environment must not reuse
 * the same Shopify shop. Missing/unreadable encrypted records fail closed.
 * This is not a substitute for verifying test-store eligibility with Shopify.
 */
export async function assertDistinctShopifyEnvironment(
  client: PrismaClient,
  secretStore: BuildSecretStore,
  scope: Pick<ShopifyOAuthScope, "buildProjectId" | "storeId" | "environment" | "shopHostname">,
): Promise<void> {
  exactShop(scope.shopHostname);
  const opposite = scope.environment === "test" ? "live" : "test";
  const connection = await client.commerceProviderConnection.findUnique({
    where: { storeId_provider_environment: {
      storeId: scope.storeId, provider: "shopify", environment: opposite,
    } },
    select: { status: true, credentialsSecretRef: true },
  });
  if (!connection || connection.status !== "active") return;
  if (!connection.credentialsSecretRef) reject();
  let data: unknown;
  try {
    data = await secretStore.read({
      buildProjectId: scope.buildProjectId,
      secretRef: connection.credentialsSecretRef,
    });
  } catch { return reject(); }
  if (!data || typeof data !== "object" || Array.isArray(data)) reject();
  const record = data as Record<string, unknown>;
  if (record.kind !== "shopify-offline-oauth" || record.version !== 1 ||
      record.buildProjectId !== scope.buildProjectId || record.storeId !== scope.storeId ||
      record.environment !== opposite || typeof record.shopHostname !== "string") reject();
  if (record.shopHostname === scope.shopHostname) reject();
}

export async function startShopifyOAuthFlow(input: Readonly<{
  client: PrismaClient;
  secretStore: BuildSecretStore;
  scope: ShopifyOAuthScope;
  clientId: string;
  clientSecret: string;
  now?: Date;
}>): Promise<Readonly<{ authorizationUrl: string; browserBinding: string }>> {
  const shop = exactShop(input.scope.shopHostname);
  await assertDistinctShopifyEnvironment(input.client, input.secretStore, input.scope);
  const { state, browserBinding } = await beginShopifyOAuthState(
    input.client, input.scope, input.now,
  );
  try {
    const oauth = createShopifyOAuthTransport({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      requiredScopes: getShopifyCommerceAccessScopes(),
      // No code exchange is possible from the initiation service.
      validateCallback: async () => { reject(); },
    });
    const redirect = await oauth.createAuthorizationRedirect({
      store: parseShopifyStoreIdentity(shop),
      state,
      redirectUri: input.scope.redirectUri,
      scopes: getShopifyCommerceAccessScopes(),
    });
    return { authorizationUrl: redirect.url, browserBinding };
  } catch {
    // Never leave a useable state if redirect assembly fails.
    await input.client.commerceProviderOAuthState.deleteMany({
      where: { stateHash: sha(state), consumedAt: null },
    }).catch(() => undefined);
    return reject();
  }
}

/** The Shopify callback state is a database lookup key, not an authority. */
export async function completeShopifyOAuthFlow(input: Readonly<{
  client: PrismaClient;
  secretStore: BuildSecretStore;
  buildProjectId: string;
  storeId: string;
  environment: "test" | "live";
  redirectUri: string;
  callbackUrl: string;
  browserBinding: string | null;
  clientId: string;
  clientSecret: string;
  now?: Date;
}>): Promise<Readonly<{ provider: "shopify"; environment: "test" | "live"; status: "active" }>> {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime()) || !input.browserBinding ||
      input.callbackUrl.length > 8192) reject();
  let callback: URL;
  try { callback = new URL(input.callbackUrl); } catch { return reject(); }
  if (callback.origin + callback.pathname !== input.redirectUri) reject();
  const stateValues = callback.searchParams.getAll("state");
  if (stateValues.length !== 1 || !NONCE.test(stateValues[0])) reject();

  const pending = await input.client.commerceProviderOAuthState.findUnique({
    where: { stateHash: sha(stateValues[0]) },
    select: {
      buildProjectId: true, storeId: true, provider: true,
      environment: true, shopHostname: true, redirectUri: true,
      expiresAt: true, consumedAt: true,
    },
  });
  if (!pending || pending.buildProjectId !== input.buildProjectId ||
      pending.storeId !== input.storeId || pending.provider !== "shopify" ||
      pending.environment !== input.environment || pending.redirectUri !== input.redirectUri ||
      pending.consumedAt !== null || pending.expiresAt <= now) reject();

  const scope: ShopifyOAuthScope = {
    buildProjectId: input.buildProjectId,
    storeId: input.storeId,
    environment: input.environment,
    shopHostname: exactShop(pending.shopHostname),
    redirectUri: input.redirectUri,
  };
  // Deny a reused test/live Shopify shop before consuming the state or code.
  await assertDistinctShopifyEnvironment(input.client, input.secretStore, scope);
  const verified = await verifyAndConsumeShopifyOAuthCallback(input.client, {
    callbackUrl: input.callbackUrl,
    clientSecret: input.clientSecret,
    browserBinding: input.browserBinding,
    scope,
    now,
  });
  const oauth = createShopifyOAuthTransport({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    requiredScopes: getShopifyCommerceAccessScopes(),
    validateCallback: oneTimeShopifyCallbackValidator(verified),
  });
  // The code is only exchanged after HMAC + browser binding + atomic consume.
  const credential = await oauth.exchangeAuthorizationCode(verified);
  // Recheck opposite environment; it might have changed during exchange.
  await assertDistinctShopifyEnvironment(input.client, input.secretStore, scope);
  await activateShopifyOfflineConnection(input.client, {
    ...scope,
    credential,
    secretStore: input.secretStore,
  });
  // Never expose tokens, refresh tokens, or Shopify's raw responses.
  return { provider: "shopify", environment: input.environment, status: "active" };
}
