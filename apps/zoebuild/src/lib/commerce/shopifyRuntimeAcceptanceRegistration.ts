import "server-only";

import type { CommerceProviderAdapterRegistration } from "./commerceRuntimeRegistry";
import {
  beginShopifyCommerceHostedCheckout,
  executeShopifyCommerceCartCommand,
  getShopifyCommerceProduct,
  listShopifyCommerceProducts,
  ShopifyCommerceRuntimeAdapterError,
} from "./shopifyCommerceRuntimeAdapter";

/**
 * Disabled in normal development and in every production deployment. Only
 * an explicitly armed automated TEST process can construct executable
 * Shopify runtime handlers. Shopify is intentionally absent from the public
 * executable-provider manifests until migration/ingress/E2E gates pass.
 */
export const SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN =
  "ACCEPT_SHOPIFY_TEST_RUNTIME_ONLY_NO_PRODUCTION" as const;

export function shopifyAcceptanceRuntimeAllowed(input: Readonly<{
  nodeEnv?: string;
  activationToken?: string;
  signingKey?: string;
}>): boolean {
  return input.nodeEnv === "test" &&
    input.activationToken === SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN &&
    typeof input.signingKey === "string" &&
    Buffer.byteLength(input.signingKey, "utf8") >= 32;
}

/**
 * The Shopify payment owner is *provider-hosted*, not a synthetic payment
 * session. Do not register a ZoeStore payment handler for Shopify.
 */
export const SHOPIFY_ACCEPTANCE_RUNTIME_REGISTRATION = {
  manifest: {
    key: "shopify",
    displayName: "Shopify (test acceptance only)",
    connectionKinds: ["credentials"],
    environments: ["test"],
  },
  handlers: {
    "commerce.catalog": {
      capability: "commerce.catalog",
      requiresSecretStore: true,
      listProducts: listShopifyCommerceProducts,
      getProduct: getShopifyCommerceProduct,
    },
    "commerce.inventory": {
      capability: "commerce.inventory",
    },
    "commerce.cart": {
      capability: "commerce.cart",
      requiresSecretStore: true,
      async executeCommand(client, input, context) {
        if (!context.verifiedBuyerIp) {
          throw new ShopifyCommerceRuntimeAdapterError();
        }
        return executeShopifyCommerceCartCommand(client, input, context, {
          buyerIp: context.verifiedBuyerIp,
        });
      },
    },
    "commerce.orders": {
      capability: "commerce.orders",
    },
    "commerce.checkout": {
      capability: "commerce.checkout",
      requiresSecretStore: true,
      beginCheckout: beginShopifyCommerceHostedCheckout,
    },
    "commerce.payments": {
      capability: "commerce.payments",
      requiresSecretStore: false,
      executionMode: "provider-hosted",
    },
  },
} satisfies CommerceProviderAdapterRegistration;
