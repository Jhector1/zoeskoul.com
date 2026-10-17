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
import {
  activateCommerceProviderCredentialConnection,
  CommerceProviderConnectionLifecycleError,
} from "./commerceProviderConnectionLifecycle";

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

  try {
    const connected =
      await activateCommerceProviderCredentialConnection(
        client,
        {
          buildProjectId,
          storeId,
          provider:
            STRIPE_COMMERCE_PROVIDER,
          environment:
            input.environment,
          credentials: {
            secretKey:
              apiKey,
          },
          secretStore:
            input.secretStore,
        },
      );

    return {
      provider:
        STRIPE_COMMERCE_PROVIDER,
      environment:
        connected.environment,
      status:
        "active",
    };
  } catch (
    error
  ) {
    if (
      error instanceof
        CommerceProviderConnectionLifecycleError
    ) {
      throw new StripeCommerceConnectionError(
        error.code ===
          "COMMERCE_PROVIDER_CONNECTION_SCOPE_INVALID"
          ? "STRIPE_CONNECTION_SCOPE_INVALID"
          : "STRIPE_CONNECTION_SAVE_FAILED",
        error.code ===
          "COMMERCE_PROVIDER_CONNECTION_SCOPE_INVALID"
          ? "Stripe connection scope is invalid."
          : "Stripe connection could not be saved.",
        error.code ===
          "COMMERCE_PROVIDER_CONNECTION_SCOPE_INVALID"
          ? 400
          : 500,
      );
    }

    throw error;
  }
}
