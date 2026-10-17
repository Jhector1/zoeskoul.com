import {
  COMMERCE_PROVIDER_CAPABILITIES,
  COMMERCE_PROVIDER_ENVIRONMENTS,
  ZOESTORE_COMMERCE_PROVIDER,
  ZOESTORE_DEFAULT_CAPABILITIES,
  type CommerceProviderCapabilities,
  type CommerceProviderCapability,
  type CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

export const COMMERCE_PROVIDER_IDS = [
  ZOESTORE_COMMERCE_PROVIDER,
  "shopify",
  "square",
  "stripe",
  "paypal",
] as const;

export type CommerceProviderId =
  (typeof COMMERCE_PROVIDER_IDS)[number];

export const DEFAULT_COMMERCE_STORE_PROVIDER =
  ZOESTORE_COMMERCE_PROVIDER;

/**
 * Product recommendation only. Runtime resolution never falls back to it.
 */
export const DEFAULT_COMMERCE_PAYMENT_PROVIDER:
  CommerceProviderId = "stripe";

export type CommerceProviderDefinition =
  Readonly<{
    id: CommerceProviderId;
    displayName: string;
    description: string;
    /**
     * Whether the user must connect an external account.
     * Every runtime route still has an explicit connection, including ZoeStore.
     */
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
        ZOESTORE_COMMERCE_PROVIDER,
      displayName:
        "Zoé Store",
      description:
        "Built into ZoeBuild. Its internal test/live connections are provisioned automatically and remain replaceable capability by capability.",
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
          ZOESTORE_DEFAULT_CAPABILITIES,
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
        "Use Square for supported commerce capabilities when its adapter is connected.",
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
        "Use Stripe as a replaceable payment provider while another provider owns full-commerce checkout.",
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
          "payments",
        ]),
    },
    {
      id:
        "paypal",
      displayName:
        "PayPal",
      description:
        "Use PayPal as a replaceable payment provider while another provider owns full-commerce checkout.",
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
  provider: string,
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
