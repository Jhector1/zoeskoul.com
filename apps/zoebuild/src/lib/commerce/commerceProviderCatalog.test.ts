import {
  describe,
  expect,
  it,
} from "vitest";

import {
  COMMERCE_PROVIDER_DEFINITIONS,
  DEFAULT_COMMERCE_PAYMENT_PROVIDER,
  DEFAULT_COMMERCE_STORE_PROVIDER,
} from "./commerceProviderCatalog";

describe(
  "ZoeBuild commerce provider directory",
  () => {
    it(
      "uses ZoeStore as the recommended store owner",
      () => {
        expect(
          DEFAULT_COMMERCE_STORE_PROVIDER,
        ).toBe(
          "zoestore",
        );

        const zoestore =
          COMMERCE_PROVIDER_DEFINITIONS.find(
            (provider) =>
              provider.id ===
              "zoestore",
          );

        expect(
          zoestore,
        ).toMatchObject({
          recommendedStore:
            true,
          recommendedPayment:
            false,
          connectionRequired:
            false,
        });

        expect(
          zoestore?.capabilities,
        ).toMatchObject({
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
      "recommends Stripe for payments as product policy rather than runtime fallback",
      () => {
        expect(
          DEFAULT_COMMERCE_PAYMENT_PROVIDER,
        ).toBe(
          "stripe",
        );

        const stripe =
          COMMERCE_PROVIDER_DEFINITIONS.find(
            (provider) =>
              provider.id ===
              "stripe",
          );

        expect(
          stripe,
        ).toMatchObject({
          recommendedStore:
            false,
          recommendedPayment:
            true,
          connectionRequired:
            true,
        });

        expect(
          stripe?.capabilities.checkout,
        ).toBe(
          false,
        );
        expect(
          stripe?.capabilities.payments,
        ).toBe(
          true,
        );
      },
    );

    it(
      "requires external provider connections while ZoeStore uses provisioned internal connections",
      () => {
        for (
          const provider of
          COMMERCE_PROVIDER_DEFINITIONS
        ) {
          expect(
            provider.connectionRequired,
          ).toBe(
            provider.id !==
              "zoestore",
          );
        }
      },
    );

    it(
      "keeps payment-only providers separate from full-commerce checkout ownership",
      () => {
        for (
          const id of [
            "stripe",
            "paypal",
          ] as const
        ) {
          const provider =
            COMMERCE_PROVIDER_DEFINITIONS.find(
              (candidate) =>
                candidate.id ===
                id,
            );

          expect(
            provider?.capabilities.payments,
          ).toBe(
            true,
          );
          expect(
            provider?.capabilities.checkout,
          ).toBe(
            false,
          );
        }
      },
    );
  },
);
