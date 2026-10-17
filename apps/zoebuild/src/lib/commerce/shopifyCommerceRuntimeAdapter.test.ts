import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import type { BuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import type { CommerceProviderExecutionContext } from "./commerceRuntimeRegistry";
import {
  executeShopifyCommerceCartCommand,
  getShopifyCommerceProduct,
  listShopifyCommerceProducts,
} from "./shopifyCommerceRuntimeAdapter";

const mock = vi.hoisted(() => ({
  resolve: vi.fn(),
  catalogList: vi.fn(),
  catalogGet: vi.fn(),
  bridgeCreate: vi.fn(),
  bridgeRead: vi.fn(),
  bridgeAdd: vi.fn(),
  bridgeUpdate: vi.fn(),
  bridgeRemove: vi.fn(),
}));
vi.mock("./shopifyStorefrontCredentialVault", () => ({
  resolveShopifyStorefrontGraphqlConnection: mock.resolve,
}));
vi.mock("./shopifyStorefrontCatalog", () => ({
  createShopifyStorefrontCatalog: vi.fn(() => ({
    listProducts: mock.catalogList, getProduct: mock.catalogGet,
  })),
}));
vi.mock("./shopifyStorefrontCart", () => ({
  createShopifyStorefrontCart: vi.fn(() => ({})),
}));
vi.mock("./shopifyOpaqueCartBridge", () => ({
  createShopifyOpaqueCartBridge: vi.fn(() => ({
    create: mock.bridgeCreate, read: mock.bridgeRead, add: mock.bridgeAdd,
    update: mock.bridgeUpdate, remove: mock.bridgeRemove,
  })),
}));

const PRODUCT = "gid://shopify/Product/23";
const VARIANT = "gid://shopify/ProductVariant/32";
const IP = "198.51.100.25";
const CART_TOKEN = "opaque-zoebuild-cart-token";
const cartSnapshot = {
  cartToken: CART_TOKEN, currency: "USD", totalQuantity: 1, subtotalMinor: 1250,
  items: [{ merchandiseId: VARIANT, quantity: 1, title: "Tote", variantTitle: "Standard",
    sku: "SKU", unitPriceMinor: 1250, lineTotalMinor: 1250 }],
};

function setup() {
  const commerceStore = { findUnique: vi.fn(async () => ({ id: "store-1", status: "active" })) };
  const commerceProviderConnection = { findUnique: vi.fn(async () => ({
    id: "connection-1", status: "active", credentialsSecretRef: "admin-ref", storefrontSecretRef: "sf-ref",
  })) };
  const secretStore = { read: vi.fn(async () => ({
    kind: "shopify-offline-oauth", version: 1, buildProjectId: "project-1", storeId: "store-1",
    environment: "test", shopHostname: "sandbox-shop.myshopify.com",
    refreshTokenExpiresAt: "2999-01-01T00:00:00.000Z",
  })) } as unknown as BuildSecretStore;
  const client = { commerceStore, commerceProviderConnection } as unknown as PrismaClient;
  const context: CommerceProviderExecutionContext = {
    buildProjectId: "project-1", provider: "shopify", environment: "test",
    secretStore,
    connection: { id: "connection-1", externalAccountRef: null, credentialsSecretRef: "admin-ref",
      webhookSecretRef: null, config: null },
  };
  // The already-composed Storefront secret isn't part of the older common
  // connection snapshot; this fixture deliberately tests the persisted ref.
  return { client, context, commerceStore, commerceProviderConnection, secretStore };
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.resolve.mockResolvedValue({ execute: vi.fn() });
  mock.catalogList.mockResolvedValue([{ id: PRODUCT }]);
  mock.catalogGet.mockResolvedValue({ id: PRODUCT });
  for (const method of [mock.bridgeCreate, mock.bridgeRead, mock.bridgeAdd, mock.bridgeUpdate, mock.bridgeRemove]) {
    method.mockResolvedValue(cartSnapshot);
  }
});

