import {
  describe,
  expect,
  it,
} from "vitest";

import {
  COMMERCE_PROVIDER_DEFINITIONS,
  DEFAULT_COMMERCE_PAYMENT_PROVIDER,
  DEFAULT_COMMERCE_STORE_PROVIDER,
  getCommerceProviderDefinition,
} from "./commerceProviderCatalog";

describe(
  "ZoeBuild commerce provider directory",
  () => {
    it(
      "uses Zoé Store by default without silently choosing payments",
      () => {
        expect(
          DEFAULT_COMMERCE_STORE_PROVIDER,
        ).toBe(
          "zoebuild-native",
        );

        expect(
          DEFAULT_COMMERCE_PAYMENT_PROVIDER,
        ).toBeNull();

        const native =
          getCommerceProviderDefinition(
            DEFAULT_COMMERCE_STORE_PROVIDER,
          );

        expect(
          native?.displayName,
        ).toBe(
          "Zoé Store",
        );

        expect(
          native?.connectionRequired,
        ).toBe(
          false,
        );

        expect(
          native?.capabilities,
        ).toEqual({
          catalog:
            true,
          inventory:
            true,
          cart:
            true,
          orders:
            true,
          checkout:
            true,
          payments:
            false,
        });
      },
    );

    it(
      "publishes the supported provider capability matrix",
      () => {
        const byId =
          new Map(
            COMMERCE_PROVIDER_DEFINITIONS.map(
              (
                provider,
              ) => [
                provider.id,
                provider,
              ],
            ),
          );

        expect(
          byId.get(
            "shopify",
          )?.capabilities,
        ).toEqual({
          catalog:
            true,
          inventory:
            true,
          cart:
            true,
          orders:
            true,
          checkout:
            true,
          payments:
            true,
        });

        expect(
          byId.get(
            "square",
          )?.capabilities,
        ).toEqual({
          catalog:
            true,
          inventory:
            true,
          cart:
            false,
          orders:
            true,
          checkout:
            true,
          payments:
            true,
        });

        for (
          const provider of [
            "stripe",
            "paypal",
          ] as const
        ) {
          expect(
            byId.get(
              provider,
            )?.capabilities,
          ).toEqual({
            catalog:
              false,
            inventory:
              false,
            cart:
              false,
            orders:
              false,
            checkout:
              true,
            payments:
              true,
          });
        }
      },
    );

    it(
      "requires connections for every external provider",
      () => {
        for (
          const provider of
          COMMERCE_PROVIDER_DEFINITIONS
        ) {
          expect(
            provider.connectionRequired,
          ).toBe(
            provider.id !==
              "zoebuild-native",
          );

          expect(
            provider.environments,
          ).toEqual([
            "test",
            "live",
          ]);
        }
      },
    );

    it(
      "recommends Stripe for payments without auto-selecting it",
      () => {
        expect(
          getCommerceProviderDefinition(
            "stripe",
          )?.recommendedPayment,
        ).toBe(
          true,
        );

        expect(
          DEFAULT_COMMERCE_PAYMENT_PROVIDER,
        ).toBeNull();
      },
    );
  },
);
