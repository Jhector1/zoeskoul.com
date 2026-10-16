import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import {
  COMMERCE_PROVIDER_CAPABILITIES,
  ZOEBUILD_NATIVE_COMMERCE_PROVIDER,
  ZOEBUILD_NATIVE_DEFAULT_CAPABILITIES,
  resolveCommerceProviderEnvironment,
  type CommerceProviderAdapter,
  type CommerceProviderCapabilities,
  type CommerceProviderCapability,
  type CommerceProviderEnvironment,
  type CommerceStorefrontSurface,
} from "./nativeCommerceProvider";

export type CommerceProviderConnectionSnapshot =
  Readonly<{
    id: string;
    externalAccountRef: string | null;
    credentialsSecretRef: string | null;
    webhookSecretRef: string | null;
    config: unknown;
  }>;

export type CommerceProviderRegistration =
  Readonly<{
    adapter: CommerceProviderAdapter;
    connectionRequired: boolean;
  }>;

export type CommerceProviderRegistry =
  ReadonlyMap<
    string,
    CommerceProviderRegistration
  >;

export type ResolvedCommerceProvider =
  Readonly<{
    storeId: string;
    environment: CommerceProviderEnvironment;
    capability: CommerceProviderCapability;
    provider: string;
    connection:
      CommerceProviderConnectionSnapshot | null;
    adapter: CommerceProviderAdapter;
  }>;

export type CommerceProviderResolutionErrorCode =
  | "COMMERCE_STORE_NOT_FOUND"
  | "COMMERCE_PROVIDER_ROUTE_NOT_FOUND"
  | "COMMERCE_PROVIDER_NOT_REGISTERED"
  | "COMMERCE_PROVIDER_CAPABILITY_UNSUPPORTED"
  | "COMMERCE_PROVIDER_ENVIRONMENT_UNSUPPORTED"
  | "COMMERCE_PROVIDER_CONNECTION_REQUIRED"
  | "COMMERCE_PROVIDER_CONNECTION_INVALID"
  | "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE";

export class CommerceProviderResolutionError
  extends Error {
  readonly code:
    CommerceProviderResolutionErrorCode;

  constructor(
    code:
      CommerceProviderResolutionErrorCode,
    message:
      string,
  ) {
    super(message);
    this.name =
      "CommerceProviderResolutionError";
    this.code =
      code;
  }
}

function capabilityRecord(
  enabled:
    readonly CommerceProviderCapability[],
): CommerceProviderCapabilities {
  const enabledSet =
    new Set<
      CommerceProviderCapability
    >(
      enabled,
    );

  return Object.fromEntries(
    COMMERCE_PROVIDER_CAPABILITIES.map(
      (capability) => [
        capability,
        enabledSet.has(
          capability,
        ),
      ],
    ),
  ) as CommerceProviderCapabilities;
}

export const ZOEBUILD_NATIVE_COMMERCE_ADAPTER:
  CommerceProviderAdapter = {
    provider:
      ZOEBUILD_NATIVE_COMMERCE_PROVIDER,

    capabilities:
      capabilityRecord(
        ZOEBUILD_NATIVE_DEFAULT_CAPABILITIES,
      ),

    supportsEnvironment(
      environment,
    ) {
      return (
        environment ===
          "test" ||
        environment ===
          "live"
      );
    },
  };

export function createCommerceProviderRegistry(
  registrations:
    readonly CommerceProviderRegistration[],
): CommerceProviderRegistry {
  const registry =
    new Map<
      string,
      CommerceProviderRegistration
    >();

  for (
    const registration of
    registrations
  ) {
    const provider =
      registration
        .adapter
        .provider
        .trim();

    if (
      !provider ||
      provider !==
        registration
          .adapter
          .provider
    ) {
      throw new Error(
        "Commerce provider ids must be non-empty normalized strings.",
      );
    }

    if (
      registry.has(
        provider,
      )
    ) {
      throw new Error(
        `Duplicate commerce provider registration: ${provider}.`,
      );
    }

    registry.set(
      provider,
      registration,
    );
  }

  return registry;
}

export const COMMERCE_PROVIDER_REGISTRY =
  createCommerceProviderRegistry([
    {
      adapter:
        ZOEBUILD_NATIVE_COMMERCE_ADAPTER,
      connectionRequired:
        false,
    },
  ]);

