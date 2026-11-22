import { describe, expect, it } from "vitest";
import { extractShopifyCandidateHostname } from "./extractShopifyCandidateHostname";

describe("display-only Shopify hostname candidate", () => {
  it("recognizes only a bounded valid Shopify subdomain", () => {
    expect(extractShopifyCandidateHostname("Connect https://My-Store.myshopify.com/admin"))
      .toBe("my-store.myshopify.com");
    expect(extractShopifyCandidateHostname("Open a.myshopify.com in settings"))
      .toBe("a.myshopify.com");
  });

  it("rejects untrusted prefixes, suffixes, userinfo, and other domains", () => {
    for (const value of [
      "shopify.com", "myshopify.com", "a.myshopify.com.evil.example",
      "evil.a.myshopify.com", "https://a.myshopify.com@evil.example",
      "a..myshopify.com", "shopify-store.example", "a.myshopify.com-other.example",
    ]) {
      expect(extractShopifyCandidateHostname(value)).toBeNull();
    }
  });

  it("rejects ambiguity and never assumes a connected account", () => {
    expect(extractShopifyCandidateHostname("a.myshopify.com and b.myshopify.com"))
      .toBeNull();
    expect(extractShopifyCandidateHostname("Shopify is already connected"))
      .toBeNull();
    expect(extractShopifyCandidateHostname("a.myshopify.com then A.myshopify.com"))
      .toBe("a.myshopify.com");
  });
});
