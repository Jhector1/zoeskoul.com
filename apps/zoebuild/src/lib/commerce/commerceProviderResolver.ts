import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import {
  resolveCommerceProviderEnvironment,
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

export type ResolvedCommerceProvider =
  Readonly<{
    storeId: string;
    environment: CommerceProviderEnvironment;
    capability: CommerceProviderCapability;
    provider: string;
    connection: CommerceProviderConnectionSnapshot;
  }>;

export type CommerceProviderResolutionErrorCode =
  | "COMMERCE_STORE_NOT_FOUND"
  | "COMMERCE_PROVIDER_ROUTE_NOT_FOUND"
  | "COMMERCE_PROVIDER_CONNECTION_INVALID"
  | "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE";

export class CommerceProviderResolutionError
  extends Error {
  readonly code:
    CommerceProviderResolutionErrorCode;

  constructor(
    code: CommerceProviderResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name =
      "CommerceProviderResolutionError";
    this.code =
      code;
  }
}

function normalizedProjectId(
  value: string,
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
  surface: CommerceStorefrontSurface,
  status: string,
) {
  return surface === "published"
    ? status === "active"
    : status === "draft" ||
        status === "active";
}

/**
 * Persistence-only provider resolution.
 *
 * Executable capability support belongs to the shared ProviderRegistry,
 * not this database adapter.
 */
export async function resolveCommerceProvider(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    surface: CommerceStorefrontSurface;
    capability: CommerceProviderCapability;
  }>,
): Promise<ResolvedCommerceProvider> {
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
            storeId: store.id,
            environment,
            capability:
              input.capability,
          },
        },
        select: {
          provider: true,
          connectionId: true,
          connection: {
            select: {
              id: true,
              storeId: true,
              provider: true,
              environment: true,
              status: true,
              externalAccountRef: true,
              credentialsSecretRef: true,
              webhookSecretRef: true,
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

  if (
    !route.connection ||
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
  ) {
    throw new CommerceProviderResolutionError(
      "COMMERCE_PROVIDER_CONNECTION_INVALID",
      "Commerce provider connection is invalid.",
    );
  }

  return {
    storeId: store.id,
    environment,
    capability: input.capability,
    provider: route.provider,
    connection: {
      id: route.connection.id,
      externalAccountRef:
        route.connection.externalAccountRef,
      credentialsSecretRef:
        route.connection.credentialsSecretRef,
      webhookSecretRef:
        route.connection.webhookSecretRef,
      config:
        route.connection.config,
    },
  };
}
