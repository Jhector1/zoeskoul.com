import type {
  ZoeProviderCapability,
} from "@zoeskoul/provider-contracts";
import type {
  ProviderPreset,
} from "@zoeskoul/provider-platform";

/**
 * Product-policy defaults for a nontechnical user.
 *
 * These are creation-time presets only. They must be materialized into
 * explicit capability routes. Runtime resolution must never silently
 * fall back to these providers.
 */
export const ZOE_RECOMMENDED_STORE_PRESET_V1:
  ProviderPreset<ZoeProviderCapability> = {
    key: "zoe-recommended-store",
    version: 1,
    label: "Zoe Recommended",
    description:
      "A ready-to-use store using Zoe-owned commerce where possible and replaceable external services where required.",
    routes: [
      {
        capability: "commerce.catalog",
        providerKey: "zoestore",
      },
      {
        capability: "commerce.inventory",
        providerKey: "zoestore",
      },
      {
        capability: "commerce.cart",
        providerKey: "zoestore",
      },
      {
        capability: "commerce.orders",
        providerKey: "zoestore",
      },
      {
        capability: "commerce.checkout",
        providerKey: "zoestore",
      },
      {
        capability: "commerce.payments",
        providerKey: "stripe",
      },
      {
        capability: "engagement.contacts",
        providerKey: "zoe",
      },
      {
        capability: "engagement.subscribers",
        providerKey: "zoe",
      },
      {
        capability: "messaging.email.transactional",
        providerKey: "brevo",
      },
    ],
  } as const;

export const ZOE_RECOMMENDED_STORE_NO_PAYMENTS_PRESET_V1:
  ProviderPreset<ZoeProviderCapability> = {
    key: "zoe-recommended-store-no-payments",
    version: 1,
    label: "Zoe Recommended — No Payments",
    description:
      "Zoe-owned store, contacts, subscribers, and transactional messaging without a payment route.",
    routes:
      ZOE_RECOMMENDED_STORE_PRESET_V1.routes.filter(
        (route) =>
          route.capability !== "commerce.payments",
      ),
  } as const;
