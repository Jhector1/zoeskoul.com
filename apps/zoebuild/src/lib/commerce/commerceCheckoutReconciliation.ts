import "server-only";

import type { PrismaClient } from "@zoeskoul/db";

import type {
  CommerceProviderConnectionSnapshot,
} from "./commerceProviderResolver";

import type {
  CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

import {
  prepareCommercePaymentReconciliation,
} from "./commerceRuntime";

export const COMMERCE_STALE_CHECKOUT_LEGACY_AGE_MS =
  60 * 60 * 1000;

export type CommerceCheckoutRemoteState =
  | "open"
  | "paid"
  | "expired"
  | "failed"
  | "unknown";

export type CommerceCheckoutRemoteSnapshot =
  Readonly<{
    providerRef: string;
    state: CommerceCheckoutRemoteState;
  }>;

export type CommerceCheckoutReconciliationOrder =
  Readonly<{
    id: string;
    paymentProvider: string;
    paymentEnvironment:
      CommerceProviderEnvironment | null;
    paymentProviderRef: string;
    checkoutExpiresAt: Date | null;
    createdAt: Date;
    currency: string;
    totalMinor: number;
  }>;

export type CommerceStaleCheckoutReconciliationResult =
  Readonly<{
    orderId: string;
    provider: string;
    environment:
      CommerceProviderEnvironment | null;
    providerRef: string | null;
    remoteState:
      CommerceCheckoutRemoteState | null;
    action:
      | "paid-reconciled"
      | "expired-reconciled"
      | "provider-expired-and-reconciled"
      | "open"
      | "unknown"
      | "unsupported-provider"
      | "environment-unresolved"
      | "connection-unavailable"
      | "provider-expiration-unavailable"
      | "provider-expiration-unconfirmed"
      | "provider-ref-missing"
      | "error";
    errorCode?: string;
  }>;

function normalizedProvider(
  value: string | null,
) {
  return value?.trim() ?? "";
}

function normalizedProviderRef(
  value: string | null,
) {
  return value?.trim() ?? "";
}

function isStaleCandidate(
  order: Readonly<{
    checkoutExpiresAt: Date | null;
    createdAt: Date;
  }>,
  now: Date,
  legacyAgeMs: number,
) {
  if (order.checkoutExpiresAt) {
    return (
      order.checkoutExpiresAt.getTime() <=
      now.getTime()
    );
  }

  return (
    order.createdAt.getTime() <=
    now.getTime() - legacyAgeMs
  );
}

function environmentForOrder(
  order: CommerceCheckoutReconciliationOrder,
) {
  return order.paymentEnvironment;
}

function reconciliationErrorCode(
  error: unknown,
) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (
      error as Readonly<{ code?: unknown }>
    ).code === "string"
  ) {
    return (
      error as Readonly<{ code: string }>
    ).code;
  }

  return error instanceof Error
    ? error.name
    : "UNKNOWN_ERROR";
}

export async function reconcileStaleCommerceCheckouts(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    now?: Date;
    legacyAgeMs?: number;
    expireOpen?: boolean;
  }>,
  options: Readonly<{
    preparePaymentReconciliation?:
      typeof prepareCommercePaymentReconciliation;
  }> = {},
): Promise<
  readonly CommerceStaleCheckoutReconciliationResult[]
