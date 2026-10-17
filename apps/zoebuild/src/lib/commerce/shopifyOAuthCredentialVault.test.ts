import { describe, expect, it, vi } from "vitest";
import {
  activateShopifyOfflineConnection,
  refreshShopifyOfflineConnection,
} from "./shopifyOAuthCredentialVault";
import { getShopifyCommerceAccessScopes } from "@zoeskoul/build-imports";

const now = new Date("2026-10-17T20:00:00.000Z");
const scopes = [...getShopifyCommerceAccessScopes()];
const credential = {
  accessToken: "original_admin_token",
  refreshToken: "original_refresh_token",
  scopes,
  accessTokenExpiresAt: "2026-10-17T20:00:30.000Z",
  refreshTokenExpiresAt: "2027-01-15T20:00:00.000Z",
};

function fake() {
  const values = new Map<string, any>();
  let i = 0;
  const secrets = {
    put: vi.fn(async ({ value }: any) => {
      const secretRef = `encrypted_${++i}`;
      values.set(secretRef, value);
      return { secretRef };
    }),
    read: vi.fn(async ({ secretRef }: any) => values.get(secretRef)),
    delete: vi.fn(async ({ secretRef }: any) => { values.delete(secretRef); }),
  } as any;
  const row = { id: "conn_1", status: "active", credentialsSecretRef: "" };
  let lease: any = null;
  const db = {
    commerceProviderConnection: {
      findUnique: vi.fn(async () => row.credentialsSecretRef ? { ...row } : null),
      upsert: vi.fn(async (arg: any) => {
        row.credentialsSecretRef = arg.create.credentialsSecretRef;
        return { id: row.id };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (where.credentialsSecretRef !== row.credentialsSecretRef || row.status !== "active") return { count: 0 };
        if (Object.prototype.hasOwnProperty.call(data, "credentialsSecretRef")) {
          row.credentialsSecretRef = data.credentialsSecretRef;
        }
        if (data.status) row.status = data.status;
        return { count: 1 };
      }),
    },
    commerceProviderOAuthRefreshLease: {
      create: vi.fn(async ({ data }: any) => {
        if (lease) throw new Error("lease exists");
        lease = data;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (!lease) return { count: 0 };
        if (typeof where.owner === "string") {
          if (lease.owner !== where.owner || !(lease.expiresAt > where.expiresAt.gt)) {
            return { count: 0 };
          }
        } else if (lease.expiresAt >= where.expiresAt.lt) {
          return { count: 0 };
        }
        lease = { ...lease, ...data }; return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        if (lease?.owner === where.owner) lease = null;
      }),
    },
    $transaction: vi.fn(async (action: (tx: any) => Promise<unknown>) => action(db)),
  } as any;
  const options = {
    buildProjectId: "build_1", storeId: "store_1",
    environment: "test" as const, shopHostname: "demo.myshopify.com",
    secretStore: secrets, now,
  };
  return { db, secrets, values, row, options, lease: () => lease };
}

const renewed = {
  accessToken: "rotated_access_secret",
  refreshToken: "rotated_refresh_secret",
  scopes,
  accessTokenExpiresAt: "2026-10-17T21:00:00.000Z",
  refreshTokenExpiresAt: "2027-01-15T21:00:00.000Z",
};

