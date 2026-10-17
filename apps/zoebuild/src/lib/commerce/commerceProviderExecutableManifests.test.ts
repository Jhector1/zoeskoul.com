import {
  describe,
  expect,
  it,
} from "vitest";

import {
  EXECUTABLE_COMMERCE_PROVIDER_MANIFESTS,
  getExecutableCommerceProviderManifest,
  STRIPE_COMMERCE_PROVIDER_MANIFEST,
  ZOESTORE_COMMERCE_PROVIDER_MANIFEST,
} from "./commerceProviderExecutableManifests";

describe(
  "executable commerce provider manifests",
  () => {
    it(
      "owns one canonical manifest for each currently executable commerce provider",
      () => {
        expect(
          EXECUTABLE_COMMERCE_PROVIDER_MANIFESTS.map(
            (
              manifest,
            ) =>
              manifest.key,
          ),
        ).toEqual([
          "zoestore",
          "stripe",
        ]);
      },
    );

    it(
      "defines ZoeStore as internal in both explicit environments",
      () => {
        expect(
          ZOESTORE_COMMERCE_PROVIDER_MANIFEST,
        ).toMatchObject({
          key:
            "zoestore",
          displayName:
            "Zoé Store",
          connectionKinds: [
            "internal",
          ],
          environments: [
            "test",
            "live",
          ],
        });
      },
    );

    it(
      "defines Stripe as credential-connected in both explicit environments",
      () => {
        expect(
          STRIPE_COMMERCE_PROVIDER_MANIFEST,
        ).toMatchObject({
          key:
            "stripe",
          displayName:
            "Stripe",
          connectionKinds: [
            "credentials",
          ],
          environments: [
            "test",
            "live",
          ],
        });
      },
    );

    it.each([
      "shopify",
      "square",
      "paypal",
      "unknown-provider",
    ])(
      "does not invent an executable manifest for %s",
      (
        provider,
      ) => {
        expect(
          getExecutableCommerceProviderManifest(
            provider,
          ),
        ).toBeNull();
      },
    );
  },
);
