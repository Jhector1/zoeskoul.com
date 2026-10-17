import {
  COMMERCE_PROVIDER_CAPABILITIES,
  COMMERCE_PROVIDER_ENVIRONMENTS,
  ZOEBUILD_NATIVE_COMMERCE_PROVIDER,
  ZOEBUILD_NATIVE_DEFAULT_CAPABILITIES,
  type CommerceProviderCapabilities,
  type CommerceProviderCapability,
  type CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

export const COMMERCE_PROVIDER_IDS = [
  ZOEBUILD_NATIVE_COMMERCE_PROVIDER,
  "shopify",
  "square",
  "stripe",
  "paypal",
] as const;

export type CommerceProviderId =
  (typeof COMMERCE_PROVIDER_IDS)[number];

export const DEFAULT_COMMERCE_STORE_PROVIDER =
  ZOEBUILD_NATIVE_COMMERCE_PROVIDER;

export const DEFAULT_COMMERCE_PAYMENT_PROVIDER:
  CommerceProviderId | null = null;

export type CommerceProviderDefinition =
  Readonly<{
    id: CommerceProviderId;
    displayName: string;
    description: string;
    connectionRequired: boolean;
    recommendedStore: boolean;
    recommendedPayment: boolean;
    environments:
      readonly CommerceProviderEnvironment[];
    capabilities:
      CommerceProviderCapabilities;
  }>;

function capabilityRecord(
  enabled:
    readonly CommerceProviderCapability[],
): CommerceProviderCapabilities {
  const enabledSet =
    new Set<
      CommerceProviderCapability
    >(enabled);

  return Object.fromEntries(
    COMMERCE_PROVIDER_CAPABILITIES.map(
      (capability) => [
        capability,
        enabledSet.has(capability),
      ],
    ),
  ) as CommerceProviderCapabilities;
}

export const COMMERCE_PROVIDER_DEFINITIONS =
  [
    {
      id:
        ZOEBUILD_NATIVE_COMMERCE_PROVIDER,
      displayName:
        "Zoé Store",
      description:
        "Built into ZoeBuild. Products, inventory, cart, orders, and checkout orchestration work without connecting an external store.",
      connectionRequired:
        false,
      recommendedStore:
        true,
      recommendedPayment:
        false,
      environments:
        COMMERCE_PROVIDER_ENVIRONMENTS,
      capabilities:
        capabilityRecord(
          ZOEBUILD_NATIVE_DEFAULT_CAPABILITIES,
        ),
    },
    {
      id:
        "shopify",
      displayName:
        "Shopify",
      description:
        "Use an existing Shopify store as the commerce system of record.",
      connectionRequired:
        true,
      recommendedStore:
        false,
      recommendedPayment:
        false,
      environments:
        COMMERCE_PROVIDER_ENVIRONMENTS,
      capabilities:
        capabilityRecord(
          COMMERCE_PROVIDER_CAPABILITIES,
        ),
    },
    {
      id:
        "square",
      displayName:
        "Square",
      description:
        "Use Square for catalog, inventory, orders, hosted checkout, and payments while ZoeBuild can retain its native cart.",
      connectionRequired:
        true,
      recommendedStore:
        false,
      recommendedPayment:
        false,
      environments:
        COMMERCE_PROVIDER_ENVIRONMENTS,
      capabilities:
        capabilityRecord([
          "catalog",
          "inventory",
          "orders",
          "checkout",
          "payments",
        ]),
    },
    {
      id:
        "stripe",
      displayName:
        "Stripe",
      description:
        "Use Stripe for hosted checkout and payments while Zoé Store continues to own products, inventory, cart, and orders.",
      connectionRequired:
        true,
      recommendedStore:
        false,
      recommendedPayment:
        true,
      environments:
        COMMERCE_PROVIDER_ENVIRONMENTS,
      capabilities:
        capabilityRecord([
          "checkout",
          "payments",
        ]),
    },
    {
      id:
        "paypal",
      displayName:
        "PayPal",
      description:
        "Use PayPal for hosted checkout and payments while Zoé Store continues to own the rest of the store.",
      connectionRequired:
        true,
      recommendedStore:
        false,
      recommendedPayment:
        false,
      environments:
        COMMERCE_PROVIDER_ENVIRONMENTS,
      capabilities:
        capabilityRecord([
          "checkout",
          "payments",
        ]),
    },
  ] as const satisfies
    readonly CommerceProviderDefinition[];

const PROVIDERS_BY_ID =
  new Map<
    string,
    CommerceProviderDefinition
  >(
    COMMERCE_PROVIDER_DEFINITIONS.map(
      (definition) => [
        definition.id,
        definition,
      ] as const,
    ),
  );

export function getCommerceProviderDefinition(
  provider:
    string,
): CommerceProviderDefinition | null {
  return (
    PROVIDERS_BY_ID.get(
      provider,
    ) ??
    null
  );
}

export function listCommerceProviderDefinitions():
  readonly CommerceProviderDefinition[] {
  return COMMERCE_PROVIDER_DEFINITIONS;
}
