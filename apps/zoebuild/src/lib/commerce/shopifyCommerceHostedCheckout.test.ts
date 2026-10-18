import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import type { BuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import type { CommerceProviderExecutionContext } from "./commerceRuntimeRegistry";
import type { VerifiedCommerceBuyerIp } from "./trustedCommerceBuyerIp";
import { beginShopifyCommerceHostedCheckout } from "./shopifyCommerceRuntimeAdapter";

const mock = vi.hoisted(() => ({
  resolveProvider: vi.fn(),
  resolveStorefront: vi.fn(),
  graph: vi.fn(),
  getCart: vi.fn(),
  resolveCart: vi.fn(),
}));
vi.mock("./commerceProviderResolver", () => ({ resolveCommerceProvider: mock.resolveProvider }));
vi.mock("./shopifyStorefrontCredentialVault", () => ({
  resolveShopifyStorefrontGraphqlConnection: mock.resolveStorefront,
}));
vi.mock("./externalCommerceCartHandle", () => ({
  resolveExternalCommerceCartHandle: mock.resolveCart,
}));
vi.mock("./shopifyStorefrontCart", () => ({
  createShopifyStorefrontCart: () => ({ getCart: mock.getCart }),
}));
vi.mock("./shopifyStorefrontCatalog", () => ({
  createShopifyStorefrontCatalog: () => ({}),
}));
vi.mock("./shopifyOpaqueCartBridge", () => ({
  createShopifyOpaqueCartBridge: () => ({}),
}));

const IP = "198.51.100.25" as VerifiedCommerceBuyerIp;
const opaqueToken = "A".repeat(43);
const remoteCartId = "gid://shopify/Cart/example?key=remote-secret";
const input = {
  buildProjectId: "project-1", surface: "preview" as const,
  request: { cartId: opaqueToken },
};
const cart = {
  remoteCartId, currency: "USD", totalQuantity: 1,
  checkoutUrl: "https://demo-shop.myshopify.com/checkouts/123?key=checkout-secret",
  items: [{ merchandiseId: "gid://shopify/ProductVariant/1", quantity: 1 }],
};
function fixture(): { client: PrismaClient; context: CommerceProviderExecutionContext } {
  const client = {
    commerceStore: { findUnique: vi.fn(async () => ({ id: "store-1", status: "active" })) },
    commerceProviderConnection: { findUnique: vi.fn(async () => ({
      id: "connection-1", status: "active", credentialsSecretRef: "admin-ref",
      storefrontSecretRef: "storefront-ref",
    })) },
  } as unknown as PrismaClient;
  const secretStore = { read: vi.fn(async () => ({
    kind: "shopify-offline-oauth", version: 1,
    buildProjectId: "project-1", storeId: "store-1", environment: "test",
    shopHostname: "demo-shop.myshopify.com",
    refreshTokenExpiresAt: "2999-01-01T00:00:00.000Z",
  })) } as unknown as BuildSecretStore;
  return {
    client,
    context: {
      buildProjectId: "project-1", provider: "shopify", environment: "test",
      verifiedBuyerIp: IP, secretStore,
      connection: { id: "connection-1", credentialsSecretRef: "admin-ref",
        externalAccountRef: null, webhookSecretRef: null, config: null },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.resolveProvider.mockResolvedValue({
    provider: "shopify", environment: "test", storeId: "store-1",
    connection: { id: "connection-1" },
  });
  mock.resolveStorefront.mockResolvedValue({ execute: mock.graph });
  mock.graph.mockResolvedValue({ shop: { primaryDomain: {
    host: "store.example.org", sslEnabled: true,
  } } });
  mock.resolveCart.mockResolvedValue({ cartToken: opaqueToken, remoteCartId, currency: "USD" });
  mock.getCart.mockResolvedValue(cart);
});

describe("Shopify hosted checkout (detached; no registered execution)", () => {
  it("requires matching cart, order and payment owners before a Storefront request", async () => {
    const { client, context } = fixture();
    const result = await beginShopifyCommerceHostedCheckout(client, input, context);
    expect(result).toEqual({ kind: "hosted", provider: "shopify", url: cart.checkoutUrl });
    expect(result).not.toHaveProperty("orderId");
    expect(mock.resolveProvider.mock.calls.map((call) => {
      const requestClient = call[0];
      const options = call[1] as { capability?: string } | undefined;
      expect(requestClient).toBe(client);
      return options?.capability;
    })).toEqual(["cart", "orders", "checkout", "payments"]);
    expect(mock.resolveCart).toHaveBeenCalledWith(client, expect.objectContaining({
      cartToken: opaqueToken, environment: "test", provider: "shopify",
    }));
    expect(mock.getCart).toHaveBeenCalledWith({ remoteCartId, buyerIp: IP });
    expect(mock.graph).toHaveBeenCalledWith(expect.objectContaining({
      audience: { kind: "buyer", ip: IP },
    }));
    expect(JSON.stringify(result)).not.toContain(remoteCartId);
  });

  it("rejects missing verified ingress IP before any DB or network call", async () => {
    const { client, context } = fixture();
    await expect(beginShopifyCommerceHostedCheckout(client, input,
      { ...context, verifiedBuyerIp: undefined }))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    expect(mock.resolveProvider).not.toHaveBeenCalled();
    expect(mock.resolveStorefront).not.toHaveBeenCalled();
  });

  it.each(["stripe", "zoestore", "paypal"])("refuses a selected %s payment provider", async (provider: string) => {
    const { client, context } = fixture();
    mock.resolveProvider.mockImplementation(async (_client: unknown, { capability }: { capability: string }) => ({
      provider: capability === "payments" ? provider : "shopify",
      environment: "test", storeId: "store-1",
      connection: { id: "connection-1" },
    }));
    await expect(beginShopifyCommerceHostedCheckout(client, input, context))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    expect(mock.resolveStorefront).not.toHaveBeenCalled();
  });

  it("rejects payment owner bound to another connection/environment", async () => {
    const { client, context } = fixture();
    mock.resolveProvider.mockResolvedValue({
      provider: "shopify", environment: "live", storeId: "store-1",
      connection: { id: "other-connection" },
    });
    await expect(beginShopifyCommerceHostedCheckout(client, input, context)).rejects.toThrow();
    expect(mock.resolveStorefront).not.toHaveBeenCalled();
  });

  it("rejects a stale or empty Shopify cart", async () => {
    const { client, context } = fixture();
    mock.getCart.mockResolvedValueOnce({ ...cart, totalQuantity: 0, items: [] });
    await expect(beginShopifyCommerceHostedCheckout(client, input, context))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    expect(mock.graph).not.toHaveBeenCalled();
  });

  it("rejects cart IDs changed remotely or cart-currency mismatches", async () => {
    const { client, context } = fixture();
    mock.getCart.mockResolvedValueOnce({ ...cart, remoteCartId: "another-cart" });
    await expect(beginShopifyCommerceHostedCheckout(client, input, context)).rejects.toThrow();
    mock.getCart.mockResolvedValueOnce({ ...cart, currency: "EUR" });
    await expect(beginShopifyCommerceHostedCheckout(client, input, context)).rejects.toThrow();
  });

  it("allows only the canonical shop or freshly attested Shopify primary domain", async () => {
    const { client, context } = fixture();
    mock.getCart.mockResolvedValueOnce({
      ...cart, checkoutUrl: "https://store.example.org/checkouts/cn/123?key=key",
    });
    await expect(beginShopifyCommerceHostedCheckout(client, input, context))
      .resolves.toEqual({ kind: "hosted", provider: "shopify",
        url: "https://store.example.org/checkouts/cn/123?key=key" });
    mock.getCart.mockResolvedValueOnce({
      ...cart, checkoutUrl: "https://attacker.example/checkouts/cn/123?key=key",
    });
    await expect(beginShopifyCommerceHostedCheckout(client, input, context))
      .rejects.toMatchObject({ code: "SHOPIFY_HOSTED_CHECKOUT_UNAVAILABLE" });
  });

  it("refuses mismatched published/test surface before resolving routes", async () => {
    const { client, context } = fixture();
    await expect(beginShopifyCommerceHostedCheckout(client,
      { ...input, surface: "published" }, context))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    expect(mock.resolveProvider).not.toHaveBeenCalled();
  });
});
