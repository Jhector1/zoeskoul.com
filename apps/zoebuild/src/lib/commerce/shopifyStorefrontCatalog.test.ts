import { describe, expect, it, vi } from "vitest";
import { createShopifyStorefrontGraphql } from "./shopifyStorefrontGraphql";
import { createShopifyStorefrontCatalog } from "./shopifyStorefrontCatalog";
import { moneyMinor, ShopifyStorefrontDomainError } from "./shopifyStorefrontDomain";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/Product/321", handle: "canvas-tote", title: "Canvas Tote",
    description: "A tote", featuredImage: { url: "https://cdn.shopify.com/tote.png", altText: "Tote" },
    variants: { pageInfo: { hasNextPage: false }, nodes: [
      { id: "gid://shopify/ProductVariant/432", title: "Natural", sku: "BAG-1", availableForSale: true,
        price: { amount: "19.95", currencyCode: "USD" }, compareAtPrice: null },
    ] }, ...overrides,
  };
}
function transport(mocked: ReturnType<typeof vi.fn>) {
  return createShopifyStorefrontGraphql({
    shopHostname: "safe.myshopify.com", environment: "test", privateToken: "server-only-secret",
    fetchImpl: mocked as unknown as typeof fetch,
  });
}
function json(data: unknown) { return new Response(JSON.stringify({ data }), { status: 200 }); }
const failure = { code: "SHOPIFY_STOREFRONT_DOMAIN_INVALID" };

describe("Shopify Storefront catalog bridge", () => {
  it("maps published products and variant prices to the canonical commerce contract", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ products: { nodes: [product()] } }));
    const catalog = createShopifyStorefrontCatalog(transport(mocked));
    const rows = await catalog.listProducts("1");
    expect(rows).toEqual([{ id: "gid://shopify/Product/321", slug: "canvas-tote", title: "Canvas Tote",
      description: "A tote", imageUrl: "https://cdn.shopify.com/tote.png", imageAltText: "Tote",
      currency: "USD", defaultMerchandiseId: "gid://shopify/ProductVariant/432",
      variants: [{ id: "gid://shopify/ProductVariant/432", title: "Natural", sku: "BAG-1",
        priceMinor: 1995, compareAtPriceMinor: null, availableForSale: true }] }]);
    const [, init] = mocked.mock.calls[0] ?? [];
    const sent = JSON.parse(String(init?.body));
    expect(sent.variables.first).toBe(1);
    expect(sent.query).toContain("products(first: $first)");
    expect(String(init?.body)).not.toContain("server-only-secret");
  });
  it("gets products by ID or slug without deprecated productByHandle", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ product: product() }));
    const catalog = createShopifyStorefrontCatalog(transport(mocked));
    expect((await catalog.getProduct({ id: "gid://shopify/Product/321" }))?.slug).toBe("canvas-tote");
    expect((await catalog.getProduct({ slug: "canvas-tote" }))?.title).toBe("Canvas Tote");
    const first = JSON.parse(String(mocked.mock.calls[0]?.[1]?.body));
    const second = JSON.parse(String(mocked.mock.calls[1]?.[1]?.body));
    expect(first.query).toContain("product(id: $id)");
    expect(second.query).toContain("product(handle: $handle)");
    expect(second.query).not.toContain("productByHandle");
  });
  it("handles missing products as null", async () => {
    const catalog = createShopifyStorefrontCatalog(transport(vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ product: null }))));
    await expect(catalog.getProduct({ slug: "gone" })).resolves.toBeNull();
  });
  it("rejects ambiguous lookups and unbounded page sizes before networking", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ products: { nodes: [] } }));
    const catalog = createShopifyStorefrontCatalog(transport(mocked));
    await expect(catalog.getProduct({})).rejects.toMatchObject(failure);
    await expect(catalog.getProduct({ id: "gid://shopify/Product/321", slug: "canvas-tote" })).rejects.toMatchObject(failure);
    await expect(catalog.listProducts("26")).rejects.toMatchObject(failure);
    await expect(catalog.listProducts("1e1")).rejects.toMatchObject(failure);
    expect(mocked).not.toHaveBeenCalled();
  });
  it("rejects a truncated variant list instead of selling a partial product", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ products: { nodes: [product({
      variants: { pageInfo: { hasNextPage: true }, nodes: [] },
    })] } }));
    await expect(createShopifyStorefrontCatalog(transport(mocked)).listProducts()).rejects.toMatchObject(failure);
  });
  it("rejects inconsistent variant currencies and malformed price values", async () => {
    const invalid = [
      { price: { amount: "2.123", currencyCode: "USD" } },
      { price: { amount: "2.00", currencyCode: "JPY" } },
    ];
    for (const overrides of invalid) {
      const v = Object.assign({ id: "gid://shopify/ProductVariant/800", title: "Other", sku: "B", availableForSale: true,
        price: { amount: "4.00", currencyCode: "USD" }, compareAtPrice: null }, overrides);
      const base = product();
      const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ product: product({ variants: {
        pageInfo: { hasNextPage: false }, nodes: [...base.variants.nodes, v],
      } }) }));
      await expect(createShopifyStorefrontCatalog(transport(mocked))
        .getProduct({ id: "gid://shopify/Product/321" })).rejects.toBeInstanceOf(ShopifyStorefrontDomainError);
    }
  });
  it("handles zero and three-decimal currencies with exact integer conversion", () => {
    expect(moneyMinor({ amount: "200", currencyCode: "JPY" })).toEqual({ minor: 200, currency: "JPY" });
    expect(moneyMinor({ amount: "2.345", currencyCode: "KWD" })).toEqual({ minor: 2345, currency: "KWD" });
    expect(() => moneyMinor({ amount: "9007199254740992", currencyCode: "USD" })).toThrow();
  });
});
