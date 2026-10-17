import type {
  ProviderManifest,
} from "@zoeskoul/provider-platform";

import {
  COMMERCE_PROVIDER_ENVIRONMENTS,
  ZOESTORE_COMMERCE_DISPLAY_NAME,
  ZOESTORE_COMMERCE_PROVIDER,
} from "./nativeCommerceProvider";

import {
  STRIPE_COMMERCE_PROVIDER,
} from "./stripeCommerceCheckout";

export const ZOESTORE_COMMERCE_PROVIDER_MANIFEST =
  {
    key:
      ZOESTORE_COMMERCE_PROVIDER,
    displayName:
      ZOESTORE_COMMERCE_DISPLAY_NAME,
    connectionKinds: [
      "internal",
    ],
    environments:
      COMMERCE_PROVIDER_ENVIRONMENTS,
  } as const satisfies
    ProviderManifest;

export const STRIPE_COMMERCE_PROVIDER_MANIFEST =
  {
    key:
      STRIPE_COMMERCE_PROVIDER,
    displayName:
      "Stripe",
    connectionKinds: [
      "credentials",
    ],
    environments:
      COMMERCE_PROVIDER_ENVIRONMENTS,
  } as const satisfies
    ProviderManifest;

export const EXECUTABLE_COMMERCE_PROVIDER_MANIFESTS =
  [
    ZOESTORE_COMMERCE_PROVIDER_MANIFEST,
    STRIPE_COMMERCE_PROVIDER_MANIFEST,
  ] as const;

export function getExecutableCommerceProviderManifest(
  provider:
    string,
):
  ProviderManifest |
  null {
  return (
    EXECUTABLE_COMMERCE_PROVIDER_MANIFESTS.find(
      (
        manifest,
      ) =>
        manifest.key ===
        provider.trim(),
    ) ??
    null
  );
}
