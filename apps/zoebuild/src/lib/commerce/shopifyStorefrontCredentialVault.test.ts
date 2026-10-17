import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import type { BuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import {
  configureShopifyStorefrontPrivateCredential,
  resolveShopifyStorefrontGraphqlConnection,
} from "./shopifyStorefrontCredentialVault";

const PROJECT = "build-1";
const STORE = "store-1";
const SHOP_TEST = "test-store.myshopify.com";
const SHOP_LIVE = "live-store.myshopify.com";
const PRIVATE_TOKEN = "private-storefront-token-1";
const ADMIN_REF = "secret:admin-test";
const STORE_REF = "secret:storefront-previous";

type Environment = "test" | "live";
type RecordValue = Record<string, unknown>;

function fixture(options: Readonly<{
  environment?: Environment;
  existingStorefront?: boolean;
  conflictingOtherShop?: boolean;
  wrongAdminShop?: boolean;
  status?: "active" | "disconnected";
}> = {}) {
  const environment = options.environment ?? "test";
  const shopHostname = environment === "test" ? SHOP_TEST : SHOP_LIVE;
  const admin = {
    version: 1, kind: "shopify-offline-oauth", buildProjectId: PROJECT, storeId: STORE,
    environment, shopHostname: options.wrongAdminShop ? SHOP_LIVE : shopHostname,
    accessToken: "admin-access-token", refreshToken: "admin-refresh-token",
    refreshTokenExpiresAt: "2099-12-31T00:00:00.000Z",
  };
  const saved = new Map<string, RecordValue>([[ADMIN_REF, admin]]);
  let nextId = 0;
  let storefrontRef: string | null = options.existingStorefront ? STORE_REF : null;
  if (options.existingStorefront) saved.set(STORE_REF, {
    version: 1, kind: "shopify-private-storefront", buildProjectId: PROJECT,
    storeId: STORE, environment, shopHostname, privateToken: "private-storefront-token-old",
  });
  const put = vi.fn(async ({ value }: { value: RecordValue }) => {
    const secretRef = `secret:new-${++nextId}`;
    saved.set(secretRef, value);
    return { secretRef };
  });
  const read = vi.fn(async ({ secretRef }: { secretRef: string }) => {
    if (!saved.has(secretRef)) throw new Error("Missing secret");
    return saved.get(secretRef);
  });
  const deleteSecret = vi.fn(async ({ secretRef }: { secretRef: string }) => { saved.delete(secretRef); });
  const secretStore = { put, read, delete: deleteSecret } as unknown as BuildSecretStore;
  const findUnique = vi.fn(async (query: { where: { storeId_provider_environment: { environment: Environment } } }) => {
    const selected = query.where.storeId_provider_environment.environment;
    if (selected !== environment) {
      if (!options.conflictingOtherShop) return null;
      const otherEnvironment = environment === "test" ? "live" : "test";
      const ref = "secret:other";
      saved.set(ref, {
        ...admin, environment: otherEnvironment,
        shopHostname,
      });
      return { id: "other-connection", status: "active", credentialsSecretRef: ref, storefrontSecretRef: null };
    }
    return {
      id: "connection-1", status: options.status ?? "active",
      credentialsSecretRef: ADMIN_REF,
      storefrontSecretRef: storefrontRef,
    };
  });
  const updateMany = vi.fn(async (query: {
    where: { status: string; credentialsSecretRef: string; storefrontSecretRef: string | null };
    data: { storefrontSecretRef: string };
  }) => {
    if (query.where.status !== "active" || query.where.credentialsSecretRef !== ADMIN_REF ||
        query.where.storefrontSecretRef !== storefrontRef || options.status === "disconnected") {
      return { count: 0 };
    }
    storefrontRef = query.data.storefrontSecretRef;
    return { count: 1 };
  });
  const client = { commerceProviderConnection: { findUnique, updateMany } } as unknown as PrismaClient;
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
    data: { shop: { id: "gid://shopify/Shop/123" } },
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
  const scope = { buildProjectId: PROJECT, storeId: STORE, environment, shopHostname, secretStore };
  return { client, scope, findUnique, updateMany, put, read, deleteSecret, fetchImpl, saved,
    get storefrontRef() { return storefrontRef; },
  };
}

describe("Shopify private Storefront credential vault", () => {
  it("checks private header on the exact shop, stores only an encrypted-ref pointer, and returns no token", async () => {
    const f = fixture();
    const result = await configureShopifyStorefrontPrivateCredential(f.client, {
      ...f.scope, privateToken: PRIVATE_TOKEN, fetchImpl: f.fetchImpl,
    });
    expect(result).toEqual({ provider: "shopify", environment: "test", status: "configured" });
    expect(JSON.stringify(result)).not.toContain(PRIVATE_TOKEN);
    expect(JSON.stringify(result)).not.toContain("admin-access-token");
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (f.fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`https://${SHOP_TEST}/api/2026-10/graphql.json`);
    expect(new Headers(init.headers).get("Shopify-Storefront-Private-Token")).toBe(PRIVATE_TOKEN);
    expect(new Headers(init.headers).get("X-Shopify-Access-Token")).toBeNull();
    expect(f.put).toHaveBeenCalledTimes(1);
    expect(f.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        credentialsSecretRef: ADMIN_REF, storefrontSecretRef: null,
        environment: "test", status: "active",
      }),
      data: { storefrontSecretRef: f.storefrontRef },
    }));
    expect(f.saved.get(String(f.storefrontRef))).toMatchObject({
      kind: "shopify-private-storefront", shopHostname: SHOP_TEST, privateToken: PRIVATE_TOKEN,
    });
  });

  it("reads only the exact environment and returns a server-side execution port", async () => {
    const f = fixture({ existingStorefront: true });
    const graphql = await resolveShopifyStorefrontGraphqlConnection(f.client, { ...f.scope, fetchImpl: f.fetchImpl });
    expect(graphql).toHaveProperty("execute");
    await graphql.execute({ document: "query Shop { shop { id } }", audience: { kind: "system" } });
    const [, init] = (f.fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(new Headers(init.headers).get("Shopify-Storefront-Private-Token"))
      .toBe("private-storefront-token-old");
    expect(JSON.stringify(Object.keys(graphql))).not.toContain("token");
    expect(f.put).not.toHaveBeenCalled();
  });

  it("rejects an absent or inactive Shopify Admin OAuth connection without a Shopify request", async () => {
    const f = fixture({ status: "disconnected" });
    await expect(configureShopifyStorefrontPrivateCredential(f.client, {
      ...f.scope, privateToken: PRIVATE_TOKEN, fetchImpl: f.fetchImpl,
    })).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_CREDENTIAL_UNAVAILABLE" });
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
  });

  it("rejects different-shop Admin OAuth credentials, even when the proposed Storefront token is valid", async () => {
    const f = fixture({ wrongAdminShop: true });
    await expect(configureShopifyStorefrontPrivateCredential(f.client, {
      ...f.scope, privateToken: PRIVATE_TOKEN, fetchImpl: f.fetchImpl,
    })).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_CREDENTIAL_UNAVAILABLE" });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it("never accepts an Admin OAuth access token or refresh token as the Storefront private credential", async () => {
    const f = fixture();
    for (const privateToken of ["admin-access-token", "admin-refresh-token"]) {
      await expect(configureShopifyStorefrontPrivateCredential(f.client, {
        ...f.scope, privateToken, fetchImpl: f.fetchImpl,
      })).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_CREDENTIAL_UNAVAILABLE" });
    }
    expect(f.put).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects same shop configured in opposite test/live environments", async () => {
    const f = fixture({ conflictingOtherShop: true });
    await expect(configureShopifyStorefrontPrivateCredential(f.client, {
      ...f.scope, privateToken: PRIVATE_TOKEN, fetchImpl: f.fetchImpl,
    })).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_CREDENTIAL_UNAVAILABLE" });
    expect(f.put).not.toHaveBeenCalled();
  });

  it("refuses non-Shopify hostnames, invalid environment and CRLF token injection", async () => {
    const f = fixture();
    for (const override of [
      { shopHostname: "a.myshopify.com.evil.com" },
      { environment: "production" as "test" },
      { privateToken: "evil\r\nX-Foo: yes" },
    ]) {
      await expect(configureShopifyStorefrontPrivateCredential(f.client, {
        ...f.scope, privateToken: PRIVATE_TOKEN, fetchImpl: f.fetchImpl, ...override,
      })).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_CREDENTIAL_UNAVAILABLE" });
    }
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it("does not save a token if remote private-token probe fails", async () => {
    const f = fixture();
    const fetchImpl = vi.fn(async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
    await expect(configureShopifyStorefrontPrivateCredential(f.client, {
      ...f.scope, privateToken: PRIVATE_TOKEN, fetchImpl,
    })).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_CREDENTIAL_UNAVAILABLE" });
    expect(f.put).not.toHaveBeenCalled();
  });

  it("fences concurrent disconnects and cleans the newly staged vault record", async () => {
    const f = fixture();
    f.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(configureShopifyStorefrontPrivateCredential(f.client, {
      ...f.scope, privateToken: PRIVATE_TOKEN, fetchImpl: f.fetchImpl,
    })).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_CREDENTIAL_UNAVAILABLE" });
    expect(f.deleteSecret).toHaveBeenCalledTimes(1);
    expect(f.saved.has("secret:new-1")).toBe(false);
  });

  it("rotates the private Storefront credential independently of Admin OAuth, deleting the old secret", async () => {
    const f = fixture({ existingStorefront: true });
    await configureShopifyStorefrontPrivateCredential(f.client, {
      ...f.scope, privateToken: PRIVATE_TOKEN, fetchImpl: f.fetchImpl,
    });
    expect(f.deleteSecret).toHaveBeenCalledWith({ buildProjectId: PROJECT, secretRef: STORE_REF });
    expect(f.saved.has(STORE_REF)).toBe(false);
    expect(f.saved.has(ADMIN_REF)).toBe(true);
    expect(f.storefrontRef).not.toBe(ADMIN_REF);
  });

  it("fails closed on cross-environment or corrupt stored vault records", async () => {
    const f = fixture({ existingStorefront: true });
    f.saved.set(STORE_REF, {
      version: 1, kind: "shopify-private-storefront", buildProjectId: PROJECT,
      storeId: STORE, environment: "live", shopHostname: SHOP_TEST, privateToken: PRIVATE_TOKEN,
    });
    await expect(resolveShopifyStorefrontGraphqlConnection(f.client, {
      ...f.scope, fetchImpl: f.fetchImpl,
    })).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_CREDENTIAL_UNAVAILABLE" });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});
