import { describe, expect, it, vi } from "vitest";
import { createShopifyStorefrontGraphql } from "./shopifyStorefrontGraphql";
import { createShopifyStorefrontCart } from "./shopifyStorefrontCart";

const CART = "gid://shopify/Cart/AABB?key=PRIVATE123";
const VARIANT = "gid://shopify/ProductVariant/432";
const LINE = "gid://shopify/CartLine/987";
const invalid = { code: "SHOPIFY_STOREFRONT_DOMAIN_INVALID" };
function cart(lines: unknown[] = [line()]) {
  return { id: CART, checkoutUrl: "https://safe.myshopify.com/cart/c/abc", totalQuantity: lines.length,
    cost: { subtotalAmount: { amount: `${(19.95 * lines.length).toFixed(2)}`, currencyCode: "USD" } },
    lines: { nodes: lines, pageInfo: { hasNextPage: false } } };
}
function line(extra: Record<string, unknown> = {}) {
  return { id: LINE, quantity: 1, merchandise: { id: VARIANT, title: "Natural", sku: "BAG-1", product: { title: "Tote" } },
    cost: { amountPerQuantity: { amount: "19.95", currencyCode: "USD" },
      totalAmount: { amount: "19.95", currencyCode: "USD" } }, ...extra };
}
function json(data: unknown) { return new Response(JSON.stringify({ data }), { status: 200 }); }
function service(mocked: ReturnType<typeof vi.fn>) {
  return createShopifyStorefrontCart(createShopifyStorefrontGraphql({
    shopHostname: "safe.myshopify.com", environment: "test", privateToken: "top-secret-token",
    fetchImpl: mocked as unknown as typeof fetch,
  }));
}
function inspect(mocked: ReturnType<typeof vi.fn>, index = 0) {
  return JSON.parse(String(mocked.mock.calls[index]?.[1]?.body)) as {
    query: string; variables: Record<string, unknown>;
  };
}

describe("Shopify Storefront cart bridge (server-internal)", () => {
  it("creates buyer carts with server-injected IP and returns internal remote ID only", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ cartCreate: { cart: cart(), userErrors: [], warnings: [] } }));
    const result = await service(mocked).createCart({ merchandiseId: VARIANT, quantity: 1, buyerIp: "198.51.100.50" });
    expect(result.remoteCartId).toBe(CART);
    expect(result.subtotalMinor).toBe(1995);
    expect(result.currency).toBe("USD");
    expect(result.items[0]).toMatchObject({ merchandiseId: VARIANT, lineTotalMinor: 1995 });
    expect(inspect(mocked).variables.input).toEqual({ lines: [{ merchandiseId: VARIANT, quantity: 1 }] });
    expect(new Headers(mocked.mock.calls[0]?.[1]?.headers).get("Shopify-Storefront-Buyer-IP")).toBe("198.51.100.50");
    expect(String(mocked.mock.calls[0]?.[1]?.body)).not.toContain("top-secret-token");
  });
  it("gets and validates a remotely persisted cart by exact opaque remote reference", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ cart: cart() }));
    const result = await service(mocked).getCart({ remoteCartId: CART, buyerIp: "2001:db8::1" });
    expect(result.totalQuantity).toBe(1);
    expect(inspect(mocked).variables.cartId).toBe(CART);
  });
  it("adds a line with one non-retried Shopify mutation", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ cartLinesAdd: { cart: cart(), userErrors: [], warnings: [] } }));
    await service(mocked).addLine({ remoteCartId: CART, merchandiseId: VARIANT, quantity: 1, buyerIp: "198.51.100.50" });
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(inspect(mocked).variables).toMatchObject({ cartId: CART, lines: [{ merchandiseId: VARIANT, quantity: 1 }] });
  });
  it("updates and removes only the line matching the requested variant", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(json({ cart: cart() }))
      .mockResolvedValueOnce(json({ cartLinesUpdate: { cart: cart(), userErrors: [], warnings: [] } }))
      .mockResolvedValueOnce(json({ cart: cart() }))
      .mockResolvedValueOnce(json({ cartLinesRemove: { cart: cart([]), userErrors: [], warnings: [] } }));
    const svc = service(mocked);
    await svc.updateLine({ remoteCartId: CART, merchandiseId: VARIANT, quantity: 2, buyerIp: "198.51.100.50" });
    await svc.removeLine({ remoteCartId: CART, merchandiseId: VARIANT, buyerIp: "198.51.100.50" });
    expect(inspect(mocked, 1).variables.lines).toEqual([{ id: LINE, quantity: 2 }]);
    expect(inspect(mocked, 3).variables.lineIds).toEqual([LINE]);
  });
  it("rejects duplicate variant lines rather than updating an ambiguous line", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ cart: cart([line(), line({ id: "gid://shopify/CartLine/988" })]) }));
    await expect(service(mocked).updateLine({ remoteCartId: CART, merchandiseId: VARIANT, quantity: 2, buyerIp: "198.51.100.50" }))
      .rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_OPERATION_REJECTED" });
    expect(mocked).toHaveBeenCalledTimes(1);
  });
  it("rejects tampered IDs and quantities before Shopify calls", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ cart: cart() }));
    const svc = service(mocked);
    await expect(svc.getCart({ remoteCartId: "evil-url", buyerIp: "198.51.100.50" })).rejects.toMatchObject(invalid);
    await expect(svc.createCart({ merchandiseId: "gid://shopify/Other/8", quantity: 1, buyerIp: "198.51.100.50" })).rejects.toMatchObject(invalid);
    await expect(svc.addLine({ remoteCartId: CART, merchandiseId: VARIANT, quantity: -1, buyerIp: "198.51.100.50" })).rejects.toMatchObject(invalid);
    expect(mocked).not.toHaveBeenCalled();
  });
  it("fails closed on warning, userErrors and false cart identity", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(json({ cartCreate: { cart: cart(), userErrors: [{ code: "INVALID" }], warnings: [] } }))
      .mockResolvedValueOnce(json({ cartCreate: { cart: cart(), userErrors: [], warnings: [{ code: "MERCHANDISE_OUT_OF_STOCK" }] } }))
      .mockResolvedValueOnce(json({ cart: { ...cart(), id: "gid://shopify/Cart/OTHER?key=PRIVATE456" } }));
    const svc = service(mocked);
    const request = { merchandiseId: VARIANT, quantity: 1, buyerIp: "198.51.100.50" };
    await expect(svc.createCart(request)).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_OPERATION_REJECTED" });
    await expect(svc.createCart(request)).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_OPERATION_REJECTED" });
    await expect(svc.getCart({ remoteCartId: CART, buyerIp: "198.51.100.50" })).rejects.toMatchObject(invalid);
  });
  it("rejects cart line truncation rather than skipping a buyer item", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ cart: { ...cart(), lines: { nodes: [line()], pageInfo: { hasNextPage: true } } } }));
    await expect(service(mocked).getCart({ remoteCartId: CART, buyerIp: "198.51.100.50" }))
      .rejects.toMatchObject(invalid);
  });
});
