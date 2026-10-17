import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getCommerceProviderConnectionAdapter,
  supportsCommerceProviderConnectionEnvironment,
} from "./commerceProviderConnectionRegistry";
import {
  STRIPE_COMMERCE_PROVIDER_MANIFEST,
} from "./commerceProviderExecutableManifests";

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
          STRIPE_COMMERCE_PROVIDER_MANIFEST.key,
        );

        expect(
          adapter?.connectionKind,
        ).toBe(
          STRIPE_COMMERCE_PROVIDER_MANIFEST.connectionKinds[0],
        );

        expect(
          adapter?.environments,
        ).toEqual(
          STRIPE_COMMERCE_PROVIDER_MANIFEST.environments,
        );
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