describe("unregistered Shopify commerce runtime adapter", () => {
  it("derives shop identity from the encrypted Admin record and uses the exact test environment", async () => {
    const fixture = setup();
    await expect(listShopifyCommerceProducts(fixture.client,
      { buildProjectId: "project-1", surface: "preview", first: "2" }, fixture.context))
      .resolves.toEqual([{ id: PRODUCT }]);
    expect(mock.resolve).toHaveBeenCalledWith(fixture.client, expect.objectContaining({
      shopHostname: "sandbox-shop.myshopify.com", environment: "test", storeId: "store-1",
      secretStore: fixture.secretStore,
    }));
    expect(mock.catalogList).toHaveBeenCalledWith("2");
  });

  it("rejects live surface and mismatched project before any credential read", async () => {
    const fixture = setup();
    await expect(getShopifyCommerceProduct(fixture.client,
      { buildProjectId: "project-1", surface: "published", id: PRODUCT }, fixture.context))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    await expect(listShopifyCommerceProducts(fixture.client,
      { buildProjectId: "another-project", surface: "preview" }, fixture.context))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    expect(fixture.commerceStore.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a store which is not available for the selected surface", async () => {
    const fixture = setup();
    fixture.commerceStore.findUnique.mockResolvedValueOnce({ id: "store-1", status: "disabled" });
    await expect(listShopifyCommerceProducts(fixture.client,
      { buildProjectId: "project-1", surface: "preview" }, fixture.context))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    expect(mock.resolve).not.toHaveBeenCalled();
  });

  it("rejects stale or disconnected provider connections", async () => {
    const fixture = setup();
    fixture.commerceProviderConnection.findUnique.mockResolvedValueOnce({
      id: "connection-1", status: "disconnected", credentialsSecretRef: "admin-ref", storefrontSecretRef: "sf-ref",
    });
    await expect(listShopifyCommerceProducts(fixture.client,
      { buildProjectId: "project-1", surface: "preview" }, fixture.context))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    expect(mock.resolve).not.toHaveBeenCalled();
  });

  it("rejects forged or mismatched Shopify shop identity from the secret store", async () => {
    const fixture = setup();
    vi.mocked(fixture.secretStore.read).mockResolvedValueOnce({
      kind: "shopify-offline-oauth", version: 1, buildProjectId: "another-project",
      storeId: "store-1", environment: "test", shopHostname: "sandbox-shop.myshopify.com",
      refreshTokenExpiresAt: "2999-01-01T00:00:00.000Z",
    });
    await expect(listShopifyCommerceProducts(fixture.client,
      { buildProjectId: "project-1", surface: "preview" }, fixture.context))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    expect(mock.resolve).not.toHaveBeenCalled();
  });

  it("maps the opaque cart token onto the neutral cart ID without remote identifiers", async () => {
    const fixture = setup();
    const result = await executeShopifyCommerceCartCommand(fixture.client, {
      buildProjectId: "project-1", surface: "preview",
      command: { operation: "add", merchandiseId: VARIANT, quantity: 1 },
    }, fixture.context, { buyerIp: IP });
    expect(result).toEqual({
      id: CART_TOKEN, currency: "USD", totalQuantity: 1, subtotalMinor: 1250,
      items: cartSnapshot.items,
    });
    expect(mock.bridgeCreate).toHaveBeenCalledWith({
      merchandiseId: VARIANT, quantity: 1, buyerIp: IP,
    });
    expect(JSON.stringify(result)).not.toContain("remoteCartId");
    expect(JSON.stringify(result)).not.toContain("checkoutUrl");
  });

  it("dispatches read/add/update/remove by opaque token with a trusted buyer IP", async () => {
    const fixture = setup();
    const call = (command: Parameters<typeof executeShopifyCommerceCartCommand>[1]["command"]) =>
      executeShopifyCommerceCartCommand(fixture.client, {
        buildProjectId: "project-1", surface: "preview", command,
      }, fixture.context, { buyerIp: IP });
    await call({ operation: "get", cartId: CART_TOKEN });
    await call({ operation: "add", cartId: CART_TOKEN, merchandiseId: VARIANT, quantity: 2 });
    await call({ operation: "update", cartId: CART_TOKEN, merchandiseId: VARIANT, quantity: 3 });
    await call({ operation: "remove", cartId: CART_TOKEN, merchandiseId: VARIANT });
    expect(mock.bridgeRead).toHaveBeenCalledWith({ cartToken: CART_TOKEN, buyerIp: IP });
    expect(mock.bridgeAdd).toHaveBeenCalledWith({ cartToken: CART_TOKEN, merchandiseId: VARIANT, quantity: 2, buyerIp: IP });
    expect(mock.bridgeUpdate).toHaveBeenCalledWith({ cartToken: CART_TOKEN, merchandiseId: VARIANT, quantity: 3, buyerIp: IP });
    expect(mock.bridgeRemove).toHaveBeenCalledWith({ cartToken: CART_TOKEN, merchandiseId: VARIANT, buyerIp: IP });
  });

  it("rejects untrusted or absent buyer IP without accessing the database", async () => {
    const fixture = setup();
    await expect(executeShopifyCommerceCartCommand(fixture.client,
      { buildProjectId: "project-1", surface: "preview", command: { operation: "get", cartId: CART_TOKEN } },
      fixture.context, { buyerIp: "not-an-ip" }))
      .rejects.toMatchObject({ code: "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" });
    expect(fixture.commerceStore.findUnique).not.toHaveBeenCalled();
  });
});
