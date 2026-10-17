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
} from "./nativeCommerceCart";
import type {
  CommerceCart,
  CommerceCartRuntimeInput,
  CommerceCatalogGetInput,
  CommerceCatalogListInput,
  CommerceCatalogProduct,
  CommerceCheckoutRequest,
  CommerceCheckoutResult,
  CommerceRuntimeSurface,
  TrustedCommerceOrderSnapshot,
} from "./commerceRuntimeContracts";
import type {
  CommerceProviderConnectionSnapshot,
} from "./commerceProviderResolver";
import {
  ZOESTORE_COMMERCE_DISPLAY_NAME,
  ZOESTORE_COMMERCE_PROVIDER,
  type CommerceProviderCapability,
  type CommerceProviderEnvironment,
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
  | "commerce.inventory"
  | "commerce.cart"
  | "commerce.orders"
  | "commerce.checkout"
  | "commerce.payments";

type CatalogHandler = Readonly<{
  capability: "commerce.catalog";
  listProducts(
    client: PrismaClient,
    input: CommerceCatalogListInput,
  ): Promise<readonly CommerceCatalogProduct[]>;
  getProduct(
    client: PrismaClient,
    input: CommerceCatalogGetInput,
  ): Promise<CommerceCatalogProduct | null>;
}>;

type CartHandler = Readonly<{
  capability: "commerce.cart";
  executeCommand(
    client: PrismaClient,
    input: CommerceCartRuntimeInput,
  ): Promise<CommerceCart>;
}>;

type InventoryHandler = Readonly<{
  /**
   * Inventory currently has no direct public command surface, but provider
   * ownership is explicit and must still be represented by a registered
   * runtime handler before the admin route may persist it.
   */
  capability: "commerce.inventory";
}>;

type OrdersHandler = Readonly<{
  /**
   * Orders are currently owned by checkout/reconciliation orchestration rather
   * than a standalone public command surface.
   */
  capability: "commerce.orders";
}>;

type CheckoutHandler = Readonly<{
  capability: "commerce.checkout";
  beginCheckout(
    client: PrismaClient,
    input: Readonly<{
      buildProjectId: string;
      surface:
        CommerceRuntimeSurface;
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

/**
 * Trusted server-side context available to executable commerce provider
 * adapters. Secret material is never stored in the connection snapshot; a
 * secret store is supplied only when the execution path explicitly needs it.
 */
export type CommerceProviderExecutionContext =
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
      CommerceProviderExecutionContext,
  ):
    Promise<
      PreparedCommercePayments
    >;

  prepareReconciliation?(
    input:
      CommerceProviderExecutionContext,
  ):
    Promise<
      PreparedCommercePaymentReconciliation
    >;
}>;

export type CommerceRuntimeHandler =
  | CatalogHandler
  | InventoryHandler
  | CartHandler
  | OrdersHandler
  | CheckoutHandler
  | PaymentHandler;

export const COMMERCE_RUNTIME_REGISTRY =
  new ProviderRegistry<
    RuntimeCommerceCapability,
    CommerceRuntimeHandler
  >();

const RUNTIME_CAPABILITY_BY_PERSISTED = {
  catalog: "commerce.catalog",
  inventory: "commerce.inventory",
  cart: "commerce.cart",
  orders: "commerce.orders",
  checkout: "commerce.checkout",
  payments: "commerce.payments",
} as const satisfies Readonly<
  Record<
    CommerceProviderCapability,
    RuntimeCommerceCapability
  >
>;

export function runtimeCommerceCapabilityForProviderCapability(
  capability:
    CommerceProviderCapability,
): RuntimeCommerceCapability {
  return RUNTIME_CAPABILITY_BY_PERSISTED[
    capability
  ];
}

export function supportsCommerceProviderExecution(
  provider: string,
  capability:
    CommerceProviderCapability,
): boolean {
  return COMMERCE_RUNTIME_REGISTRY
    .supports(
      provider,
      runtimeCommerceCapabilityForProviderCapability(
        capability,
      ),
    );
}

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
    "commerce.inventory": {
      capability:
        "commerce.inventory",
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
