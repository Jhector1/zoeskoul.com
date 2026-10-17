import "server-only";

import type { PrismaClient } from "@zoeskoul/db";
import type { BuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import { createShopifyStorefrontGraphql } from "./shopifyStorefrontGraphql";

const SHOP_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;
const VALIDATION_QUERY = "query ZoeBuildStorefrontCredentialCheck { shop { id } }";

type Environment = "test" | "live";
type Scope = Readonly<{
  buildProjectId: string;
  storeId: string;
  environment: Environment;
  shopHostname: string;
  secretStore: BuildSecretStore;
}>;
type VaultRecord = Readonly<{
  version: 1;
  kind: "shopify-private-storefront";
  buildProjectId: string;
  storeId: string;
  environment: Environment;
  shopHostname: string;
  privateToken: string;
}>;
type Connection = Readonly<{
  id: string;
  status: string;
  credentialsSecretRef: string | null;
  storefrontSecretRef: string | null;
}>;

export class ShopifyStorefrontCredentialError extends Error {
  readonly code = "SHOPIFY_STOREFRONT_CREDENTIAL_UNAVAILABLE" as const;
  constructor() {
    super("Shopify Storefront credentials are unavailable for this connection.");
    this.name = "ShopifyStorefrontCredentialError";
  }
}
function reject(): never { throw new ShopifyStorefrontCredentialError(); }

function validScope(scope: Scope): Scope {
  if (!scope || typeof scope.buildProjectId !== "string" || !scope.buildProjectId.trim() ||
      typeof scope.storeId !== "string" || !scope.storeId.trim() ||
      (scope.environment !== "test" && scope.environment !== "live") ||
      typeof scope.shopHostname !== "string" || !SHOP_HOST.test(scope.shopHostname) ||
      !scope.secretStore) reject();
  return scope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validAdminVault(value: unknown, scope: Scope): Readonly<{
  accessToken: string;
  refreshToken: string;
}> {
  if (!isRecord(value) || value.kind !== "shopify-offline-oauth" || value.version !== 1 ||
      value.buildProjectId !== scope.buildProjectId || value.storeId !== scope.storeId ||
      value.environment !== scope.environment || value.shopHostname !== scope.shopHostname ||
      typeof value.accessToken !== "string" || !value.accessToken ||
      typeof value.refreshToken !== "string" || !value.refreshToken ||
      typeof value.refreshTokenExpiresAt !== "string" ||
      !(Date.parse(value.refreshTokenExpiresAt) > Date.now())) reject();
  return { accessToken: value.accessToken, refreshToken: value.refreshToken };
}

function validStorefrontVault(value: unknown, scope: Scope): VaultRecord {
  if (!isRecord(value) || value.kind !== "shopify-private-storefront" || value.version !== 1 ||
      value.buildProjectId !== scope.buildProjectId || value.storeId !== scope.storeId ||
      value.environment !== scope.environment || value.shopHostname !== scope.shopHostname ||
      typeof value.privateToken !== "string" || !value.privateToken ||
      value.privateToken !== value.privateToken.trim() ||
      value.privateToken.length > 4096 || /[\x00-\x1f\x7f]/.test(value.privateToken)) reject();
  return value as unknown as VaultRecord;
}

async function activeConnection(client: PrismaClient, scope: Scope): Promise<Connection> {
  const connection = await client.commerceProviderConnection.findUnique({
    where: {
      storeId_provider_environment: {
        storeId: scope.storeId,
        provider: "shopify",
        environment: scope.environment,
      },
    },
    select: { id: true, status: true, credentialsSecretRef: true, storefrontSecretRef: true },
  });
  if (!connection || connection.status !== "active" || !connection.credentialsSecretRef) reject();
  return connection;
}

async function validatedAdminIdentity(connection: Connection, scope: Scope) {
  if (!connection.credentialsSecretRef) reject();
  return validAdminVault(await scope.secretStore.read({
    buildProjectId: scope.buildProjectId,
    secretRef: connection.credentialsSecretRef,
  }), scope);
}

/**
 * Provision only a merchant-supplied private Headless/Storefront token.
 * Caller is responsible for authenticated project-owner authorization and CSRF
 * protection. Never accept a token from generated storefront code.
 * Shopify Admin OAuth and Shopify Storefront tokens occupy separate vault refs.
 */
export async function configureShopifyStorefrontPrivateCredential(
  client: PrismaClient,
  input: Scope & Readonly<{ privateToken: string; fetchImpl?: typeof fetch }>,
): Promise<Readonly<{ provider: "shopify"; environment: Environment; status: "configured" }>> {
  const scope = validScope(input);
  // A private Storefront token must never be manufactured from Admin OAuth.
  // Constructor validates canonical HTTPS Shopify host and header-safe token.
  let graphql: ReturnType<typeof createShopifyStorefrontGraphql>;
  try {
    graphql = createShopifyStorefrontGraphql({
      shopHostname: scope.shopHostname,
      environment: scope.environment,
      privateToken: input.privateToken,
      fetchImpl: input.fetchImpl,
    });
  } catch { return reject(); }
  const connection = await activeConnection(client, scope);
  const admin = await validatedAdminIdentity(connection, scope);
  if (input.privateToken === admin.accessToken || input.privateToken === admin.refreshToken) reject();

  // Refuse reuse of one Shopify shop as both a test and a live connection.
  const other = await client.commerceProviderConnection.findUnique({
    where: {
      storeId_provider_environment: {
        storeId: scope.storeId,
        provider: "shopify",
        environment: scope.environment === "test" ? "live" : "test",
      },
    },
    select: { id: true, status: true, credentialsSecretRef: true, storefrontSecretRef: true },
  });
  if (other?.status === "active" && other.credentialsSecretRef) {
    const otherScope = { ...scope, environment: scope.environment === "test" ? "live" : "test" } as Scope;
    const otherRecord = await scope.secretStore.read({
      buildProjectId: scope.buildProjectId,
      secretRef: other.credentialsSecretRef,
    });
    if (!isRecord(otherRecord) || otherRecord.kind !== "shopify-offline-oauth" ||
        otherRecord.buildProjectId !== scope.buildProjectId || otherRecord.storeId !== scope.storeId ||
        otherRecord.environment !== otherScope.environment ||
        typeof otherRecord.shopHostname !== "string") reject();
    if (otherRecord.shopHostname === scope.shopHostname) reject();
  }

  // Verify the credential with the exact Shopify shop before storing it.
  // The probe is read-only, uses the private-token header, and returns no token.
  try {
    const data = await graphql.execute<{ shop: { id: string } }>({
      document: VALIDATION_QUERY,
      audience: { kind: "system" },
    });
    if (!data.shop || typeof data.shop.id !== "string" ||
        !/^gid:\/\/shopify\/Shop\/\d+$/.test(data.shop.id)) reject();
  } catch { return reject(); }

  const vault: VaultRecord = {
    version: 1,
    kind: "shopify-private-storefront",
    buildProjectId: scope.buildProjectId,
    storeId: scope.storeId,
    environment: scope.environment,
    shopHostname: scope.shopHostname,
    privateToken: input.privateToken,
  };
  const stored = await scope.secretStore.put({
    buildProjectId: scope.buildProjectId,
    value: vault,
  });
  let swapped = false;
  try {
    // Compare-and-swap fences disconnects and concurrent Admin OAuth rotations.
    const result = await client.commerceProviderConnection.updateMany({
      where: {
        id: connection.id,
        storeId: scope.storeId,
        provider: "shopify",
        environment: scope.environment,
        status: "active",
        credentialsSecretRef: connection.credentialsSecretRef,
        storefrontSecretRef: connection.storefrontSecretRef,
      },
      data: { storefrontSecretRef: stored.secretRef },
    });
    if (result.count !== 1) reject();
    swapped = true;
  } finally {
    if (!swapped) {
      await scope.secretStore.delete({
        buildProjectId: scope.buildProjectId,
        secretRef: stored.secretRef,
      }).catch(() => undefined);
    }
  }
  if (connection.storefrontSecretRef && connection.storefrontSecretRef !== stored.secretRef) {
    await scope.secretStore.delete({
      buildProjectId: scope.buildProjectId,
      secretRef: connection.storefrontSecretRef,
    }).catch(() => undefined);
  }
  return { provider: "shopify", environment: scope.environment, status: "configured" };
}

/** Return an execution port, never the raw token or the vault record. */
export async function resolveShopifyStorefrontGraphqlConnection(
  client: PrismaClient,
  input: Scope & Readonly<{ fetchImpl?: typeof fetch }>,
): Promise<ReturnType<typeof createShopifyStorefrontGraphql>> {
  const scope = validScope(input);
  const connection = await activeConnection(client, scope);
  await validatedAdminIdentity(connection, scope);
  if (!connection.storefrontSecretRef) reject();
  const privateCredential = validStorefrontVault(await scope.secretStore.read({
    buildProjectId: scope.buildProjectId,
    secretRef: connection.storefrontSecretRef,
  }), scope);
  try {
    return createShopifyStorefrontGraphql({
      shopHostname: scope.shopHostname,
      environment: scope.environment,
      privateToken: privateCredential.privateToken,
      fetchImpl: input.fetchImpl,
    });
  } catch { return reject(); }
}
