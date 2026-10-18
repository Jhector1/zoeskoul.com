import { describe, expect, it } from "vitest";
import { shopifyHostedCheckoutResult } from "./shopifyHostedCheckout";

const base = {
  shopHostname: "demo-shop.myshopify.com",
  primaryDomain: { host: "store.example.org", sslEnabled: true },
} as const;

describe("detached Shopify hosted checkout navigation boundary", () => {
  it("returns a distinct hosted redirect without inventing an order", () => {
    const result = shopifyHostedCheckoutResult({
      ...base, url: "https://demo-shop.myshopify.com/checkouts/cn/123?key=opaque-checkout-key",
    });
    expect(result).toEqual({
      kind: "hosted", provider: "shopify",
      url: "https://demo-shop.myshopify.com/checkouts/cn/123?key=opaque-checkout-key",
    });
    expect(result).not.toHaveProperty("orderId");
  });

  it("allows a fresh Storefront-attested HTTPS primary domain", () => {
    expect(shopifyHostedCheckoutResult({
      ...base, url: "https://store.example.org/checkouts/123?key=abc",
    }).kind).toBe("hosted");
  });

  it.each([
    "https://evil.example/checkouts/123?key=abc",
    "http://store.example.org/checkouts/123",
    "https://store.example.org.evil.test/checkouts/123",
    "https://user:password@store.example.org/checkouts/123",
    "https://store.example.org:8443/checkouts/123",
    "https://store.example.org/checkouts/123#fragment",
    "javascript:alert(1)",
    "https://store.example.org/",
    "https://other-shop.myshopify.com/checkouts/123",
  ])("rejects untrusted checkout navigation: %s", (url: string) => {
    expect(() => shopifyHostedCheckoutResult({ ...base, url }))
      .toThrowError(expect.objectContaining({ code: "SHOPIFY_HOSTED_CHECKOUT_UNAVAILABLE" }));
  });

  it("rejects primary domains without Shopify SSL attestation", () => {
    expect(() => shopifyHostedCheckoutResult({
      ...base, primaryDomain: { host: "store.example.org", sslEnabled: false },
      url: "https://store.example.org/checkouts/123",
    })).toThrow();
  });

  it("rejects malicious or non-canonical authority data", () => {
    for (const host of ["localhost", "attacker.test:443", "attacker.test/path", "bücher.test", "127.0.0.1", "test.shop."]) {
      expect(() => shopifyHostedCheckoutResult({
        ...base, primaryDomain: { host, sslEnabled: true },
        url: "https://demo-shop.myshopify.com/checkouts/123",
      })).toThrow();
    }
  });
});
