import "server-only";

import type { PrismaClient } from "@zoeskoul/db";
import { getShopifyCommerceAccessScopes } from "@zoeskoul/build-imports";
import type { BuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import { createShopifyStorefrontGraphql } from "./shopifyStorefrontGraphql";

const SHOP = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;
const MAX_BYTES = 512_000;
const ADMIN_VERSION = "2026-10";
const CREATE = `mutation ZoeBuildStorefrontToken($input: StorefrontAccessTokenInput!) {
  storefrontAccessTokenCreate(input: $input) {
    userErrors { message }
    storefrontAccessToken { accessToken accessScopes { handle } }
    shop { id }
  }
}`;

type Scope = Readonly<{
  buildProjectId: string;
  storeId: string;
  shopHostname: string;
  environment: "test" | "live";
  secretStore: BuildSecretStore;
  fetchImpl?: typeof fetch;
}>;

export class ShopifyStorefrontProvisioningError extends Error {
  constructor() {
    super("Shopify Storefront setup could not be completed. Reconnect Shopify securely.");
    this.name = "ShopifyStorefrontProvisioningError";
  }
}
function reject(): never { throw new ShopifyStorefrontProvisioningError(); }
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject();
  return value as Record<string, unknown>;
}

/** After a verified, owner-authorized OAuth callback, provision the Storefront
 * token from the server-held Admin credential. The merchant never supplies a
 * Headless secret, and generated code never receives any credential. */
export async function provisionShopifyStorefrontAfterOAuth(client: PrismaClient, scope: Scope) {
  if (!scope.buildProjectId || !scope.storeId || !SHOP.test(scope.shopHostname) ||
      (scope.environment !== "test" && scope.environment !== "live")) reject();

  const connection = await client.commerceProviderConnection.findUnique({
    where: { storeId_provider_environment: {
      storeId: scope.storeId, provider: "shopify", environment: scope.environment,
    } },
    select: { id: true, status: true, credentialsSecretRef: true, storefrontSecretRef: true },
  });
  if (!connection || connection.status !== "active" || !connection.credentialsSecretRef) reject();
  const admin = obj(await scope.secretStore.read({
    buildProjectId: scope.buildProjectId,
    secretRef: connection.credentialsSecretRef,
  }));
  if (admin.kind !== "shopify-offline-oauth" || admin.version !== 1 ||
      admin.buildProjectId !== scope.buildProjectId || admin.storeId !== scope.storeId ||
      admin.shopHostname !== scope.shopHostname || admin.environment !== scope.environment ||
      typeof admin.accessToken !== "string" || !admin.accessToken ||
      typeof admin.accessTokenExpiresAt !== "string" ||
      Date.parse(admin.accessTokenExpiresAt) <= Date.now() + 10_000) reject();

  const fetchImpl = scope.fetchImpl ?? fetch;
  // Avoid minting a new token on every reconnect; Shopify limits the number of
  // active Storefront tokens. Reuse only one verified for this exact scope.
  if (connection.storefrontSecretRef) {
    try {
      const old = obj(await scope.secretStore.read({
        buildProjectId: scope.buildProjectId,
        secretRef: connection.storefrontSecretRef,
      }));
      if (old.kind === "shopify-storefront-public" && old.version === 1 &&
          old.buildProjectId === scope.buildProjectId && old.storeId === scope.storeId &&
          old.environment === scope.environment && old.shopHostname === scope.shopHostname &&
          typeof old.publicToken === "string") {
        const previous = createShopifyStorefrontGraphql({
          shopHostname: scope.shopHostname, environment: scope.environment,
          publicToken: old.publicToken, fetchImpl,
        });
        const checked = await previous.execute<{ shop: { id: string } }>({
          document: "query ZoeBuildStorefrontIdentity { shop { id } }",
          audience: { kind: "system" },
        });
        if (/^gid:\/\/shopify\/Shop\/\d+$/.test(checked.shop?.id ?? "")) {
          return { status: "configured" as const };
        }
      }
    } catch { /* Invalid or revoked token: issue a new one after OAuth. */ }
  }
  let response: Response;
  try {
    response = await fetchImpl(`https://${scope.shopHostname}/admin/api/${ADMIN_VERSION}/graphql.json`, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": admin.accessToken,
      },
      body: JSON.stringify({ query: CREATE, variables: { input: { title: "ZoeBuild Storefront" } } }),
    });
  } catch { return reject(); }
  if (!response.ok || Number(response.headers.get("content-length") || 0) > MAX_BYTES) reject();
  let raw: string;
  try { raw = await response.text(); } catch { return reject(); }
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) reject();
  let payload: Record<string, unknown>;
  try { payload = obj(JSON.parse(raw)); } catch { return reject(); }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) reject();
  const result = obj(obj(payload.data).storefrontAccessTokenCreate);
  if (!Array.isArray(result.userErrors) || result.userErrors.length) reject();
  const tokenData = obj(result.storefrontAccessToken);
  const accessToken = tokenData.accessToken;
  const scopes = tokenData.accessScopes;
  if (typeof accessToken !== "string" || !accessToken.trim() ||
      accessToken.length > 4096 || /[\r\n\x00-\x1f\x7f]/.test(accessToken) ||
      !Array.isArray(scopes)) reject();
  const handles = scopes.map((entry) => obj(entry).handle);
  if (!getShopifyCommerceAccessScopes().every((required) => handles.includes(required))) reject();

  // Verify Shopify itself accepts the issued Storefront token before saving it.
  const graphql = createShopifyStorefrontGraphql({
    shopHostname: scope.shopHostname,
    environment: scope.environment,
    publicToken: accessToken,
    fetchImpl,
  });
  try {
    const verified = await graphql.execute<{ shop: { id: string } }>({
      document: "query ZoeBuildStorefrontIdentity { shop { id } }",
      audience: { kind: "system" },
    });
    if (!/^gid:\/\/shopify\/Shop\/\d+$/.test(verified.shop?.id ?? "")) reject();
  } catch { return reject(); }

  const stored = await scope.secretStore.put({
    buildProjectId: scope.buildProjectId,
    value: {
      kind: "shopify-storefront-public",
      version: 1,
      buildProjectId: scope.buildProjectId,
      storeId: scope.storeId,
      environment: scope.environment,
      shopHostname: scope.shopHostname,
      publicToken: accessToken,
    },
  });
  let swapped = false;
  try {
    const result = await client.commerceProviderConnection.updateMany({
      where: {
        id: connection.id, storeId: scope.storeId, provider: "shopify",
        environment: scope.environment, status: "active",
        credentialsSecretRef: connection.credentialsSecretRef,
        storefrontSecretRef: connection.storefrontSecretRef,
      },
      data: { storefrontSecretRef: stored.secretRef },
    });
    swapped = result.count === 1;
    if (!swapped) reject();
  } finally {
    if (!swapped) await scope.secretStore.delete({
      buildProjectId: scope.buildProjectId, secretRef: stored.secretRef,
    }).catch(() => undefined);
  }
  if (connection.storefrontSecretRef && connection.storefrontSecretRef !== stored.secretRef) {
    await scope.secretStore.delete({
      buildProjectId: scope.buildProjectId, secretRef: connection.storefrontSecretRef,
    }).catch(() => undefined);
  }
  return { status: "configured" as const };
}