function normalizedProjectId(
  value:
    string,
) {
  const buildProjectId =
    value.trim();

  if (!buildProjectId) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_STORE_NOT_FOUND",
      "Commerce store not found.",
    );
  }

  return buildProjectId;
}

function storeAllowedForSurface(
  surface:
    CommerceStorefrontSurface,
  status:
    string,
) {
  return surface ===
    "published"
    ? status ===
        "active"
    : status ===
        "draft" ||
        status ===
          "active";
}

function registeredProvider(
  registry:
    CommerceProviderRegistry,
  provider:
    string,
) {
  const registration =
    registry.get(
      provider,
    );

  if (!registration) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_NOT_REGISTERED",
      "Commerce provider is not registered.",
    );
  }

  return registration;
}

export function requireCommerceProviderAdapter<
  TAdapter extends CommerceProviderAdapter,
>(
  resolved: ResolvedCommerceProvider,
  adapter: TAdapter,
): TAdapter {
  if (
    resolved.adapter !==
    adapter
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
      "Configured commerce provider is not available on this execution path.",
    );
  }

  return adapter;
}

export async function resolveCommerceProvider(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId: string;
      surface: CommerceStorefrontSurface;
      capability: CommerceProviderCapability;
    }>,
  registry:
    CommerceProviderRegistry =
      COMMERCE_PROVIDER_REGISTRY,
): Promise<
  ResolvedCommerceProvider
> {
  const buildProjectId =
    normalizedProjectId(
      input.buildProjectId,
    );

  const environment =
    resolveCommerceProviderEnvironment(
      input.surface,
    );

  const store =
    await client
      .commerceStore
      .findUnique({
        where: {
          buildProjectId,
        },
        select: {
          id: true,
          status: true,
        },
      });

  if (
    !store ||
    !storeAllowedForSurface(
      input.surface,
      store.status,
    )
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_STORE_NOT_FOUND",
      "Commerce store not found.",
    );
  }

  const route =
    await client
      .commerceProviderRoute
      .findUnique({
        where: {
          storeId_environment_capability: {
            storeId:
              store.id,
            environment,
            capability:
              input.capability,
          },
        },
        select: {
          provider: true,
          connectionId:
            true,
          connection: {
            select: {
              id: true,
              storeId: true,
              provider: true,
              environment:
                true,
              status: true,
              externalAccountRef:
                true,
              credentialsSecretRef:
                true,
              webhookSecretRef:
                true,
              config: true,
            },
          },
        },
      });

  if (!route) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_ROUTE_NOT_FOUND",
      "Commerce capability is not configured.",
    );
  }

  const registration =
    registeredProvider(
      registry,
      route.provider,
    );

  if (
    !registration
      .adapter
      .capabilities[
        input.capability
      ]
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_CAPABILITY_UNSUPPORTED",
      "Configured commerce provider does not support this capability.",
    );
  }

  if (
    !registration
      .adapter
      .supportsEnvironment(
        environment,
      )
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_ENVIRONMENT_UNSUPPORTED",
      "Configured commerce provider does not support this environment.",
    );
  }

  if (
    route.connectionId &&
    !route.connection
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_CONNECTION_INVALID",
      "Commerce provider connection is invalid.",
    );
  }

  if (
    route.connection &&
    (
      route.connection.id !==
        route.connectionId ||
      route.connection.storeId !==
        store.id ||
      route.connection.provider !==
        route.provider ||
      route.connection.environment !==
        environment ||
      route.connection.status !==
        "active"
    )
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_CONNECTION_INVALID",
      "Commerce provider connection is invalid.",
    );
  }

  if (
    registration
      .connectionRequired &&
    !route.connection
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_CONNECTION_REQUIRED",
      "Commerce provider connection is required.",
    );
  }

  return {
    storeId:
      store.id,
    environment,
    capability:
      input.capability,
    provider:
      route.provider,
    connection:
      route.connection
        ? {
            id:
              route.connection.id,
            externalAccountRef:
              route.connection.externalAccountRef,
            credentialsSecretRef:
              route.connection.credentialsSecretRef,
            webhookSecretRef:
              route.connection.webhookSecretRef,
            config:
              route.connection.config,
          }
        : null,
    adapter:
      registration.adapter,
  };
}
