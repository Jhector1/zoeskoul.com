import { describe, expect, it, vi } from "vitest";
import { provisionShopifyStorefrontAfterOAuth } from "./shopifyStorefrontProvisioning";

function scenario(options: { deny?: boolean; cas?: boolean } = {}) {
  const secrets = new Map<string, unknown>([["admin-ref", {
    version: 1, kind: "shopify-offline-oauth", buildProjectId: "p", storeId: "s",
    shopHostname: "example.myshopify.com", environment: "test",
    accessToken: "shpat_test_only", accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
  }]]);
  const db = {
    commerceProviderConnection: {
      findUnique: vi.fn(async () => ({
        id: "connection", status: "active", credentialsSecretRef: "admin-ref", storefrontSecretRef: null,
      })),
      updateMany: vi.fn(async () => ({ count: options.cas ? 0 : 1 })),
    },
  } as any;
  const vault = {
    read: vi.fn(async ({ secretRef }: any) => secrets.get(secretRef)),
    put: vi.fn(async ({ value }: any) => {
      secrets.set("storefront-ref", value);
      return { secretRef: "storefront-ref" };
    }),
    delete: vi.fn(async ({ secretRef }: any) => { secrets.delete(secretRef); }),
  } as any;
  const mocked = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).includes("/admin/api/")) {
      if (options.deny) return new Response("access denied", { status: 403 });
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Shopify-Access-Token")).toBe("shpat_test_only");
      return Response.json({ data: { storefrontAccessTokenCreate: {
        userErrors: [], storefrontAccessToken: {
          accessToken: "auto-public-token", accessScopes: [
            { handle: "unauthenticated_read_product_listings" },
            { handle: "unauthenticated_read_checkouts" },
            { handle: "unauthenticated_write_checkouts" },
          ],
        }, shop: { id: "gid://shopify/Shop/123" },
      } } });
    }
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Shopify-Storefront-Access-Token")).toBe("auto-public-token");
    expect(headers.get("Shopify-Storefront-Private-Token")).toBeNull();
    return Response.json({ data: { shop: { id: "gid://shopify/Shop/123" } } });
  });
  const input = {
    buildProjectId: "p", storeId: "s", shopHostname: "example.myshopify.com",
    environment: "test" as const, secretStore: vault, fetchImpl: mocked as typeof fetch,
  };
  return { db, vault, secrets, mocked, input };
}

describe("automatic Shopify Storefront setup", () => {
  it("issues a token through authenticated Admin GraphQL and stores it behind the project vault", async () => {
    const s = scenario();
    await expect(provisionShopifyStorefrontAfterOAuth(s.db, s.input)).resolves.toEqual({ status: "configured" });
    expect(s.mocked).toHaveBeenCalledTimes(2);
    expect(s.db.commerceProviderConnection.updateMany).toHaveBeenCalledOnce();
    expect(s.secrets.get("storefront-ref")).toMatchObject({
      kind: "shopify-storefront-public", publicToken: "auto-public-token",
      buildProjectId: "p", environment: "test",
    });
  });
  it("does not save an unverified or denied credential", async () => {
    const s = scenario({ deny: true });
    await expect(provisionShopifyStorefrontAfterOAuth(s.db, s.input)).rejects.toThrow();
    expect(s.vault.put).not.toHaveBeenCalled();
  });
  it("deletes the new secret when the connection compare-and-swap fails", async () => {
    const s = scenario({ cas: true });
    await expect(provisionShopifyStorefrontAfterOAuth(s.db, s.input)).rejects.toThrow();
    expect(s.vault.delete).toHaveBeenCalledWith({ buildProjectId: "p", secretRef: "storefront-ref" });
    expect(s.secrets.has("storefront-ref")).toBe(false);
  });
});
