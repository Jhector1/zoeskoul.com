import "server-only";

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@zoeskoul/db";
import {
  getShopifyCommerceAccessScopes,
  parseShopifyStoreIdentity,
  type ShopifyAuthorizationCredential,
  type ShopifyAuthorizationPort,
} from "@zoeskoul/build-imports";
import type { BuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import { activateCommerceProviderCredentialConnection } from "./commerceProviderConnectionLifecycle";
import type { CommerceProviderEnvironment } from "./nativeCommerceProvider";

const SHOP_HOST = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const SKEW_MS = 60_000;
const LEASE_MS = 120_000;

export class ShopifyOAuthVaultError extends Error {
  readonly code = "SHOPIFY_OAUTH_CREDENTIAL_UNAVAILABLE" as const;
  constructor() {
    super("Shopify credentials are unavailable; reconnect or retry safely.");
    this.name = "ShopifyOAuthVaultError";
  }
}
function reject(): never { throw new ShopifyOAuthVaultError(); }

type VaultRecord = Readonly<{
  version: 1;
  kind: "shopify-offline-oauth";
  buildProjectId: string;
  storeId: string;
  shopHostname: string;
  environment: CommerceProviderEnvironment;
  accessToken: string;
  refreshToken: string;
  scopes: readonly string[];
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}>;

type CredentialScope = Readonly<{
  buildProjectId: string;
  storeId: string;
  environment: CommerceProviderEnvironment;
  shopHostname: string;
  secretStore: BuildSecretStore;
}>;

function validatedScope(input: CredentialScope) {
  if (!input.buildProjectId.trim() || !input.storeId.trim() ||
      (input.environment !== "test" && input.environment !== "live") ||
      !SHOP_HOST.test(input.shopHostname)) reject();
  return input;
}

function completeCredential(value: ShopifyAuthorizationCredential, now: Date) {
  const scopes = getShopifyCommerceAccessScopes();
  const accessExpiry = value.accessTokenExpiresAt && Date.parse(value.accessTokenExpiresAt);
  const refreshExpiry = value.refreshTokenExpiresAt && Date.parse(value.refreshTokenExpiresAt);
  if (!value.accessToken?.trim() || !value.refreshToken?.trim() ||
      !accessExpiry || !refreshExpiry ||
      accessExpiry <= now.getTime() + SKEW_MS ||
      refreshExpiry <= accessExpiry ||
      !scopes.every((scope) => value.scopes.includes(scope))) reject();
  return { accessExpiry, refreshExpiry };
}

function asVaultRecord(
  credential: ShopifyAuthorizationCredential,
  scope: CredentialScope,
  now: Date,
): VaultRecord {
  completeCredential(credential, now);
  return {
    version: 1, kind: "shopify-offline-oauth",
    buildProjectId: scope.buildProjectId,
    storeId: scope.storeId,
    shopHostname: scope.shopHostname,
    environment: scope.environment,
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken!,
    scopes: [...credential.scopes],
    accessTokenExpiresAt: credential.accessTokenExpiresAt!,
    refreshTokenExpiresAt: credential.refreshTokenExpiresAt!,
  };
}

function parseVault(value: unknown, scope: CredentialScope, now: Date): VaultRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject();
  const record = value as Record<string, unknown>;
  if (record.kind !== "shopify-offline-oauth" || record.version !== 1 ||
      record.buildProjectId !== scope.buildProjectId ||
      record.storeId !== scope.storeId ||
      record.shopHostname !== scope.shopHostname ||
      record.environment !== scope.environment ||
      typeof record.accessToken !== "string" ||
      typeof record.refreshToken !== "string" ||
      typeof record.accessTokenExpiresAt !== "string" ||
      typeof record.refreshTokenExpiresAt !== "string" ||
      !Array.isArray(record.scopes) ||
      !record.scopes.every((s) => typeof s === "string")) reject();
  const normalized = record as unknown as VaultRecord;
  if (!normalized.accessToken || !normalized.refreshToken ||
      !Number.isFinite(Date.parse(normalized.accessTokenExpiresAt)) ||
      Date.parse(normalized.refreshTokenExpiresAt) <= now.getTime() + SKEW_MS ||
      !getShopifyCommerceAccessScopes().every((s) => normalized.scopes.includes(s))) reject();
  return normalized;
}

/** Activate only an already authenticated and callback-verified Shopify connection. */
export async function activateShopifyOfflineConnection(
  client: PrismaClient,
  input: CredentialScope & Readonly<{ credential: ShopifyAuthorizationCredential; now?: Date }>,
) {
  const scope = validatedScope(input);
  const credential = asVaultRecord(input.credential, scope, input.now ?? new Date());
  return activateCommerceProviderCredentialConnection(client, {
    buildProjectId: scope.buildProjectId,
    storeId: scope.storeId,
    provider: "shopify",
    environment: scope.environment,
    credentials: { ...credential, scopes: [...credential.scopes] },
    secretStore: scope.secretStore,
  });
}

