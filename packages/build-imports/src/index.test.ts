import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getShopifyImportScopes,
  parseShopifyStoreIdentity,
} from "./index";

describe(
  "Shopify Build import contracts",
  () => {
    it(
      "normalizes bare myshopify hostnames",
      () => {
        expect(
          parseShopifyStoreIdentity(
            "demo.myshopify.com",
          ),
        ).toEqual({
          hostname:
            "demo.myshopify.com",
          origin:
            "https://demo.myshopify.com/",
        });
      },
    );

    it(
      "keeps the default import read-only and excludes customer/order scopes",
      () => {
        const scopes =
          getShopifyImportScopes();

        expect(scopes).toEqual([
          "read_themes",
          "read_products",
          "read_files",
        ]);

        expect(
          scopes.some(
            (scope) =>
              scope.startsWith("write_"),
          ),
        ).toBe(false);

        expect(
          scopes.join(","),
        ).not.toMatch(
          /customer|order/i,
        );
      },
    );

    it(
      "rejects credentials, query strings, fragments, and bare labels",
      () => {
        for (const value of [
          "https://user:pass@example.com",
          "https://example.com?x=1",
          "https://example.com#x",
          "not-a-shop",
        ]) {
          expect(() =>
            parseShopifyStoreIdentity(
              value,
            ),
          ).toThrow();
        }
      },
    );
  },
);
