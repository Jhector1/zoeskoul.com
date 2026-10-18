import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import type { VerifiedCommerceBuyerIp } from "./trustedCommerceBuyerIp";
import { trustedCommerceBuyerIpFromRequest } from "./trustedCommerceBuyerIp";
import { SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN } from "./shopifyRuntimeAcceptanceRegistration";

/**
 * Scoped, DB/network-free mock acceptance through the REAL commerce facade,
 * ProviderRegistry, Shopify runtime adapter, and trusted ingress verifier.
 * This does not certify a deployed ingress proxy, migrations, credentials or
 * Shopify's live services; no database or provider calls are performed.
 */
const mock = vi.hoisted(() => ({
  resolveProvider: vi.fn(),
  secretStoreFactory: vi.fn(),
  secretRead: vi.fn(),
  resolveStorefront: vi.fn(),
  graphql: vi.fn(),
  listProducts: vi.fn(),
  getProduct: vi.fn(),
  cartCreate: vi.fn(),
  cartRead: vi.fn(),
  cartAdd: vi.fn(),
  cartUpdate: vi.fn(),
  cartRemove: vi.fn(),
  getRemoteCart: vi.fn(),
  resolveCartHandle: vi.fn(),
}));

vi.mock("@zoeskoul/platform-server/security/buildSecretStore", () => ({
  createBuildSecretStore: mock.secretStoreFactory,
}));
vi.mock("./commerceProviderResolver", () => ({
  CommerceProviderResolutionError: class CommerceProviderResolutionError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  resolveCommerceProvider: mock.resolveProvider,
}));
vi.mock("./shopifyStorefrontCredentialVault", () => ({
  resolveShopifyStorefrontGraphqlConnection: mock.resolveStorefront,
}));
vi.mock("./shopifyStorefrontCatalog", () => ({
  createShopifyStorefrontCatalog: () => ({
    listProducts: mock.listProducts,
    getProduct: mock.getProduct,
  }),
}));
vi.mock("./shopifyStorefrontCart", () => ({
  createShopifyStorefrontCart: () => ({ getCart: mock.getRemoteCart }),
}));
vi.mock("./shopifyOpaqueCartBridge", () => ({
  createShopifyOpaqueCartBridge: () => ({
    create: mock.cartCreate,
    read: mock.cartRead,
    add: mock.cartAdd,
    update: mock.cartUpdate,
    remove: mock.cartRemove,
  }),
}));
vi.mock("./externalCommerceCartHandle", () => ({
  resolveExternalCommerceCartHandle: mock.resolveCartHandle,
}));

const PROJECT = "acceptance-project";
const STORE = "store-test-1";
const CONNECTION = "shopify-test-connection";
const OPAQUE_CART = "A".repeat(43);
const REMOTE_CART = "gid://shopify/Cart/fake?key=server-only";
const MERCHANDISE = "gid://shopify/ProductVariant/42";
const CHECKOUT_URL = "https://shop-example.myshopify.com/checkouts/cn/42?key=navigation-secret";
const IP = "198.51.100.81";
const KEY = "mock-acceptance-test-ingress-signing-key-32+";
const SIGNED_URL = "https://zoebuild.example.test/api/build/acceptance-project/commerce/checkout";
const connection = {
  id: CONNECTION,
  credentialsSecretRef: "admin-vault-ref",
  externalAccountRef: "shop-example.myshopify.com",
  webhookSecretRef: null,
  config: null,
};
const cartSnapshot = {
  cartToken: OPAQUE_CART, currency: "USD", totalQuantity: 1,
  subtotalMinor: 1250,
  items: [{ merchandiseId: MERCHANDISE, quantity: 1, title: "Example", variantTitle: "Default",
    sku: null, unitPriceMinor: 1250, lineTotalMinor: 1250 }],
};
const remoteCart = {
  remoteCartId: REMOTE_CART, currency: "USD", totalQuantity: 1,
  checkoutUrl: CHECKOUT_URL,
  items: [{ merchandiseId: MERCHANDISE, quantity: 1 }],
};

function signedRequest(overrides: Readonly<{
  ip?: string; method?: string; url?: string; timestamp?: number; spoofedForwardedFor?: string;
}> = {}) {
  const ip = overrides.ip ?? IP;
  const method = overrides.method ?? "POST";
  const url = overrides.url ?? SIGNED_URL;
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
  const ts = String(timestamp);
  const pathname = new URL(url).pathname;
  const signature = createHmac("sha256", KEY)
    .update(`v1\n${method}\n${pathname}\n${ts}\n${ip}`, "utf8")
    .digest("hex");
  return new Request(url, {
    method,
    headers: {
      "x-zoebuild-buyer-ip": ip,
      "x-zoebuild-buyer-ip-timestamp": ts,
      "x-zoebuild-buyer-ip-signature": signature,
      "x-forwarded-for": overrides.spoofedForwardedFor ?? "203.0.113.99",
    },
  });
}

