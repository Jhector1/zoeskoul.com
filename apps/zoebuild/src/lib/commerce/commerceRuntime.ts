import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";
import type {
  CommerceCapability,
} from "@zoeskoul/provider-contracts";
import {
  ProviderRegistry,
  ProviderRegistryError,
} from "@zoeskoul/provider-platform";

import {
  getNativeCommerceProduct,
  listNativeCommerceProducts,
} from "./nativeCommerceCatalog";
import {
  executeNativeCommerceCartCommand,
  type NativeCommerceCartCommand,
} from "./nativeCommerceCart";
import {
  beginNativeCommerceCheckout,
  type CommerceCheckoutRequest,
} from "./nativeCommerceCheckout";
import {
  CommerceProviderResolutionError,
  resolveCommerceProvider,
} from "./commerceProviderResolver";
import {
  ZOESTORE_COMMERCE_DISPLAY_NAME,
  ZOESTORE_COMMERCE_PROVIDER,
  type CommerceProviderCapability,
  type CommerceStorefrontSurface,
} from "./nativeCommerceProvider";

type RuntimeCommerceCapability =
  | "commerce.catalog"
  | "commerce.cart"
  | "commerce.orders"
  | "commerce.checkout";

type CatalogHandler = Readonly<{
  capability: "commerce.catalog";
  listProducts: typeof listNativeCommerceProducts;
  getProduct: typeof getNativeCommerceProduct;
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
  beginCheckout:
    typeof beginNativeCommerceCheckout;
}>;

type CommerceRuntimeHandler =
  | CatalogHandler
  | CartHandler
  | OrdersHandler
  | CheckoutHandler;

const PERSISTED_CAPABILITY_BY_RUNTIME:
  Readonly<
    Record<
      RuntimeCommerceCapability,
      CommerceProviderCapability
    >
  > = {
    "commerce.catalog":
      "catalog",
    "commerce.cart":
      "cart",
    "commerce.orders":
      "orders",
    "commerce.checkout":
      "checkout",
  };

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
      beginCheckout:
        beginNativeCommerceCheckout,
    },
  },
});

async function resolveHandler<
  TCapability extends RuntimeCommerceCapability,
>(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    surface: CommerceStorefrontSurface;
  }>,
  capability: TCapability,
) {
  const resolved =
    await resolveCommerceProvider(
      client,
      {
        ...input,
        capability:
          PERSISTED_CAPABILITY_BY_RUNTIME[
            capability
          ],
      },
    );

  try {
    const handler =
      COMMERCE_RUNTIME_REGISTRY
        .getHandler(
          resolved.provider,
          capability,
        );

    if (
      handler.capability !==
        capability
    ) {
      throw new ProviderRegistryError(
        `Provider "${resolved.provider}" returned a mismatched commerce handler.`,
      );
    }

    return {
      resolved,
      handler,
    };
  } catch (
    error
  ) {
    if (
      error instanceof
      ProviderRegistryError
    ) {
      throw new CommerceProviderResolutionError(
        "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
        "Configured commerce provider is not available on this execution path.",
      );
    }

    throw error;
  }
}

export async function listCommerceProducts(
  client: PrismaClient,
  input: Parameters<
    typeof listNativeCommerceProducts
  >[1],
) {
  const { handler } =
    await resolveHandler(
      client,
      input,
      "commerce.catalog",
    );

  if (
    handler.capability !==
      "commerce.catalog"
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Configured commerce provider cannot list products.",
    );
  }

  return handler.listProducts(
    client,
    input,
  );
}

export async function getCommerceProduct(
  client: PrismaClient,
  input: Parameters<
    typeof getNativeCommerceProduct
  >[1],
) {
  const { handler } =
    await resolveHandler(
      client,
      input,
      "commerce.catalog",
    );

  if (
    handler.capability !==
      "commerce.catalog"
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Configured commerce provider cannot read products.",
    );
  }

  return handler.getProduct(
    client,
    input,
  );
}

export async function executeCommerceCartCommand(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    surface: CommerceStorefrontSurface;
    command: NativeCommerceCartCommand;
  }>,
) {
  const { handler } =
    await resolveHandler(
      client,
      input,
      "commerce.cart",
    );

  if (
    handler.capability !==
      "commerce.cart"
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Configured commerce provider cannot execute cart operations.",
    );
  }

  return handler.executeCommand(
    client,
    input,
  );
}

export async function beginCommerceCheckout(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    surface: CommerceStorefrontSurface;
    request: CommerceCheckoutRequest;
  }>,
) {
  const { handler } =
    await resolveHandler(
      client,
      input,
      "commerce.checkout",
    );

  if (
    handler.capability !==
      "commerce.checkout"
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Configured commerce provider cannot begin checkout.",
    );
  }

  return handler.beginCheckout(
    client,
    input,
  );
}

/**
 * Compile-time proof that this runtime is using the shared namespaced
 * domain contract even though the current Prisma enum remains unnamespaced.
 */
const _runtimeCapabilityContract:
  CommerceCapability =
    "commerce.checkout";

void _runtimeCapabilityContract;
