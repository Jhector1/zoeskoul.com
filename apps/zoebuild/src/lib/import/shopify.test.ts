import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseShopifyStoreUrl,
} from "./shopify";

describe("parseShopifyStoreUrl", () => {
  it("accepts the bare myshopify hostname shown in the UI", () => {
    expect(
      parseShopifyStoreUrl(
        "demo.myshopify.com",
      ),
    ).toEqual({
      storeUrl:
        "https://demo.myshopify.com/",
      hostname:
        "demo.myshopify.com",
    });
  });

  it("normalizes an https Shopify URL", () => {
    expect(
      parseShopifyStoreUrl(
        "https://demo.myshopify.com",
      ),
    ).toEqual({
      storeUrl:
        "https://demo.myshopify.com/",
      hostname:
        "demo.myshopify.com",
    });
  });

  it("rejects a hostname without a domain", () => {
    expect(
      parseShopifyStoreUrl(
        "not-a-shop",
      ),
    ).toBeNull();
  });
});
