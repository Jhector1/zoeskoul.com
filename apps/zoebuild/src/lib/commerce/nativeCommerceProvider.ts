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
