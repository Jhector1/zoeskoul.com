import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";
import type {
  CommercePaymentsCapabilityHandler,
} from "@zoeskoul/provider-contracts";
import {
  ProviderRegistry,
} from "@zoeskoul/provider-platform";
import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  getNativeCommerceProduct,
  listNativeCommerceProducts,
} from "./nativeCommerceCatalog";
import {
  executeNativeCommerceCartCommand,
  type NativeCommerceCartCommand,
} from "./nativeCommerceCart";
import type {
  CommerceCheckoutRequest,
  CommerceCheckoutResult,
  TrustedCommerceOrderSnapshot,
} from "./nativeCommerceCheckout";
import type {
  CommerceProviderConnectionSnapshot,
} from "./commerceProviderResolver";
import {
  ZOESTORE_COMMERCE_DISPLAY_NAME,
  ZOESTORE_COMMERCE_PROVIDER,
  type CommerceProviderEnvironment,
  type CommerceStorefrontSurface,
} from "./nativeCommerceProvider";
import {
  prepareStripeCommercePayments,
  STRIPE_COMMERCE_PROVIDER,
} from "./stripeCommerceCheckout";
import {
  prepareStripeCommercePaymentReconciliation,
} from "./stripeCommerceReconciliation";
import type {
  CommerceCheckoutReconciliationOrder,
} from "./commerceCheckoutReconciliation";

export type RuntimeCommerceCapability =
  | "commerce.catalog"
  | "commerce.cart"
  | "commerce.orders"
  | "commerce.checkout"
  | "commerce.payments";

type CatalogHandler = Readonly<{
  capability: "commerce.catalog";
  listProducts:
    typeof listNativeCommerceProducts;
  getProduct:
    typeof getNativeCommerceProduct;
}>;

type CartHandler = Readonly<{
  capability: "commerce.cart";
  executeCommand:
    typeof executeNativeCommerceCartCommand;
}>;

type OrdersHandler = Readonly<{
  capability: "commerce.orders";
}>;

type CheckoutHandler = Readonly<{
  capability: "commerce.checkout";
  beginCheckout(
    client: PrismaClient,
    input: Readonly<{
      buildProjectId: string;
      surface:
        CommerceStorefrontSurface;
      request:
        CommerceCheckoutRequest;
    }>,
  ): Promise<CommerceCheckoutResult>;
}>;

export type PreparedCommercePayments =
  Readonly<{
    provider: string;
    forOrder(
      order:
        TrustedCommerceOrderSnapshot,
    ):
      CommercePaymentsCapabilityHandler;
  }>;

type PaymentInspectionHandler =
  Pick<
    CommercePaymentsCapabilityHandler,
    "inspectPayment" |
    "cancelPayment"
  >;

export type PreparedCommercePaymentReconciliation =
  Readonly<{
    provider: string;

    forOrder(
      order:
        CommerceCheckoutReconciliationOrder,
    ):
      PaymentInspectionHandler;

    reconcilePaid(
      client: PrismaClient,
      input:
        Readonly<{
          buildProjectId: string;
          orderId: string;
          providerRef: string;
        }>,
    ): Promise<unknown>;

    reconcileExpired(
      client: PrismaClient,
      input:
        Readonly<{
          buildProjectId: string;
          orderId: string;
          providerRef: string;
        }>,
    ): Promise<unknown>;
  }>;

type PaymentProviderContext =
  Readonly<{
    buildProjectId: string;
    environment:
      CommerceProviderEnvironment;
    connection:
      CommerceProviderConnectionSnapshot;
    secretStore?:
      BuildSecretStore;
  }>;

type PaymentHandler = Readonly<{
  capability: "commerce.payments";
  requiresSecretStore:
    boolean;

  prepare(
    input:
      PaymentProviderContext,
  ):
    Promise<
      PreparedCommercePayments
    >;

  prepareReconciliation?(
    input:
      PaymentProviderContext,
  ):
    Promise<
      PreparedCommercePaymentReconciliation
    >;
}>;

export type CommerceRuntimeHandler =
  | CatalogHandler
  | CartHandler
  | OrdersHandler
  | CheckoutHandler
  | PaymentHandler;

export const COMMERCE_RUNTIME_REGISTRY =
  new ProviderRegistry<
    RuntimeCommerceCapability,
    CommerceRuntimeHandler
  >();

COMMERCE_RUNTIME_REGISTRY.register({
  manifest: {
    key:
      ZOESTORE_COMMERCE_PROVIDER,
    displayName:
      ZOESTORE_COMMERCE_DISPLAY_NAME,
    connectionKinds: [
      "internal",
    ],
  },
  handlers: {
    "commerce.catalog": {
      capability:
        "commerce.catalog",
      listProducts:
        listNativeCommerceProducts,
      getProduct:
        getNativeCommerceProduct,
    },
    "commerce.cart": {
      capability:
        "commerce.cart",
      executeCommand:
        executeNativeCommerceCartCommand,
    },
    "commerce.orders": {
      capability:
        "commerce.orders",
    },
    "commerce.checkout": {
      capability:
        "commerce.checkout",
      async beginCheckout(
        client,
        input,
      ) {
        const {
          beginNativeCommerceCheckout,
        } =
          await import(
            "./nativeCommerceCheckout"
          );

        return beginNativeCommerceCheckout(
          client,
          input,
        );
      },
    },
  },
});

COMMERCE_RUNTIME_REGISTRY.register({
  manifest: {
    key:
      STRIPE_COMMERCE_PROVIDER,
    displayName:
      "Stripe",
    connectionKinds: [
      "credentials",
    ],
  },
  handlers: {
    "commerce.payments": {
      capability:
        "commerce.payments",
      requiresSecretStore:
        true,
      prepare:
        prepareStripeCommercePayments,
      prepareReconciliation:
        prepareStripeCommercePaymentReconciliation,
    },
  },
});

const _cartCommandContract:
  NativeCommerceCartCommand | null =
    null;

void _cartCommandContract;