> {
  const buildProjectId =
    input.buildProjectId.trim();

  if (!buildProjectId) {
    throw new Error(
      "Commerce reconciliation requires a build project id.",
    );
  }

  const now = input.now ?? new Date();

  const legacyAgeMs =
    input.legacyAgeMs ??
    COMMERCE_STALE_CHECKOUT_LEGACY_AGE_MS;

  if (
    !Number.isSafeInteger(legacyAgeMs) ||
    legacyAgeMs < 0
  ) {
    throw new Error(
      "Commerce reconciliation legacy age must be a non-negative integer.",
    );
  }

  const store =
    await client.commerceStore.findUnique({
      where: {
        buildProjectId,
      },
      select: {
        id: true,
      },
    });

  if (!store) {
    return [];
  }

  const orders =
    await client.commerceOrder.findMany({
      where: {
        storeId: store.id,
        status: "pending",
        paymentStatus: {
          in: [
            "pending",
            "authorized",
          ],
        },
        paymentProvider: {
          not: null,
        },
      },
      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
      select: {
        id: true,
        paymentProvider: true,
        paymentEnvironment: true,
        paymentProviderRef: true,
        checkoutExpiresAt: true,
        createdAt: true,
        currency: true,
        totalMinor: true,
      },
    });

  const preparePaymentReconciliation =
    options.preparePaymentReconciliation ??
    prepareCommercePaymentReconciliation;

  const results:
    CommerceStaleCheckoutReconciliationResult[] =
      [];

  for (const row of orders) {
    if (
      !isStaleCandidate(
        row,
        now,
        legacyAgeMs,
      )
    ) {
      continue;
    }

    const provider =
      normalizedProvider(
        row.paymentProvider,
      );

    const providerRef =
      normalizedProviderRef(
        row.paymentProviderRef,
      );

    if (!provider) {
      continue;
    }

    if (!providerRef) {
      /*
       * Never release a stale reservation merely because the local provider
       * reference is missing. A remote Session may exist. Surface the row so
       * recovery/operations can act on it while remaining fail closed.
       */
      results.push({
        orderId:
          row.id,
        provider,
        environment:
          row.paymentEnvironment,
        providerRef:
          null,
        remoteState:
          null,
        action:
          "provider-ref-missing",
        errorCode:
          "COMMERCE_RECONCILIATION_PROVIDER_REF_MISSING",
      });
      continue;
    }

    const order:
      CommerceCheckoutReconciliationOrder =
        {
          ...row,
          paymentProvider:
            provider,
          paymentProviderRef:
            providerRef,
        };

    const environment =
      environmentForOrder(
        order,
      );

    if (!environment) {
      results.push({
        orderId: order.id,
        provider,
        environment: null,
        providerRef,
        remoteState: null,
        action:
          "environment-unresolved",
      });
      continue;
    }

    const connection =
      await client
        .commerceProviderConnection
        .findUnique({
          where: {
            storeId_provider_environment: {
              storeId: store.id,
              provider,
              environment,
            },
          },
          select: {
            id: true,
            status: true,
            externalAccountRef: true,
            credentialsSecretRef: true,
            webhookSecretRef: true,
            config: true,
          },
        });

    if (
      !connection ||
      connection.status !== "active"
    ) {
      results.push({
        orderId: order.id,
        provider,
        environment,
        providerRef,
        remoteState: null,
        action:
          "connection-unavailable",
      });
      continue;
    }

    const connectionSnapshot:
      CommerceProviderConnectionSnapshot =
        {
          id: connection.id,
          externalAccountRef:
            connection.externalAccountRef,
          credentialsSecretRef:
            connection.credentialsSecretRef,
          webhookSecretRef:
            connection.webhookSecretRef,
          config:
            connection.config,
        };

    try {
      const payment =
        await preparePaymentReconciliation(
          client,
          {
            buildProjectId,
            provider,
            environment,
            connection:
              connectionSnapshot,
            order,
          },
        );

      const inspection =
        await payment.inspectPayment(
          providerRef,
        );

      const remote = {
        providerRef:
          inspection.remoteResourceId,
        state:
          inspection.state === "pending"
            ? "open" as const
            : inspection.state === "canceled"
              ? "expired" as const
              : inspection.state,
      };

      if (
        remote.providerRef !==
        providerRef
      ) {
        throw Object.assign(
          new Error(
            "Commerce provider returned a mismatched checkout reference.",
          ),
          {
            code:
              "COMMERCE_RECONCILIATION_PROVIDER_REF_MISMATCH",
          },
        );
      }

      if (
        remote.state === "paid"
      ) {
        await payment.reconcilePaid(
          client,
          {
            buildProjectId,
            orderId: order.id,
            providerRef,
          },
        );

        results.push({
          orderId: order.id,
          provider,
          environment,
          providerRef,
          remoteState:
            remote.state,
          action:
            "paid-reconciled",
        });
        continue;
      }

      if (
        remote.state ===
          "expired" ||
        remote.state ===
          "failed"
      ) {
        await payment.reconcileExpired(
          client,
          {
            buildProjectId,
            orderId: order.id,
            providerRef,
          },
        );

        results.push({
          orderId: order.id,
          provider,
          environment,
          providerRef,
          remoteState:
            remote.state,
          action:
            "expired-reconciled",
        });
        continue;
      }

      if (
        remote.state !== "open"
      ) {
        results.push({
          orderId: order.id,
          provider,
          environment,
          providerRef,
          remoteState:
            remote.state,
          action: "unknown",
        });
        continue;
      }

      if (
        input.expireOpen !== true
      ) {
        results.push({
          orderId: order.id,
          provider,
          environment,
          providerRef,
          remoteState:
            remote.state,
          action: "open",
        });
        continue;
      }

      if (!payment.cancelPayment) {
        results.push({
          orderId: order.id,
          provider,
          environment,
          providerRef,
          remoteState:
            remote.state,
          action:
            "provider-expiration-unavailable",
        });
        continue;
      }

      const canceled =
        await payment.cancelPayment(
          providerRef,
        );

      const expired = {
        providerRef:
          canceled.remoteResourceId,
        state:
          canceled.state === "canceled"
            ? "expired" as const
            : canceled.state === "pending"
              ? "open" as const
              : canceled.state,
      };

      if (
        expired.providerRef !==
          providerRef ||
        expired.state !==
          "expired"
      ) {
        results.push({
          orderId: order.id,
          provider,
          environment,
          providerRef,
          remoteState:
            expired.state,
          action:
            "provider-expiration-unconfirmed",
        });
        continue;
      }

      await payment.reconcileExpired(
        client,
        {
          buildProjectId,
          orderId: order.id,
          providerRef,
        },
      );

      results.push({
        orderId: order.id,
        provider,
        environment,
        providerRef,
        remoteState:
          expired.state,
        action:
          "provider-expired-and-reconciled",
      });
    } catch (error) {
      results.push({
        orderId: order.id,
        provider,
        environment,
        providerRef,
        remoteState: null,
        action: "error",
        errorCode:
          reconciliationErrorCode(
            error,
          ),
      });
    }
  }

  return results;
}