function trustedIp(): VerifiedCommerceBuyerIp {
  const proof = trustedCommerceBuyerIpFromRequest(signedRequest(), { signingKey: KEY });
  expect(proof).toBe(IP);
  return proof!;
}

function fixture() {
  const findStore = vi.fn(async () => ({ id: STORE, status: "active" }));
  const findConnection = vi.fn(async () => ({
    id: CONNECTION, status: "active", credentialsSecretRef: "admin-vault-ref",
    storefrontSecretRef: "storefront-vault-ref",
  }));
  const client = {
    commerceStore: { findUnique: findStore },
    commerceProviderConnection: { findUnique: findConnection },
  } as unknown as PrismaClient;
  return { client, findStore, findConnection };
}

function setTestGate(enabled: boolean) {
  vi.stubEnv("ZOEBUILD_SHOPIFY_ACCEPTANCE_RUNTIME_GATE",
    enabled ? SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN : "");
  vi.stubEnv("ZOEBUILD_BUYER_IP_SIGNING_KEY", KEY);
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  setTestGate(false);
  mock.secretStoreFactory.mockReturnValue({ read: mock.secretRead });
  mock.secretRead.mockResolvedValue({
    version: 1, kind: "shopify-offline-oauth", buildProjectId: PROJECT,
    storeId: STORE, environment: "test", shopHostname: "shop-example.myshopify.com",
    refreshTokenExpiresAt: "2999-01-01T00:00:00.000Z",
  });
  mock.resolveProvider.mockImplementation(async (_client: unknown, input: { capability: string; surface: string }) => ({
    storeId: STORE, provider: "shopify",
    environment: input.surface === "published" ? "live" : "test",
    capability: input.capability, connection,
  }));
  mock.resolveStorefront.mockResolvedValue({ execute: mock.graphql });
  mock.graphql.mockResolvedValue({ shop: { primaryDomain: {
    host: "shop-example.myshopify.com", sslEnabled: true,
  } } });
  mock.listProducts.mockResolvedValue([{
    id: "gid://shopify/Product/42", slug: "example", title: "Example", description: null,
    imageUrl: null, imageAltText: null, currency: "USD", defaultMerchandiseId: MERCHANDISE,
    variants: [{ id: MERCHANDISE, title: "Default", sku: null, priceMinor: 1250,
      compareAtPriceMinor: null, availableForSale: true }],
  }]);
  mock.cartCreate.mockResolvedValue(cartSnapshot);
  mock.cartRead.mockResolvedValue(cartSnapshot);
  mock.getRemoteCart.mockResolvedValue(remoteCart);
  mock.resolveCartHandle.mockResolvedValue({
    cartToken: OPAQUE_CART, remoteCartId: REMOTE_CART, currency: "USD",
  });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Phase 4F2B5E3C1: gated mock end-to-end Shopify commerce", () => {
  it("does not register Shopify without the explicit test gate", async () => {
    const { COMMERCE_RUNTIME_REGISTRY } = await import("./commerceRuntimeRegistry");
    expect(COMMERCE_RUNTIME_REGISTRY.supportsInEnvironment("shopify", "commerce.cart", "test")).toBe(false);
    expect(COMMERCE_RUNTIME_REGISTRY.supportsInEnvironment("shopify", "commerce.checkout", "test")).toBe(false);
    const { executeCommerceCartCommand } = await import("./commerceRuntime");
    await expect(executeCommerceCartCommand(fixture().client, {
      buildProjectId: PROJECT, surface: "preview", command: { operation: "get", cartId: OPAQUE_CART },
    }, trustedIp())).rejects.toThrow();
    expect(mock.secretStoreFactory).not.toHaveBeenCalled();
    expect(mock.resolveStorefront).not.toHaveBeenCalled();
  });

  it("executes catalog → cart → hosted checkout through the real gated facade with signed IP", async () => {
    setTestGate(true);
    const { COMMERCE_RUNTIME_REGISTRY } = await import("./commerceRuntimeRegistry");
    expect(COMMERCE_RUNTIME_REGISTRY.supportsInEnvironment("shopify", "commerce.cart", "test")).toBe(true);
    expect(COMMERCE_RUNTIME_REGISTRY.supportsInEnvironment("shopify", "commerce.checkout", "test")).toBe(true);
    expect(COMMERCE_RUNTIME_REGISTRY.supportsInEnvironment("shopify", "commerce.checkout", "live")).toBe(false);
    const { listCommerceProducts, executeCommerceCartCommand, beginCommerceCheckout } =
      await import("./commerceRuntime");
    const { client } = fixture();
    const products = await listCommerceProducts(client, { buildProjectId: PROJECT, surface: "preview" });
    expect(products).toHaveLength(1);
    const ip = trustedIp();
    const cart = await executeCommerceCartCommand(client, {
      buildProjectId: PROJECT, surface: "preview",
      command: { operation: "add", merchandiseId: MERCHANDISE, quantity: 1 },
    }, ip);
    expect(cart).toEqual({ id: OPAQUE_CART, currency: "USD", totalQuantity: 1,
      subtotalMinor: 1250, items: cartSnapshot.items });
    expect(mock.cartCreate).toHaveBeenCalledWith({ merchandiseId: MERCHANDISE, quantity: 1, buyerIp: IP });
    const checkout = await beginCommerceCheckout(client, {
      buildProjectId: PROJECT, surface: "preview", request: { cartId: cart.id },
    }, ip);
    expect(checkout).toEqual({ kind: "hosted", provider: "shopify", url: CHECKOUT_URL });
    expect(checkout).not.toHaveProperty("orderId");
    expect(JSON.stringify(checkout)).not.toContain(REMOTE_CART);
    expect(mock.getRemoteCart).toHaveBeenCalledWith({ remoteCartId: REMOTE_CART, buyerIp: IP });
    expect(mock.graphql).toHaveBeenCalledWith(expect.objectContaining({
      audience: { kind: "buyer", ip: IP },
    }));
    expect(mock.resolveProvider.mock.calls.map((call: unknown[]) =>
      (call[1] as { capability: string }).capability)).toEqual([
        "catalog", "cart", "checkout", "cart", "orders", "checkout", "payments",
      ]);
  });

  it("rejects unsigned/spoofed IPs and never reaches Storefront cart", async () => {
    setTestGate(true);
    const { executeCommerceCartCommand, beginCommerceCheckout } = await import("./commerceRuntime");
    const { client } = fixture();
    const unsigned = new Request(SIGNED_URL, { method: "POST", headers: {
      "x-forwarded-for": IP, "x-real-ip": IP,
    } });
    expect(trustedCommerceBuyerIpFromRequest(unsigned, { signingKey: KEY })).toBeNull();
    const altered = signedRequest({ spoofedForwardedFor: "1.2.3.4" });
    altered.headers.set("x-zoebuild-buyer-ip", "203.0.113.40");
    expect(trustedCommerceBuyerIpFromRequest(altered, { signingKey: KEY })).toBeNull();
    await expect(executeCommerceCartCommand(client, {
      buildProjectId: PROJECT, surface: "preview",
      command: { operation: "add", merchandiseId: MERCHANDISE, quantity: 1 },
    }, null)).rejects.toThrow();
    await expect(beginCommerceCheckout(client, {
      buildProjectId: PROJECT, surface: "preview", request: { cartId: OPAQUE_CART },
    }, null)).rejects.toThrow();
    expect(mock.resolveStorefront).not.toHaveBeenCalled();
    expect(mock.cartCreate).not.toHaveBeenCalled();
  });

  it("rejects published live execution even with the acceptance token", async () => {
    setTestGate(true);
    const { beginCommerceCheckout } = await import("./commerceRuntime");
    await expect(beginCommerceCheckout(fixture().client, {
      buildProjectId: PROJECT, surface: "published", request: { cartId: OPAQUE_CART },
    }, trustedIp())).rejects.toThrow();
    expect(mock.secretStoreFactory).not.toHaveBeenCalled();
    expect(mock.resolveStorefront).not.toHaveBeenCalled();
  });

  it("rejects a mismatched selected payment owner before the Shopify remote call", async () => {
    setTestGate(true);
    const { beginCommerceCheckout } = await import("./commerceRuntime");
    mock.resolveProvider.mockImplementation(async (_client: unknown, input: { capability: string }) => ({
      storeId: STORE, provider: input.capability === "payments" ? "stripe" : "shopify",
      environment: "test", connection,
    }));
    await expect(beginCommerceCheckout(fixture().client, {
      buildProjectId: PROJECT, surface: "preview", request: { cartId: OPAQUE_CART },
    }, trustedIp())).rejects.toThrow();
    expect(mock.resolveStorefront).not.toHaveBeenCalled();
    expect(mock.graphql).not.toHaveBeenCalled();
  });

  it("rejects a remote checkout redirect to an untrusted domain", async () => {
    setTestGate(true);
    const { beginCommerceCheckout } = await import("./commerceRuntime");
    mock.getRemoteCart.mockResolvedValueOnce({ ...remoteCart,
      checkoutUrl: "https://attacker.example/checkouts/42?key=do-not-leak",
    });
    await expect(beginCommerceCheckout(fixture().client, {
      buildProjectId: PROJECT, surface: "preview", request: { cartId: OPAQUE_CART },
    }, trustedIp())).rejects.toMatchObject({ code: "SHOPIFY_HOSTED_CHECKOUT_UNAVAILABLE" });
  });
});
