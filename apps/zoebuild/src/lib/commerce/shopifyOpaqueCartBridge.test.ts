import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import type { BuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import type { ShopifyRemoteCartSnapshot } from "./shopifyStorefrontCart";
import { createShopifyOpaqueCartBridge } from "./shopifyOpaqueCartBridge";

const REMOTE = "gid://shopify/Cart/AABB?key=ultra-secret";
const VARIANT = "gid://shopify/ProductVariant/432";
const IP = "198.51.100.25";

function snapshot(overrides: Partial<ShopifyRemoteCartSnapshot> = {}): ShopifyRemoteCartSnapshot {
  return {
    remoteCartId: REMOTE,
    checkoutUrl: "https://example.myshopify.com/cart/c/private",
    currency: "USD",
    totalQuantity: 1,
    subtotalMinor: 1995,
    items: [{ merchandiseId: VARIANT, quantity: 1, title: "Shirt", variantTitle: "M",
      sku: "SH-1", unitPriceMinor: 1995, lineTotalMinor: 1995 }],
    internalLines: [{ id: "gid://shopify/CartLine/45", merchandiseId: VARIANT }],
    ...overrides,
  };
}

function fixture(environment: "test" | "live" = "test") {
  const commerceStore = { findUnique: vi.fn(async () => ({ id: "commerce-store-1" })) };
  const commerceCart = {
    create: vi.fn(async () => ({ id: "cart-db-1" })),
    findFirst: vi.fn(async () => ({ id: "cart-db-1", currency: "USD", providerCartSecretRef: "cart-ref-1" })),
  };
  const secretStore = {
    put: vi.fn(async () => ({ secretRef: "cart-ref-1" })),
    read: vi.fn(async () => ({ version: 1, provider: "shopify", environment, remoteCartId: REMOTE })),
    delete: vi.fn(async () => undefined),
  };
  const cartPort = {
    createCart: vi.fn(async () => snapshot()),
    getCart: vi.fn(async () => snapshot()),
    addLine: vi.fn(async () => snapshot()),
    updateLine: vi.fn(async () => snapshot()),
    removeLine: vi.fn(async () => snapshot({ totalQuantity: 0, subtotalMinor: 0, items: [], internalLines: [] })),
  };
  const client = { commerceStore, commerceCart } as unknown as PrismaClient;
  const bridge = createShopifyOpaqueCartBridge(client, {
    buildProjectId: "build-1", environment,
    secretStore: secretStore as unknown as BuildSecretStore, cartPort,
  });
  return { bridge, client, commerceCart, commerceStore, secretStore, cartPort };
}

function assertPublicSafe(value: unknown) {
  const data = JSON.stringify(value);
  expect(data).not.toContain(REMOTE);
  expect(data).not.toContain("ultra-secret");
  expect(data).not.toContain("checkoutUrl");
  expect(data).not.toContain("internalLines");
  expect(data).not.toContain("internalCartId");
  expect(data).not.toContain("remoteCartId");
}

describe("Shopify opaque external-cart bridge", () => {
  it("creates an encrypted reference and only returns an opaque cart token", async () => {
    const fixtureData = fixture();
    const result = await fixtureData.bridge.create({ merchandiseId: VARIANT, quantity: 1, buyerIp: IP });
    expect(result.cartToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.cartToken).not.toBe(REMOTE);
    expect(result.currency).toBe("USD");
    expect(result.subtotalMinor).toBe(1995);
    assertPublicSafe(result);
    expect(fixtureData.secretStore.put).toHaveBeenCalledWith({
      buildProjectId: "build-1",
      value: { version: 1, provider: "shopify", environment: "test", remoteCartId: REMOTE },
    });
    expect(fixtureData.commerceCart.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        storeId: "commerce-store-1", provider: "shopify", providerEnvironment: "test",
        providerCartSecretRef: "cart-ref-1", currency: "USD", status: "active",
      }),
    }));
  });

  it("resolves an opaque token through the vault and never exposes the remote ref", async () => {
    const f = fixture();
    const { cartToken } = await f.bridge.create({ merchandiseId: VARIANT, quantity: 1, buyerIp: IP });
    const result = await f.bridge.read({ cartToken, buyerIp: IP });
    expect(f.cartPort.getCart).toHaveBeenCalledWith({ remoteCartId: REMOTE, buyerIp: IP });
    expect(f.secretStore.read).toHaveBeenCalledWith({ buildProjectId: "build-1", secretRef: "cart-ref-1" });
    assertPublicSafe(result);
  });

  it("uses exact scoped vault handles for add/update/remove", async () => {
    const f = fixture("live");
    const { cartToken } = await f.bridge.create({ merchandiseId: VARIANT, quantity: 1, buyerIp: IP });
    assertPublicSafe(await f.bridge.add({ cartToken, merchandiseId: VARIANT, quantity: 2, buyerIp: IP }));
    assertPublicSafe(await f.bridge.update({ cartToken, merchandiseId: VARIANT, quantity: 3, buyerIp: IP }));
    assertPublicSafe(await f.bridge.remove({ cartToken, merchandiseId: VARIANT, buyerIp: IP }));
    expect(f.cartPort.addLine).toHaveBeenCalledWith({ remoteCartId: REMOTE, merchandiseId: VARIANT, quantity: 2, buyerIp: IP });
    expect(f.cartPort.updateLine).toHaveBeenCalledWith({ remoteCartId: REMOTE, merchandiseId: VARIANT, quantity: 3, buyerIp: IP });
    expect(f.cartPort.removeLine).toHaveBeenCalledWith({ remoteCartId: REMOTE, merchandiseId: VARIANT, buyerIp: IP });
    expect(f.commerceCart.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ provider: "shopify", providerEnvironment: "live", storeId: "commerce-store-1" }),
    }));
  });

  it("rejects missing or wrong-project cart tokens before reading secrets", async () => {
    const f = fixture();
    f.commerceCart.findFirst.mockResolvedValueOnce(null as never);
    await expect(f.bridge.read({ cartToken: "bad-token", buyerIp: IP })).rejects.toHaveProperty("code");
    expect(f.secretStore.read).not.toHaveBeenCalled();
  });

  it("fails closed if vault metadata belongs to a different environment", async () => {
    const f = fixture("test");
    f.secretStore.read.mockResolvedValueOnce({ version: 1, provider: "shopify", environment: "live", remoteCartId: REMOTE });
    const { cartToken } = await f.bridge.create({ merchandiseId: VARIANT, quantity: 1, buyerIp: IP });
    await expect(f.bridge.read({ cartToken, buyerIp: IP })).rejects.toHaveProperty("code", "EXTERNAL_COMMERCE_CART_SECRET_INVALID");
    expect(f.cartPort.getCart).not.toHaveBeenCalled();
  });

  it("rejects remote cart identity changes and currency drift", async () => {
    const f = fixture();
    const { cartToken } = await f.bridge.create({ merchandiseId: VARIANT, quantity: 1, buyerIp: IP });
    f.cartPort.getCart.mockResolvedValueOnce(snapshot({ remoteCartId: "gid://shopify/Cart/WRONG?key=another" }));
    await expect(f.bridge.read({ cartToken, buyerIp: IP })).rejects.toHaveProperty("code", "SHOPIFY_OPAQUE_CART_SCOPE_INVALID");
    f.cartPort.getCart.mockResolvedValueOnce(snapshot({ currency: "EUR" }));
    await expect(f.bridge.read({ cartToken, buyerIp: IP })).rejects.toHaveProperty("code", "SHOPIFY_OPAQUE_CART_SCOPE_INVALID");
  });

  it("rejects invalid buyer IP before invoking the storefront API", async () => {
    const f = fixture();
    await expect(f.bridge.create({ merchandiseId: VARIANT, quantity: 1, buyerIp: "user-controlled" }))
      .rejects.toHaveProperty("code", "SHOPIFY_OPAQUE_CART_SCOPE_INVALID");
    expect(f.cartPort.createCart).not.toHaveBeenCalled();
  });
});
