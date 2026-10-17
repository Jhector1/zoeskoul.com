import {
  ZOE_RECOMMENDED_STORE_PRESET_V1,
} from "@zoeskoul/provider-presets";

export const COMMERCE_PROVIDER_ENVIRONMENTS = [
  "test",
  "live",
] as const;

export type CommerceProviderEnvironment =
  (typeof COMMERCE_PROVIDER_ENVIRONMENTS)[number];

/**
 * Persistence bridge for the current CommerceProviderCapability Prisma enum.
 * Runtime contracts use namespaced `commerce.*` capability keys.
 */
export const COMMERCE_PROVIDER_CAPABILITIES = [
  "catalog",
  "inventory",
  "cart",
  "orders",
  "checkout",
  "payments",
] as const;

export type CommerceProviderCapability =
  (typeof COMMERCE_PROVIDER_CAPABILITIES)[number];

export const ZOESTORE_COMMERCE_PROVIDER =
  "zoestore" as const;

export const ZOESTORE_COMMERCE_DISPLAY_NAME =
  "Zoé Store" as const;

const PERSISTED_CAPABILITY_BY_RUNTIME = {
  "commerce.catalog": "catalog",
  "commerce.inventory": "inventory",
  "commerce.cart": "cart",
  "commerce.orders": "orders",
  "commerce.checkout": "checkout",
  "commerce.payments": "payments",
} as const satisfies Readonly<
  Record<string, CommerceProviderCapability>
>;

export const ZOESTORE_DEFAULT_CAPABILITIES =
  ZOE_RECOMMENDED_STORE_PRESET_V1.routes
    .filter(
      (route) =>
        route.providerKey ===
        ZOESTORE_COMMERCE_PROVIDER,
    )
    .map(
      (route) =>
        PERSISTED_CAPABILITY_BY_RUNTIME[
          route.capability as keyof typeof PERSISTED_CAPABILITY_BY_RUNTIME
        ],
    )
    .filter(
      (
        capability,
      ): capability is CommerceProviderCapability =>
        Boolean(capability),
    );

export function zoeStoreCommerceProviderRoutes(
  input: Readonly<{
    storeId: string;
    environment: CommerceProviderEnvironment;
    connectionId: string;
  }>,
) {
  return ZOESTORE_DEFAULT_CAPABILITIES.map(
    (capability) => ({
      storeId: input.storeId,
      environment: input.environment,
      capability,
      provider: ZOESTORE_COMMERCE_PROVIDER,
      connectionId: input.connectionId,
    }),
  );
}

export type CommerceStorefrontSurface =
  | "preview"
  | "published";

export type CommerceProviderCapabilities =
  Readonly<
    Record<
      CommerceProviderCapability,
      boolean
    >
  >;

export function resolveCommerceProviderEnvironment(
  surface: CommerceStorefrontSurface,
): CommerceProviderEnvironment {
  return surface === "preview"
    ? "test"
    : "live";
}

export type CommerceProviderRoute = Readonly<{
  provider: string;
  environment: CommerceProviderEnvironment;
  capability: CommerceProviderCapability;
  connectionId: string;
}>;
