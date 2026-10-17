import "server-only";

import Stripe from "stripe";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import type {
  CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

export const STRIPE_COMMERCE_PROVIDER =
  "stripe" as const;

const STRIPE_REQUEST_TIMEOUT_MS =
  10_000;

const STRIPE_MAX_NETWORK_RETRIES =
  1;

type StripeConnectionProbeClient =
  Readonly<{
    checkout:
      Readonly<{
        sessions:
          Readonly<{
            list(
              params:
                Readonly<{
                  limit: number;
                }>,
            ):
              Promise<unknown>;
          }>;
      }>;
  }>;

type StripeConnectionProbeFactory =
  (
    apiKey:
      string,
  ) =>
    StripeConnectionProbeClient;

export type StripeCommerceConnectionResult =
  Readonly<{
    provider:
      typeof STRIPE_COMMERCE_PROVIDER;
    environment:
      CommerceProviderEnvironment;
    status:
      "active";
  }>;

export class StripeCommerceConnectionError
  extends Error {
  readonly code:
    string;

  readonly status:
    number;

  constructor(
    code: string,
    message: string,
    status:
      number,
  ) {
    super(
      message,
    );

    this.name =
      "StripeCommerceConnectionError";

    this.code =
      code;

    this.status =
      status;
  }
}

function normalizedApiKey(
  raw:
    string,
  environment:
    CommerceProviderEnvironment,
) {
  const apiKey =
    raw.trim();

  if (
    apiKey.length < 16 ||
    apiKey.length > 512 ||
    /\s/.test(
      apiKey,
    )
  ) {
    throw new StripeCommerceConnectionError(
      "STRIPE_CREDENTIAL_INVALID",
      "Stripe API key is invalid.",
      400,
    );
  }

  const expected =
    environment ===
      "test"
      ? /^(sk|rk)_test_/
      : /^(sk|rk)_live_/;

  if (
    !expected.test(
      apiKey,
    )
  ) {
    throw new StripeCommerceConnectionError(
      "STRIPE_CREDENTIAL_ENVIRONMENT_MISMATCH",
      `Stripe ${environment} credentials do not match the selected environment.`,
      400,
    );
  }

  return apiKey;
}

function defaultProbeClient(
  apiKey:
    string,
): StripeConnectionProbeClient {
  return new Stripe(
    apiKey,
    {
      timeout:
        STRIPE_REQUEST_TIMEOUT_MS,
      maxNetworkRetries:
        STRIPE_MAX_NETWORK_RETRIES,
    },
  );
}

async function verifyCheckoutAccess(
  input:
    Readonly<{
      apiKey: string;
      createProbeClient:
        StripeConnectionProbeFactory;
    }>,
) {
  try {
    const stripe =
      input.createProbeClient(
        input.apiKey,
      );

    await stripe
      .checkout
      .sessions
      .list({
        limit:
          1,
      });
  } catch {
    throw new StripeCommerceConnectionError(
      "STRIPE_CONNECTION_VALIDATION_FAILED",
      "Stripe credentials could not be validated for Checkout Sessions access.",
      400,
    );
  }
}

export async function connectStripeCommerceEnvironment(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      storeId:
        string;
      environment:
        CommerceProviderEnvironment;
      apiKey:
        string;
      secretStore:
        BuildSecretStore;
    }>,
  dependencies:
    Readonly<{
      createProbeClient?:
        StripeConnectionProbeFactory;
    }> =
      {},
): Promise<
  StripeCommerceConnectionResult
> {
  const buildProjectId =
    input.buildProjectId
      .trim();

  const storeId =
    input.storeId
      .trim();

  if (
    !buildProjectId ||
    !storeId
  ) {
    throw new StripeCommerceConnectionError(
      "STRIPE_CONNECTION_SCOPE_INVALID",
      "Stripe connection scope is invalid.",
      400,
    );
  }

  const apiKey =
    normalizedApiKey(
      input.apiKey,
      input.environment,
    );

  await verifyCheckoutAccess({
    apiKey,
    createProbeClient:
      dependencies
        .createProbeClient ??
      defaultProbeClient,
  });

  const existing =
    await client
      .commerceProviderConnection
      .findUnique({
        where: {
          storeId_provider_environment: {
            storeId,
            provider:
              STRIPE_COMMERCE_PROVIDER,
            environment:
              input.environment,
          },
        },
        select: {
          id:
            true,
          credentialsSecretRef:
            true,
        },
      });

  const stored =
    await input.secretStore
      .put({
        buildProjectId,
        value: {
          secretKey:
            apiKey,
        },
      });

  try {
    await client
      .commerceProviderConnection
      .upsert({
        where: {
          storeId_provider_environment: {
            storeId,
            provider:
              STRIPE_COMMERCE_PROVIDER,
            environment:
              input.environment,
          },
        },
        create: {
          storeId,
          provider:
            STRIPE_COMMERCE_PROVIDER,
          environment:
            input.environment,
          status:
            "active",
          credentialsSecretRef:
            stored.secretRef,
        },
        update: {
          status:
            "active",
          credentialsSecretRef:
            stored.secretRef,
        },
        select: {
          id:
            true,
        },
      });
  } catch {
    await input.secretStore
      .delete({
        buildProjectId,
        secretRef:
          stored.secretRef,
      })
      .catch(
        () => undefined,
      );

    throw new StripeCommerceConnectionError(
      "STRIPE_CONNECTION_SAVE_FAILED",
      "Stripe connection could not be saved.",
      500,
    );
  }

  const previousRef =
    existing
      ?.credentialsSecretRef
      ?.trim();

  if (
    previousRef &&
    previousRef !==
      stored.secretRef
  ) {
    await input.secretStore
      .delete({
        buildProjectId,
        secretRef:
          previousRef,
      })
      .catch(
        () => undefined,
      );
  }

  return {
    provider:
      STRIPE_COMMERCE_PROVIDER,
    environment:
      input.environment,
    status:
      "active",
  };
}
