import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  ProviderConnectionKind,
} from "@zoeskoul/provider-platform";

import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  disconnectCommerceProviderEnvironment,
  type CommerceProviderConnectionLifecycleResult,
} from "./commerceProviderConnectionLifecycle";
import {
  COMMERCE_PROVIDER_ENVIRONMENTS,
  type CommerceProviderEnvironment,
} from "./nativeCommerceProvider";
import {
  connectStripeCommerceEnvironment,
  STRIPE_COMMERCE_PROVIDER,
  StripeCommerceConnectionError,
} from "./stripeCommerceConnection";

export type CommerceProviderConnectionAdapterInput =
  Readonly<{
    buildProjectId:
      string;
    storeId:
      string;
    environment:
      CommerceProviderEnvironment;
    payload:
      Readonly<
        Record<
          string,
          unknown
        >
      >;
    secretStore:
      BuildSecretStore;
  }>;

export type CommerceProviderConnectionAdapter =
  Readonly<{
    provider:
      string;
    connectionKind:
      ProviderConnectionKind;
    environments:
      readonly CommerceProviderEnvironment[];
    connect(
      client:
        PrismaClient,
      input:
        CommerceProviderConnectionAdapterInput,
    ):
      Promise<
        CommerceProviderConnectionLifecycleResult
      >;
    disconnect(
      client:
        PrismaClient,
      input:
        Omit<
          CommerceProviderConnectionAdapterInput,
          "payload"
        >,
    ):
      Promise<
        CommerceProviderConnectionLifecycleResult
      >;
  }>;

export class CommerceProviderConnectionAdapterError
  extends Error {
  readonly code:
    string;

  readonly status:
    number;

  constructor(
    code:
      string,
    message:
      string,
    status:
      number,
  ) {
    super(
      message,
    );

    this.name =
      "CommerceProviderConnectionAdapterError";

    this.code =
      code;

    this.status =
      status;
  }
}

const CONNECTION_ADAPTERS =
  new Map<
    string,
    CommerceProviderConnectionAdapter
  >();

export function registerCommerceProviderConnectionAdapter(
  adapter:
    CommerceProviderConnectionAdapter,
): void {
  const provider =
    adapter.provider
      .trim();

  if (
    !provider ||
    adapter.environments.length ===
      0
  ) {
    throw new Error(
      "Commerce provider connection adapter registration is invalid.",
    );
  }

  if (
    CONNECTION_ADAPTERS.has(
      provider,
    )
  ) {
    throw new Error(
      `Commerce provider connection adapter already registered: ${provider}`,
    );
  }

  CONNECTION_ADAPTERS.set(
    provider,
    {
      ...adapter,
      provider,
      environments: [
        ...new Set(
          adapter.environments,
        ),
      ],
    },
  );
}

export function getCommerceProviderConnectionAdapter(
  provider:
    string,
): CommerceProviderConnectionAdapter | null {
  return (
    CONNECTION_ADAPTERS.get(
      provider.trim(),
    ) ??
    null
  );
}

export function supportsCommerceProviderConnectionEnvironment(
  provider:
    string,
  environment:
    CommerceProviderEnvironment,
): boolean {
  return Boolean(
    getCommerceProviderConnectionAdapter(
      provider,
    )
      ?.environments
      .includes(
        environment,
      ),
  );
}

registerCommerceProviderConnectionAdapter({
  provider:
    STRIPE_COMMERCE_PROVIDER,
  connectionKind:
    "credentials",
  environments:
    COMMERCE_PROVIDER_ENVIRONMENTS,

  async connect(
    client,
    input,
  ) {
    const apiKey =
      typeof input
        .payload
        .apiKey ===
        "string"
        ? input
            .payload
            .apiKey
        : "";

    if (!apiKey) {
      throw new CommerceProviderConnectionAdapterError(
        "STRIPE_CONNECTION_INPUT_INVALID",
        "Stripe environment and API key are required.",
        400,
      );
    }

    try {
      return await connectStripeCommerceEnvironment(
        client,
        {
          buildProjectId:
            input.buildProjectId,
          storeId:
            input.storeId,
          environment:
            input.environment,
          apiKey,
          secretStore:
            input.secretStore,
        },
      );
    } catch (
      error
    ) {
      if (
        error instanceof
          StripeCommerceConnectionError
      ) {
        throw new CommerceProviderConnectionAdapterError(
          error.code,
          error.message,
          error.status,
        );
      }

      throw error;
    }
  },

  async disconnect(
    client,
    input,
  ) {
    return disconnectCommerceProviderEnvironment(
      client,
      {
        buildProjectId:
          input.buildProjectId,
        storeId:
          input.storeId,
        provider:
          STRIPE_COMMERCE_PROVIDER,
        environment:
          input.environment,
        secretStore:
          input.secretStore,
      },
    );
  },
});
