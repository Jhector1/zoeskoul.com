import "server-only";

import Stripe from "stripe";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import type {
  CommerceProviderConnectionSnapshot,
} from "./commerceProviderResolver";

import type {
  CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

import {
  readStripeSecretKey,
  STRIPE_COMMERCE_PROVIDER,
} from "./stripeCommerceCheckout";

import {
  reconcileStripeCommerceExpiredSession,
  reconcileStripeCommercePaidSession,
} from "./stripeCommerceWebhook";

import type {
  CommerceCheckoutReconciliationExecutor,
  CommerceCheckoutReconciliationOrder,
  CommerceCheckoutRemoteSnapshot,
} from "./commerceCheckoutReconciliation";

type StripeReconciliationClient =
  Readonly<{
    checkout:
      Readonly<{
        sessions:
          Readonly<{
            retrieve(
              id: string,
            ):
              Promise<
                Stripe.Checkout.Session
              >;

            expire(
              id: string,
            ):
              Promise<
                Stripe.Checkout.Session
              >;
          }>;
      }>;
  }>;

type StripeReconciliationClientFactory =
  (
    secretKey: string,
  ) =>
    StripeReconciliationClient;

export class StripeCommerceReconciliationError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "StripeCommerceReconciliationError";

    this.code = code;
  }
}

function defaultStripeClient(
  secretKey: string,
): StripeReconciliationClient {
  return new Stripe(
    secretKey,
    {
      maxNetworkRetries: 2,
      timeout: 15_000,
    },
  );
}

function inferEnvironmentFromProviderRef(
  providerRef: string,
):
  | CommerceProviderEnvironment
  | null {
  if (
    providerRef.startsWith(
      "cs_test_",
    )
  ) {
    return "test";
  }

  if (
    providerRef.startsWith(
      "cs_live_",
    )
  ) {
    return "live";
  }

  return null;
}

function assertTrustedRemoteSession(
  input: Readonly<{
    buildProjectId: string;
    environment:
      CommerceProviderEnvironment;
    order:
      CommerceCheckoutReconciliationOrder;
    session:
      Stripe.Checkout.Session;
  }>,
) {
  const {
    buildProjectId,
    environment,
    order,
    session,
  } = input;

  const metadataOrderId =
    session.metadata
      ?.zoebuildOrderId
      ?.trim() ?? "";

  const metadataProjectId =
    session.metadata
      ?.zoebuildProjectId
      ?.trim() ?? "";

  if (
    session.id !==
      order.paymentProviderRef ||
    session.client_reference_id
      ?.trim() !==
      order.id ||
    metadataOrderId !==
      order.id ||
    metadataProjectId !==
      buildProjectId
  ) {
    throw new StripeCommerceReconciliationError(
      "STRIPE_RECONCILIATION_IDENTITY_MISMATCH",
      "Stripe Checkout Session identity does not match the trusted order.",
    );
  }

  if (
    session.amount_total !==
      order.totalMinor ||
    session.currency
      ?.toUpperCase() !==
      order.currency
        .toUpperCase()
  ) {
    throw new StripeCommerceReconciliationError(
      "STRIPE_RECONCILIATION_TOTAL_MISMATCH",
      "Stripe Checkout Session totals do not match the trusted order.",
    );
  }

  const expectedLivemode =
    environment === "live";

  if (
    Boolean(session.livemode) !==
    expectedLivemode
  ) {
    throw new StripeCommerceReconciliationError(
      "STRIPE_RECONCILIATION_ENVIRONMENT_MISMATCH",
      "Stripe Checkout Session environment does not match the trusted order.",
    );
  }
}

function remoteState(
  session: Stripe.Checkout.Session,
): CommerceCheckoutRemoteSnapshot {
  if (
    session.status ===
      "complete" &&
    session.payment_status ===
      "paid"
  ) {
    return {
      providerRef: session.id,
      state: "paid",
    };
  }

  if (
    session.status ===
      "expired"
  ) {
    return {
      providerRef: session.id,
      state: "expired",
    };
  }

  if (
    session.status ===
      "open"
  ) {
    return {
      providerRef: session.id,
      state: "open",
    };
  }

  return {
    providerRef: session.id,
    state: "unknown",
  };
}

async function stripeClientFor(
  input: Readonly<{
    buildProjectId: string;
    environment:
      CommerceProviderEnvironment;
    connection:
      CommerceProviderConnectionSnapshot;
    secretStore?:
      BuildSecretStore;
  }>,
  createClient:
    StripeReconciliationClientFactory,
) {
  if (!input.secretStore) {
    throw new StripeCommerceReconciliationError(
      "STRIPE_RECONCILIATION_SECRET_STORE_REQUIRED",
      "Stripe reconciliation requires secure server credentials.",
    );
  }

  const secretKey =
    await readStripeSecretKey({
      buildProjectId:
        input.buildProjectId,
      environment:
        input.environment,
      connection:
        input.connection,
      secretStore:
        input.secretStore,
    });

  return createClient(
    secretKey,
  );
}

export function createStripeCommerceReconciliationExecutor(
  dependencies: Readonly<{
    createClient?:
      StripeReconciliationClientFactory;
  }> = {},
): CommerceCheckoutReconciliationExecutor {
  const createClient =
    dependencies.createClient ??
    defaultStripeClient;

  return {
    provider:
      STRIPE_COMMERCE_PROVIDER,

    requiresSecretStore:
      true,

    inferEnvironmentFromProviderRef,

    async inspect(input) {
      const stripe =
        await stripeClientFor(
          input,
          createClient,
        );

      const session =
        await stripe.checkout.sessions
          .retrieve(
            input.order
              .paymentProviderRef,
          );

      assertTrustedRemoteSession({
        buildProjectId:
          input.buildProjectId,
        environment:
          input.environment,
        order: input.order,
        session,
      });

      return remoteState(
        session,
      );
    },

    async expire(input) {
      const stripe =
        await stripeClientFor(
          input,
          createClient,
        );

      const session =
        await stripe.checkout.sessions
          .expire(
            input.order
              .paymentProviderRef,
          );

      assertTrustedRemoteSession({
        buildProjectId:
          input.buildProjectId,
        environment:
          input.environment,
        order: input.order,
        session,
      });

      return remoteState(
        session,
      );
    },

    async reconcilePaid(
      client: PrismaClient,
      input,
    ) {
      return reconcileStripeCommercePaidSession(
        client,
        {
          buildProjectId:
            input.buildProjectId,
          orderId:
            input.orderId,
          sessionId:
            input.providerRef,
        },
      );
    },

    async reconcileExpired(
      client: PrismaClient,
      input,
    ) {
      return reconcileStripeCommerceExpiredSession(
        client,
        {
          buildProjectId:
            input.buildProjectId,
          orderId:
            input.orderId,
          sessionId:
            input.providerRef,
        },
      );
    },
  };
}

export const STRIPE_COMMERCE_RECONCILIATION_EXECUTOR =
  createStripeCommerceReconciliationExecutor();
