import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";
import {
  createBuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";
import type {
  CommerceCapability,
} from "@zoeskoul/provider-contracts";
import {
  ProviderRegistryError,
} from "@zoeskoul/provider-platform";

import type {
  CommerceCartCommand,
  CommerceCheckoutRequest,
  CommerceRuntimeSurface,
  TrustedCommerceOrderSnapshot,
} from "./commerceRuntimeContracts";
import {
  CommerceProviderResolutionError,
  resolveCommerceProvider,
} from "./commerceProviderResolver";
import type {
  CommerceProviderConnectionSnapshot,
} from "./commerceProviderConnectionContract";
import type {
  CommerceProviderCapability,
  CommerceProviderEnvironment,
} from "./nativeCommerceProvider";
import {
  COMMERCE_RUNTIME_REGISTRY,
  type CommerceProviderExecutionContext,
  type CommerceRuntimeHandler,
  type RuntimeCommerceCapability,
} from "./commerceRuntimeRegistry";
import type {
  CommerceCheckoutReconciliationOrder,
} from "./commerceCheckoutReconciliation";

const PERSISTED_CAPABILITY_BY_RUNTIME:
  Readonly<
    Record<
      RuntimeCommerceCapability,
      CommerceProviderCapability
    >
  > = {
    "commerce.catalog":
      "catalog",
    "commerce.inventory":
      "inventory",
    "commerce.cart":
      "cart",
    "commerce.orders":
      "orders",
    "commerce.checkout":
      "checkout",
    "commerce.payments":
      "payments",
  };

function requireCommerceProviderExecutionEnvironment(
  provider: string,
  capability: RuntimeCommerceCapability,
  environment: CommerceProviderEnvironment,
  unavailableMessage: string,
): void {
  if (
    COMMERCE_RUNTIME_REGISTRY
      .supportsInEnvironment(
        provider,
        capability,
        environment,
      )
  ) {
    return;
  }

  throw new CommerceProviderResolutionError(
    "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
    unavailableMessage,
  );
}

function createCommerceProviderExecutionContext(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      provider:
        string;
      environment:
        CommerceProviderEnvironment;
      connection:
        CommerceProviderConnectionSnapshot;
    }>,
  requiresSecretStore:
    boolean,
): CommerceProviderExecutionContext {
  return {
    buildProjectId:
      input.buildProjectId,
    provider:
      input.provider,
    environment:
      input.environment,
    connection:
      input.connection,
    secretStore:
      requiresSecretStore
        ? createBuildSecretStore({
            prisma:
              client,
          })
        : undefined,
  };
}

async function resolveHandler<
  TCapability extends RuntimeCommerceCapability,
>(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    surface: CommerceRuntimeSurface;
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
    requireCommerceProviderExecutionEnvironment(
      resolved.provider,
      capability,
      resolved.environment,
      "Configured commerce provider is not available on this execution path.",
    );

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

export async function prepareCommercePaymentReconciliation(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    provider: string;
    environment:
      CommerceProviderEnvironment;
    connection:
      CommerceProviderConnectionSnapshot;
    order:
      CommerceCheckoutReconciliationOrder;
  }>,
) {
  let handler:
    CommerceRuntimeHandler;

  try {
    requireCommerceProviderExecutionEnvironment(
      input.provider,
      "commerce.payments",
      input.environment,
      "Historical payment provider is not available on this execution path.",
    );

    handler =
      COMMERCE_RUNTIME_REGISTRY
        .getHandler(
          input.provider,
          "commerce.payments",
        );
  } catch (
    error
  ) {
    if (
      error instanceof
        ProviderRegistryError
    ) {
      throw new CommerceProviderResolutionError(
        "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
        "Historical payment provider is not available on this execution path.",
      );
    }

    throw error;
  }

  if (
    handler.capability !==
      "commerce.payments" ||
    !handler.prepareReconciliation
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Historical payment provider does not support payment inspection.",
    );
  }

  const executionContext =
    createCommerceProviderExecutionContext(
      client,
      {
        buildProjectId:
          input.buildProjectId,
        provider:
          input.provider,
        environment:
          input.environment,
        connection:
          input.connection,
      },
      handler.requiresSecretStore,
    );

  const prepared =
    await handler.prepareReconciliation(
      executionContext,
    );

  if (
    prepared.provider !==
      input.provider
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Historical payment provider returned a mismatched inspection handler.",
    );
  }

  const payments =
    prepared.forOrder(
      input.order,
    );

  if (!payments.inspectPayment) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Historical payment provider does not implement payment inspection.",
    );
  }

  return {
    provider:
      input.provider,
    environment:
      input.environment,
    inspectPayment:
      payments.inspectPayment,
    cancelPayment:
      payments.cancelPayment,
    reconcilePaid:
      prepared.reconcilePaid,
    reconcileExpired:
      prepared.reconcileExpired,
  } as const;
}

