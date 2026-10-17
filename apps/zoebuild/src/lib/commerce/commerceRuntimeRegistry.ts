import "server-only";
import type { VerifiedCommerceBuyerIp } from "./trustedCommerceBuyerIp";

import type {
  PrismaClient,
} from "@zoeskoul/db";
import type {
  CommercePaymentsCapabilityHandler,
} from "@zoeskoul/provider-contracts";
import {
  ProviderRegistry,
  type ProviderRegistration,
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
} from "./commerceProviderConnectionContract";
import {
  type CommerceProviderCapability,
  type CommerceProviderEnvironment,
} from "./nativeCommerceProvider";
import {
  STRIPE_COMMERCE_PROVIDER_MANIFEST,
  ZOESTORE_COMMERCE_PROVIDER_MANIFEST,
} from "./commerceProviderExecutableManifests";
import {
  prepareStripeCommercePayments,
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
  requiresSecretStore:
    boolean;
  listProducts(
    client: PrismaClient,
    input: CommerceCatalogListInput,
    context:
      CommerceProviderExecutionContext,
  ): Promise<readonly CommerceCatalogProduct[]>;
  getProduct(
    client: PrismaClient,
    input: CommerceCatalogGetInput,
    context:
      CommerceProviderExecutionContext,
  ): Promise<CommerceCatalogProduct | null>;
}>;

type CartHandler = Readonly<{
  capability: "commerce.cart";
  requiresSecretStore:
    boolean;
  executeCommand(
    client: PrismaClient,
    input: CommerceCartRuntimeInput,
    context:
      CommerceProviderExecutionContext,
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
  requiresSecretStore:
    boolean;
  beginCheckout(
    client: PrismaClient,
    input: Readonly<{
      buildProjectId: string;
      surface:
        CommerceRuntimeSurface;
      request:
        CommerceCheckoutRequest;
    }>,
    context:
      CommerceProviderExecutionContext,
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
    provider: string;
    environment:
      CommerceProviderEnvironment;
    connection:
      CommerceProviderConnectionSnapshot;
    secretStore?:
      BuildSecretStore;
    verifiedBuyerIp?: VerifiedCommerceBuyerIp;
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

export type CommerceProviderAdapterRegistration =
  ProviderRegistration<
    RuntimeCommerceCapability,
    CommerceRuntimeHandler
  >;

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
  environment:
    CommerceProviderEnvironment,
): boolean {
  return COMMERCE_RUNTIME_REGISTRY
    .supportsInEnvironment(
      provider,
      runtimeCommerceCapabilityForProviderCapability(
        capability,
      ),
      environment,
    );
}

export function supportsCommerceProviderExecutionForEnvironments(
  provider: string,
  capability:
    CommerceProviderCapability,
  environments:
    readonly CommerceProviderEnvironment[],
): boolean {
  return (
    environments.length > 0 &&
    environments.every(
      (environment) =>
        supportsCommerceProviderExecution(
          provider,
          capability,
          environment,
        ),
    )
  );
}

export function registerCommerceProviderAdapter(
  registration:
    CommerceProviderAdapterRegistration,
): void {
  COMMERCE_RUNTIME_REGISTRY.register(
    registration,
  );
}

registerCommerceProviderAdapter({
  manifest:
    ZOESTORE_COMMERCE_PROVIDER_MANIFEST,
  handlers: {
    "commerce.catalog": {
      capability:
        "commerce.catalog",
      requiresSecretStore:
        false,
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
      requiresSecretStore:
        false,
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
      requiresSecretStore:
        false,
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

registerCommerceProviderAdapter({
  manifest:
    STRIPE_COMMERCE_PROVIDER_MANIFEST,
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
