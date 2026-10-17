import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getShopifyCommerceAccessScopes,
  SHOPIFY_COMMERCE_ACCESS_SCOPES,
  type ShopifyAuthorizationCredential,
  type ShopifyAuthorizationPort,
  type ShopifyAuthorizationRefreshRequest,
} from "./index";

describe(
  "Shopify authorization refresh contract",
  () => {
    it(
      "defines the exact Storefront scopes required by the trusted commerce facade",
      () => {
        expect(
          getShopifyCommerceAccessScopes(),
        ).toEqual([
          "unauthenticated_read_product_listings",
          "unauthenticated_read_checkouts",
          "unauthenticated_write_checkouts",
        ]);

        expect(
          SHOPIFY_COMMERCE_ACCESS_SCOPES,
        ).toHaveLength(
          3,
        );
      },
    );

    it(
      "requires renewable offline authorization metadata when tokens expire",
      () => {
        const credential:
          ShopifyAuthorizationCredential = {
            accessToken:
              "admin_access",
            refreshToken:
              "refresh_access",
            scopes: [
              "read_products",
              ...SHOPIFY_COMMERCE_ACCESS_SCOPES,
            ],
            accessTokenExpiresAt:
              "2026-10-17T21:00:00.000Z",
            refreshTokenExpiresAt:
              "2027-01-15T20:00:00.000Z",
          };

        expect(
          credential.refreshToken,
        ).toBe(
          "refresh_access",
        );

        expect(
          credential.accessTokenExpiresAt,
        ).not.toBeNull();
      },
    );

    it(
      "keeps refresh as an explicit authorization-port operation",
      async () => {
        const calls:
          ShopifyAuthorizationRefreshRequest[] = [];

        const port:
          ShopifyAuthorizationPort = {
            async createAuthorizationRedirect() {
              return {
                url:
                  "https://example.myshopify.com/admin/oauth/authorize",
              };
            },

            async exchangeAuthorizationCode() {
              return {
                accessToken:
                  "initial",
                refreshToken:
                  "refresh_initial",
                scopes: [
                  ...SHOPIFY_COMMERCE_ACCESS_SCOPES,
                ],
                accessTokenExpiresAt:
                  "2026-10-17T21:00:00.000Z",
                refreshTokenExpiresAt:
                  "2027-01-15T20:00:00.000Z",
              };
            },

            async refreshAuthorizationCredential(
              request,
            ) {
              calls.push(
                request,
              );

              return {
                accessToken:
                  "rotated",
                refreshToken:
                  "refresh_rotated",
                scopes: [
                  ...SHOPIFY_COMMERCE_ACCESS_SCOPES,
                ],
                accessTokenExpiresAt:
                  "2026-10-17T22:00:00.000Z",
                refreshTokenExpiresAt:
                  "2027-01-15T21:00:00.000Z",
              };
            },
          };

        await expect(
          port.refreshAuthorizationCredential({
            store: {
              hostname:
                "demo.myshopify.com",
              origin:
                "https://demo.myshopify.com/",
            },
            refreshToken:
              "refresh_initial",
          }),
        ).resolves.toMatchObject({
          accessToken:
            "rotated",
          refreshToken:
            "refresh_rotated",
        });

        expect(
          calls,
        ).toHaveLength(
          1,
        );
      },
    );
  },
);
