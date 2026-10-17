import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getCommerceProviderConnectionAdapter,
  supportsCommerceProviderConnectionEnvironment,
} from "./commerceProviderConnectionRegistry";

describe(
  "commerce provider connection registry",
  () => {
    it(
      "registers Stripe as the current credential connection adapter",
      () => {
        const adapter =
          getCommerceProviderConnectionAdapter(
            "stripe",
          );

        expect(
          adapter,
        ).not.toBeNull();

        expect(
          adapter?.provider,
        ).toBe(
          "stripe",
        );

        expect(
          adapter?.connectionKind,
        ).toBe(
          "credentials",
        );

        expect(
          adapter?.environments,
        ).toEqual([
          "test",
          "live",
        ]);
      },
    );

    it.each([
      "test",
      "live",
    ] as const)(
      "supports Stripe in the explicit %s environment",
      (environment) => {
        expect(
          supportsCommerceProviderConnectionEnvironment(
            "stripe",
            environment,
          ),
        ).toBe(
          true,
        );
      },
    );

    it.each([
      "shopify",
      "square",
      "paypal",
      "unknown-provider",
    ])(
      "does not invent an executable connection adapter for %s",
      (provider) => {
        expect(
          getCommerceProviderConnectionAdapter(
            provider,
          ),
        ).toBeNull();
      },
    );
  },
);