describe("Shopify offline OAuth credential vault", () => {
  it("activates via BuildSecretStore rather than persisting plaintext database credentials", async () => {
    const { db, secrets, row, options, values } = fake();
    await expect(activateShopifyOfflineConnection(db, {
      ...options, credential: { ...credential, accessTokenExpiresAt: "2026-10-17T21:00:00.000Z" },
    })).resolves.toMatchObject({ provider: "shopify", environment: "test", status: "active" });
    expect(row.credentialsSecretRef).toMatch(/^encrypted_/);
    expect(db.commerceProviderConnection.upsert.mock.calls[0][0].create).not.toHaveProperty("accessToken");
    expect([...values.values()][0]).toMatchObject({
      kind: "shopify-offline-oauth", buildProjectId: "build_1", storeId: "store_1",
      environment: "test", shopHostname: "demo.myshopify.com",
    });
    expect(secrets.put).toHaveBeenCalledTimes(1);
  });

  it("refreshes with exclusive lease and atomically swaps encrypted credential refs", async () => {
    const { db, secrets, row, options, values, lease } = fake();
    const old = await secrets.put({ value: {
      version: 1, kind: "shopify-offline-oauth", buildProjectId: "build_1", storeId: "store_1", shopHostname: "demo.myshopify.com",
      environment: "test", ...credential,
    } });
    row.credentialsSecretRef = old.secretRef;
    const transport = { refreshAuthorizationCredential: vi.fn(async () => renewed) };
    await expect(refreshShopifyOfflineConnection(db, {
      ...options, authorizationPort: transport,
    })).resolves.toEqual({ status: "rotated" });
    expect(transport.refreshAuthorizationCredential).toHaveBeenCalledWith({
      store: { hostname: "demo.myshopify.com", origin: "https://demo.myshopify.com/" },
      refreshToken: "original_refresh_token",
    });
    expect(db.commerceProviderConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ environment: "test", provider: "shopify", credentialsSecretRef: old.secretRef }),
    }));
    expect(values.has(old.secretRef)).toBe(false);
    expect(values.get(row.credentialsSecretRef)).toMatchObject({ refreshToken: "rotated_refresh_secret" });
    expect(lease()).toBeNull();
  });

  it("rejects mismatched test/live credentials before any remote refresh", async () => {
    const { db, secrets, row, options } = fake();
    const old = await secrets.put({ value: {
      version: 1, kind: "shopify-offline-oauth", buildProjectId: "build_1", storeId: "store_1", shopHostname: "demo.myshopify.com",
      environment: "live", ...credential,
    } });
    row.credentialsSecretRef = old.secretRef;
    const transport = { refreshAuthorizationCredential: vi.fn(async () => renewed) };
    await expect(refreshShopifyOfflineConnection(db, {
      ...options, authorizationPort: transport,
    })).rejects.toMatchObject({ code: "SHOPIFY_OAUTH_CREDENTIAL_UNAVAILABLE" });
    expect(transport.refreshAuthorizationCredential).not.toHaveBeenCalled();
  });

  it("does not overwrite reconnected credentials after a stale refresh", async () => {
    const { db, secrets, row, options, values } = fake();
    const old = await secrets.put({ value: {
      version: 1, kind: "shopify-offline-oauth", buildProjectId: "build_1", storeId: "store_1", shopHostname: "demo.myshopify.com",
      environment: "test", ...credential,
    } });
    row.credentialsSecretRef = old.secretRef;
    const transport = { refreshAuthorizationCredential: vi.fn(async () => {
      row.credentialsSecretRef = "reconnected_secret";
      return renewed;
    }) };
    await expect(refreshShopifyOfflineConnection(db, {
      ...options, authorizationPort: transport,
    })).rejects.toThrow();
    expect(row.credentialsSecretRef).toBe("reconnected_secret");
    expect([...values.values()].some((s: any) => s?.refreshToken === "rotated_refresh_secret")).toBe(false);
  });

  it("rejects a credential from a different project or store even on the same shop", async () => {
    for (const wrongScope of [
      { buildProjectId: "another_project", storeId: "store_1" },
      { buildProjectId: "build_1", storeId: "another_store" },
    ]) {
      const { db, secrets, row, options } = fake();
      const saved = await secrets.put({ value: {
        version: 1, kind: "shopify-offline-oauth", ...wrongScope,
        shopHostname: "demo.myshopify.com", environment: "test", ...credential,
      } });
      row.credentialsSecretRef = saved.secretRef;
      const transport = { refreshAuthorizationCredential: vi.fn(async () => renewed) };
      await expect(refreshShopifyOfflineConnection(db, {
        ...options, authorizationPort: transport,
      })).rejects.toMatchObject({ code: "SHOPIFY_OAUTH_CREDENTIAL_UNAVAILABLE" });
      expect(transport.refreshAuthorizationCredential).not.toHaveBeenCalled();
    }
  });

  it("rejects a stale refresh response after ownership of the lease changes", async () => {
    const { db, secrets, row, options, values, lease } = fake();
    const saved = await secrets.put({ value: {
      version: 1, kind: "shopify-offline-oauth", buildProjectId: "build_1",
      storeId: "store_1", shopHostname: "demo.myshopify.com",
      environment: "test", ...credential,
    } });
    row.credentialsSecretRef = saved.secretRef;
    const transport = { refreshAuthorizationCredential: vi.fn(async () => {
      lease().owner = "different_worker";
      return renewed;
    }) };
    await expect(refreshShopifyOfflineConnection(db, {
      ...options, authorizationPort: transport,
    })).rejects.toMatchObject({ code: "SHOPIFY_OAUTH_CREDENTIAL_UNAVAILABLE" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(row.credentialsSecretRef).toBe(saved.secretRef);
    expect(row.status).toBe("active");
    expect([...values.values()].some((value: any) =>
      value?.refreshToken === "rotated_refresh_secret")).toBe(false);
  });

  it("rejects a concurrent refresh lease and fails without a second provider request", async () => {
    const { db, secrets, row, options } = fake();
    const old = await secrets.put({ value: {
      version: 1, kind: "shopify-offline-oauth", buildProjectId: "build_1", storeId: "store_1", shopHostname: "demo.myshopify.com",
      environment: "test", ...credential,
    } });
    row.credentialsSecretRef = old.secretRef;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const firstTransport = { refreshAuthorizationCredential: vi.fn(async () => { await blocked; return renewed; }) };
    const first = refreshShopifyOfflineConnection(db, { ...options, authorizationPort: firstTransport });
    await vi.waitFor(() => expect(firstTransport.refreshAuthorizationCredential).toHaveBeenCalledTimes(1));
    const secondTransport = { refreshAuthorizationCredential: vi.fn(async () => renewed) };
    await expect(refreshShopifyOfflineConnection(db, { ...options, authorizationPort: secondTransport }))
      .rejects.toMatchObject({ code: "SHOPIFY_OAUTH_CREDENTIAL_UNAVAILABLE" });
    expect(secondTransport.refreshAuthorizationCredential).not.toHaveBeenCalled();
    release();
    await first;
  });
});
