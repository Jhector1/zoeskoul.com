import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import {
  reconcileStaleCommerceCheckouts,
} from "./commerceCheckoutReconciliation";

function client(
  order: Readonly<{
    id: string;
    paymentProvider: string;
    paymentEnvironment:
      "test" | "live" | null;
    paymentProviderRef: string;
    checkoutExpiresAt:
      Date | null;
    createdAt: Date;
    currency: string;
    totalMinor: number;
  }>,
) {
  return {
    commerceStore: {
      findUnique:
        vi.fn(
          async () => ({
            id:
              "store_1",
          }),
        ),
    },
    commerceOrder: {
      findMany:
        vi.fn(
          async () => [
            order,
          ],
        ),
    },
    commerceProviderConnection: {
      findUnique:
        vi.fn(
          async () => ({
            id:
              "connection_1",
            status:
              "active",
            externalAccountRef:
              null,
            credentialsSecretRef:
              "secret_ref_1",
            webhookSecretRef:
              null,
            config:
              null,
          }),
        ),
    },
  } as unknown as
    PrismaClient;
}

function order(
  overrides:
    Partial<{
      paymentEnvironment:
        "test" | "live" | null;
      checkoutExpiresAt:
        Date | null;
      createdAt:
        Date;
    }> = {},
) {
  return {
    id:
      "order_1",
    paymentProvider:
      "test-provider",
    paymentEnvironment:
      "test" as const,
    paymentProviderRef:
      "provider_ref_1",
    checkoutExpiresAt:
      new Date(
        "2026-10-17T11:00:00.000Z",
      ),
    createdAt:
      new Date(
        "2026-10-17T10:00:00.000Z",
      ),
    currency:
      "USD",
    totalMinor:
      1500,
    ...overrides,
  };
}

function paymentRuntime(
  remote:
    "pending" |
    "paid" |
    "expired",
) {
  const reconcilePaid =
    vi.fn(
      async () => ({
        ok: true,
      }),
    );

  const reconcileExpired =
    vi.fn(
      async () => ({
        ok: true,
      }),
    );

  const cancelPayment =
    vi.fn(
      async () => ({
        remoteResourceId:
          "provider_ref_1",
        state:
          "expired" as const,
      }),
    );

  const inspectPayment =
    vi.fn(
      async () => ({
        remoteResourceId:
          "provider_ref_1",
        state:
          remote,
      }),
    );

  const prepare =
    vi.fn(
      async () => ({
        provider:
          "test-provider",
        environment:
          "test" as const,
        inspectPayment,
        cancelPayment,
        reconcilePaid,
        reconcileExpired,
      }),
    );

  return {
    prepare,
    inspectPayment,
    cancelPayment,
    reconcilePaid,
    reconcileExpired,
  };
}

describe(
  "provider-neutral stale commerce checkout reconciliation",
  () => {
    it(
      "reconciles provider-authoritative paid state through the shared payment runtime",
      async () => {
        const payment =
          paymentRuntime(
            "paid",
          );

        const results =
          await reconcileStaleCommerceCheckouts(
            client(
              order(),
            ),
            {
              buildProjectId:
                "project_1",
              now:
                new Date(
                  "2026-10-17T13:00:00.000Z",
                ),
            },
            {
              preparePaymentReconciliation:
                payment.prepare as never,
            },
          );

        expect(
          results,
        ).toEqual([
          expect.objectContaining({
            action:
              "paid-reconciled",
            remoteState:
              "paid",
          }),
        ]);

        expect(
          payment.inspectPayment,
        ).toHaveBeenCalledWith(
          "provider_ref_1",
        );

        expect(
          payment.reconcilePaid,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "cancels a stale pending remote payment before reconciling terminal state",
      async () => {
        const payment =
          paymentRuntime(
            "pending",
          );

        const results =
          await reconcileStaleCommerceCheckouts(
            client(
              order(),
            ),
            {
              buildProjectId:
                "project_1",
              now:
                new Date(
                  "2026-10-17T13:00:00.000Z",
                ),
              expireOpen:
                true,
            },
            {
              preparePaymentReconciliation:
                payment.prepare as never,
            },
          );

        expect(
          results,
        ).toEqual([
          expect.objectContaining({
            action:
              "provider-expired-and-reconciled",
            remoteState:
              "expired",
          }),
        ]);

        expect(
          payment.cancelPayment,
        ).toHaveBeenCalledWith(
          "provider_ref_1",
        );

        expect(
          payment.reconcileExpired,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "fails closed when a historical order has no explicit payment environment",
      async () => {
        const payment =
          paymentRuntime(
            "expired",
          );

        const results =
          await reconcileStaleCommerceCheckouts(
            client(
              order({
                paymentEnvironment:
                  null,
              }),
            ),
            {
              buildProjectId:
                "project_1",
              now:
                new Date(
                  "2026-10-17T13:00:00.000Z",
                ),
            },
            {
              preparePaymentReconciliation:
                payment.prepare as never,
            },
          );

        expect(
          results,
        ).toEqual([
          expect.objectContaining({
            environment:
              null,
            action:
              "environment-unresolved",
          }),
        ]);

        expect(
          payment.prepare,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
