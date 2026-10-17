import "server-only";

import Stripe from "stripe";

import type {
  PrismaClient,
} from "@zoeskoul/db";
import type {
  CommercePaymentInspection,
  CommercePaymentsCapabilityHandler,
} from "@zoeskoul/provider-contracts";
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
  CommerceCheckoutReconciliationOrder,
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

function paymentInspection(
  session:
    Stripe.Checkout.Session,
): CommercePaymentInspection {
  if (
    session.status ===
      "complete" &&
    session.payment_status ===
      "paid"
  ) {
    return {
      remoteResourceId:
        session.id,
      state:
        "paid",
    };
  }

  if (
    session.status ===
      "expired"
  ) {
    return {
      remoteResourceId:
        session.id,
      state:
        "expired",
    };
  }

  if (
    session.status ===
      "open"
  ) {
    return {
      remoteResourceId:
        session.id,
      state:
        "pending",
    };
  }

  return {
    remoteResourceId:
      session.id,
    state:
      "unknown",
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

type StripeInspectionHandler =
  Pick<
    CommercePaymentsCapabilityHandler,
    "inspectPayment" |
    "cancelPayment"
  >;

export type PreparedStripeCommercePaymentReconciliation =
  Readonly<{
    provider:
      typeof STRIPE_COMMERCE_PROVIDER;

    forOrder(
      order:
        CommerceCheckoutReconciliationOrder,
    ):
      StripeInspectionHandler;

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

export async function prepareStripeCommercePaymentReconciliation(
  input:
    Readonly<{
      buildProjectId: string;
      environment:
        CommerceProviderEnvironment;
      connection:
        CommerceProviderConnectionSnapshot;
      secretStore?:
        BuildSecretStore;
    }>,
  dependencies:
    Readonly<{
      createClient?:
        StripeReconciliationClientFactory;
    }> =
      {},
): Promise<
  PreparedStripeCommercePaymentReconciliation
> {
  const createClient =
    dependencies.createClient ??
    defaultStripeClient;

  const stripe =
    await stripeClientFor(
      input,
      createClient,
    );

  return {
    provider:
      STRIPE_COMMERCE_PROVIDER,

    forOrder(
      order,
    ) {
      return {
        async inspectPayment(
          remoteResourceId,
        ) {
          if (
            remoteResourceId.trim() !==
            order.paymentProviderRef
          ) {
            throw new StripeCommerceReconciliationError(
              "STRIPE_RECONCILIATION_PROVIDER_REF_MISMATCH",
              "Stripe reconciliation reference does not match the trusted order.",
            );
          }

          const session =
            await stripe
              .checkout
              .sessions
              .retrieve(
                remoteResourceId,
              );

          assertTrustedRemoteSession({
            buildProjectId:
              input.buildProjectId,
            environment:
              input.environment,
            order,
            session,
          });

          return paymentInspection(
            session,
          );
        },

        async cancelPayment(
          remoteResourceId,
        ) {
          if (
            remoteResourceId.trim() !==
            order.paymentProviderRef
          ) {
            throw new StripeCommerceReconciliationError(
              "STRIPE_RECONCILIATION_PROVIDER_REF_MISMATCH",
              "Stripe cancellation reference does not match the trusted order.",
            );
          }

          const session =
            await stripe
              .checkout
              .sessions
              .expire(
                remoteResourceId,
              );

          assertTrustedRemoteSession({
            buildProjectId:
              input.buildProjectId,
            environment:
              input.environment,
            order,
            session,
          });

          return paymentInspection(
            session,
          );
        },
      };
    },

    async reconcilePaid(
      client,
      lifecycleInput,
    ) {
      return reconcileStripeCommercePaidSession(
        client,
        {
          buildProjectId:
            lifecycleInput.buildProjectId,
          orderId:
            lifecycleInput.orderId,
          sessionId:
            lifecycleInput.providerRef,
        },
      );
    },

    async reconcileExpired(
      client,
      lifecycleInput,
    ) {
      return reconcileStripeCommerceExpiredSession(
        client,
        {
          buildProjectId:
            lifecycleInput.buildProjectId,
          orderId:
            lifecycleInput.orderId,
          sessionId:
            lifecycleInput.providerRef,
        },
      );
    },
  };
}
