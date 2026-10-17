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
  type CommerceCheckoutReconciliationExecutor,
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
              null,
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

function executor(
  remote:
    "open" |
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

  const expire =
    vi.fn(
      async () => ({
        providerRef:
          "provider_ref_1",
        state:
          "expired" as const,
      }),
    );

  const value:
    CommerceCheckoutReconciliationExecutor =
      {
        provider:
          "test-provider",

        inferEnvironmentFromProviderRef:
          () =>
            "test",

        inspect:
          vi.fn(
            async () => ({
              providerRef:
                "provider_ref_1",
              state:
                remote,
            }),
          ),

        expire,

        reconcilePaid,

        reconcileExpired,
      };

  return {
    value,
    reconcilePaid,
    reconcileExpired,
    expire,
  };
}

describe(
  "provider-neutral stale commerce checkout reconciliation",
  () => {
    it(
      "reconciles provider-authoritative paid state",
      async () => {
        const provider =
          executor("paid");

        const results =
          await reconcileStaleCommerceCheckouts(
            client(order()),
            {
              buildProjectId:
                "project_1",
              now:
                new Date(
                  "2026-10-17T13:00:00.000Z",
                ),
            },
            {
              executors:
                new Map([
                  [
                    provider.value.provider,
                    provider.value,
                  ],
                ]),
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
          provider.reconcilePaid,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          provider.reconcileExpired,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "expires a stale open provider checkout before reconciling terminal state",
      async () => {
        const provider =
          executor("open");

        const results =
          await reconcileStaleCommerceCheckouts(
            client(order()),
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
              executors:
                new Map([
                  [
                    provider.value.provider,
                    provider.value,
                  ],
                ]),
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
          provider.expire,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          provider.reconcileExpired,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "supports legacy rows only through provider-owned environment inference",
      async () => {
        const provider =
          executor("expired");

        const results =
          await reconcileStaleCommerceCheckouts(
            client(
              order({
                paymentEnvironment:
                  null,
                checkoutExpiresAt:
                  null,
                createdAt:
                  new Date(
                    "2026-10-17T10:00:00.000Z",
                  ),
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
              executors:
                new Map([
                  [
                    provider.value.provider,
                    provider.value,
                  ],
                ]),
            },
          );

        expect(
          results,
        ).toEqual([
          expect.objectContaining({
            environment: "test",
            action:
              "expired-reconciled",
          }),
        ]);
      },
    );
  },
);