/**
 * Refresh under an exclusive persisted lease. The conditional secret-reference
 * swap prevents overwriting a disconnected/reconnected provider connection.
 * Caller must fail closed on errors; do not retry a possibly-consumed token blindly.
 */
export async function refreshShopifyOfflineConnection(
  client: PrismaClient,
  input: CredentialScope & Readonly<{
    authorizationPort: Pick<ShopifyAuthorizationPort, "refreshAuthorizationCredential">;
    now?: Date;
  }>,
): Promise<Readonly<{ status: "valid" | "rotated" }>> {
  const scope = validatedScope(input);
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) reject();
  const key = {
    storeId: scope.storeId,
    provider: "shopify",
    environment: scope.environment,
  } as const;
  const connection = await client.commerceProviderConnection.findUnique({
    where: { storeId_provider_environment: key },
    select: { id: true, status: true, credentialsSecretRef: true },
  });
  if (!connection || connection.status !== "active" ||
      !connection.credentialsSecretRef) reject();
  const connectionId = connection.id;
  const owner = randomBytes(24).toString("hex");
  const leaseClockStartedAtMs = Date.now();
  const expiresAt = new Date(now.getTime() + LEASE_MS);

  // Unique primary key prevents overlapping remote refresh requests, even
  // across different ZoeBuild worker processes.
  try {
    await client.commerceProviderOAuthRefreshLease.create({
      data: { connectionId, owner, expiresAt },
    });
  } catch {
    const stolen = await client.commerceProviderOAuthRefreshLease.updateMany({
      where: { connectionId, expiresAt: { lt: now } },
      data: { owner, expiresAt },
    });
    if (stolen.count !== 1) reject();
  }

  try {
    const current = await client.commerceProviderConnection.findUnique({
      where: { storeId_provider_environment: key },
      select: { id: true, status: true, credentialsSecretRef: true },
    });
    if (!current || current.id !== connectionId || current.status !== "active" ||
        !current.credentialsSecretRef) reject();
    const previousRef = current.credentialsSecretRef;
    const saved = parseVault(await scope.secretStore.read({
      buildProjectId: scope.buildProjectId, secretRef: previousRef,
    }), scope, now);
    if (Date.parse(saved.accessTokenExpiresAt) > now.getTime() + SKEW_MS) {
      return { status: "valid" };
    }
    // Refresh-token lifetime is checked above; no fallback to another shop/env.
    let renewed: ShopifyAuthorizationCredential;
    try {
      renewed = await input.authorizationPort.refreshAuthorizationCredential({
        store: parseShopifyStoreIdentity(scope.shopHostname),
        refreshToken: saved.refreshToken,
      });
    } catch {
      // Never allow provider errors to echo access/refresh token values.
      reject();
    }
    // Shopify may already have rotated the remote refresh token. If local
    // persistence now fails, disable only the unchanged old connection rather
    // than trying to reuse potentially consumed credentials indefinitely.
    let leaseOwnershipLost = false;
    try {
      const replacement = asVaultRecord(renewed, scope, now);
      const stored = await scope.secretStore.put({
        buildProjectId: scope.buildProjectId,
        value: { ...replacement, scopes: [...replacement.scopes] },
      });
      let swapped = false;
      try {
        // Fence the lease owner and the connection CAS in one database
        // transaction. A worker that lost its lease cannot publish rotated
        // credentials, even if its remote Shopify call eventually returns.
        const elapsedMs = Math.max(0, Date.now() - leaseClockStartedAtMs);
        const fenceNow = new Date(now.getTime() + elapsedMs);
        swapped = await client.$transaction(async (tx) => {
          const lease = await tx.commerceProviderOAuthRefreshLease.updateMany({
            where: { connectionId, owner, expiresAt: { gt: fenceNow } },
            data: { owner },
          });
          if (lease.count !== 1) {
            leaseOwnershipLost = true;
            return false;
          }
          const result = await tx.commerceProviderConnection.updateMany({
            where: {
              id: connectionId,
              ...key,
              status: "active",
              credentialsSecretRef: previousRef,
            },
            data: { credentialsSecretRef: stored.secretRef },
          });
          return result.count === 1;
        });
      } finally {
        if (!swapped) {
          await scope.secretStore.delete({
            buildProjectId: scope.buildProjectId, secretRef: stored.secretRef,
          }).catch(() => undefined);
        }
      }
      if (!swapped) reject();
      await scope.secretStore.delete({
        buildProjectId: scope.buildProjectId, secretRef: previousRef,
      }).catch(() => undefined);
      return { status: "rotated" };
    } catch {
      // Lease handoff is not a failed authorization. The new owner must be
      // allowed to finish without the stale worker disabling its connection.
      if (!leaseOwnershipLost) {
        await client.commerceProviderConnection.updateMany({
          where: { id: connectionId, ...key, status: "active", credentialsSecretRef: previousRef },
          data: { status: "error" },
        }).catch(() => undefined);
      }
      reject();
    }
  } finally {
    await client.commerceProviderOAuthRefreshLease.deleteMany({
      where: { connectionId, owner },
    }).catch(() => undefined);
  }
}