export async function prepareCommercePaymentCheckout(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    surface:
      CommerceRuntimeSurface;
  }>,
) {
  const {
    resolved,
    handler,
  } =
    await resolveHandler(
      client,
      input,
      "commerce.payments",
    );

  if (
    handler.capability !==
      "commerce.payments"
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Configured commerce payment provider returned a mismatched execution handler.",
    );
  }

  const executionContext =
    createCommerceProviderExecutionContext(
      client,
      {
        buildProjectId:
          input.buildProjectId,
        provider:
          resolved.provider,
        environment:
          resolved.environment,
        connection:
          resolved.connection,
      },
      handler.requiresSecretStore,
    );

  const prepared =
    await handler.prepare(
      executionContext,
    );

  if (
    prepared.provider !==
      resolved.provider
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Configured commerce payment provider returned a mismatched prepared handler.",
    );
  }

  return {
    provider:
      resolved.provider,
    environment:
      resolved.environment,

    async begin(
      paymentInput:
        Readonly<{
          order:
            TrustedCommerceOrderSnapshot;
          idempotencyKey:
            string;
        }>,
    ) {
      const payments =
        prepared.forOrder(
          paymentInput.order,
        );

      const session =
        await payments
          .createPaymentSession({
            orderId:
              paymentInput.order.id,
            amountMinor:
              paymentInput.order.totalMinor,
            currency:
              paymentInput.order.currency,
            idempotencyKey:
              paymentInput.idempotencyKey,
          });

      const redirectUrl =
        session.redirectUrl?.trim();

      if (!redirectUrl) {
        throw new CommerceProviderResolutionError(
          "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
          "Configured commerce payment provider did not return a hosted checkout URL.",
        );
      }

      return {
        url:
          redirectUrl,
        providerRef:
          session.remoteResourceId,
      };
    },
  } as const;
}

export async function listCommerceProducts(
  client: PrismaClient,
  input: Parameters<
    Extract<
      CommerceRuntimeHandler,
      {
        capability:
          "commerce.catalog";
      }
    >["listProducts"]
  >[1],
) {
  const {
    resolved,
    handler,
  } =
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

  const context =
    createCommerceProviderExecutionContext(
      client,
      {
        buildProjectId:
          input.buildProjectId,
        provider:
          resolved.provider,
        environment:
          resolved.environment,
        connection:
          resolved.connection,
      },
      handler.requiresSecretStore,
    );

  return handler.listProducts(
    client,
    input,
    context,
  );
}

export async function getCommerceProduct(
  client: PrismaClient,
  input: Parameters<
    Extract<
      CommerceRuntimeHandler,
      {
        capability:
          "commerce.catalog";
      }
    >["getProduct"]
  >[1],
) {
  const {
    resolved,
    handler,
  } =
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

  const context =
    createCommerceProviderExecutionContext(
      client,
      {
        buildProjectId:
          input.buildProjectId,
        provider:
          resolved.provider,
        environment:
          resolved.environment,
        connection:
          resolved.connection,
      },
      handler.requiresSecretStore,
    );

  return handler.getProduct(
    client,
    input,
    context,
  );
}

export async function executeCommerceCartCommand(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    surface: CommerceRuntimeSurface;
    command: CommerceCartCommand;
  }>,
) {
  const {
    resolved,
    handler,
  } =
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

  const context =
    createCommerceProviderExecutionContext(
      client,
      {
        buildProjectId:
          input.buildProjectId,
        provider:
          resolved.provider,
        environment:
          resolved.environment,
        connection:
          resolved.connection,
      },
      handler.requiresSecretStore,
    );

  return handler.executeCommand(
    client,
    input,
    context,
  );
}

export async function beginCommerceCheckout(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    surface: CommerceRuntimeSurface;
    request: CommerceCheckoutRequest;
  }>,
) {
  const {
    resolved,
    handler,
  } =
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

  const context =
    createCommerceProviderExecutionContext(
      client,
      {
        buildProjectId:
          input.buildProjectId,
        provider:
          resolved.provider,
        environment:
          resolved.environment,
        connection:
          resolved.connection,
      },
      handler.requiresSecretStore,
    );

  return handler.beginCheckout(
    client,
    input,
    context,
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
