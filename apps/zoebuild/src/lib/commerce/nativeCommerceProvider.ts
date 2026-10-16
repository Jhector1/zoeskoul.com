export const COMMERCE_PROVIDER_ENVIRONMENTS = [
  "test",
  "live",
] as const;

export type CommerceProviderEnvironment =
  (typeof COMMERCE_PROVIDER_ENVIRONMENTS)[number];

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

export const ZOEBUILD_NATIVE_COMMERCE_PROVIDER =
  "zoebuild-native" as const;

export const ZOEBUILD_NATIVE_DEFAULT_CAPABILITIES = [
  "catalog",
  "inventory",
  "cart",
  "orders",
  "checkout",
] as const satisfies readonly CommerceProviderCapability[];

export function defaultNativeCommerceProviderRoutes() {
  return COMMERCE_PROVIDER_ENVIRONMENTS.flatMap(
    (environment) =>
      ZOEBUILD_NATIVE_DEFAULT_CAPABILITIES.map(
        (capability) => ({
          environment,
          capability,
          provider:
            ZOEBUILD_NATIVE_COMMERCE_PROVIDER,
        }),
      ),
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
  surface:
    CommerceStorefrontSurface,
): CommerceProviderEnvironment {
  return surface ===
    "preview"
    ? "test"
    : "live";
}

export interface CommerceProviderAdapter {
  readonly provider:
    string;

  readonly capabilities:
    CommerceProviderCapabilities;

  supportsEnvironment(
    environment:
      CommerceProviderEnvironment,
  ): boolean;
}

export type CommerceProviderRoute = Readonly<{
  provider:
    string;
  environment:
    CommerceProviderEnvironment;
  capability:
    CommerceProviderCapability;
  connectionId:
    string | null;
}>;
