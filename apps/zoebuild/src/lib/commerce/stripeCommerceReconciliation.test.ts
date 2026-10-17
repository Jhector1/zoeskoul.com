import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type Stripe from "stripe";

import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  prepareStripeCommercePaymentReconciliation,
} from "./stripeCommerceReconciliation";

function secretStore() {
  const read =
    vi.fn(
      async () => ({
        secretKey:
          "sk_test_example",
      }),
    );

  return {
    value: {
      async put() {
        throw new Error(
          "not used",
        );
      },
      read,
      async delete() {
        throw new Error(
          "not used",
        );
      },
    } as BuildSecretStore,
    read,
  };
}

function order() {
  return {
    id:
      "order_1",
    paymentProvider:
      "stripe",
    paymentEnvironment:
      "test" as const,
    paymentProviderRef:
      "cs_test_123",
    checkoutExpiresAt:
      new Date(
        "2100-01-01T00:00:00.000Z",
      ),
    createdAt:
      new Date(
        "2026-10-17T10:00:00.000Z",
      ),
    currency:
      "USD",
    totalMinor:
      1800,
  };
}

function session(
  overrides:
    Partial<
      Stripe.Checkout.Session
    > =
      {},
): Stripe.Checkout.Session {
  return {
    id:
      "cs_test_123",
    object:
      "checkout.session",
    livemode:
      false,
    amount_total:
      1800,
    currency:
      "usd",
    payment_status:
      "paid",
    status:
      "complete",
    client_reference_id:
      "order_1",
    metadata: {
      zoebuildOrderId:
        "order_1",
      zoebuildProjectId:
        "project_1",
    },
    ...overrides,
  } as
    Stripe.Checkout.Session;
}

describe(
  "Stripe shared payment inspection adapter",
  () => {
    it(
      "maps a trusted paid Checkout Session into the shared contract",
      async () => {
        const secrets =
          secretStore();

        const retrieve =
          vi.fn(
            async () =>
              session(),
          );

        const prepared =
          await prepareStripeCommercePaymentReconciliation(
            {
              buildProjectId:
                "project_1",
              environment:
                "test",
              connection: {
                id:
                  "connection_1",
                externalAccountRef:
                  "acct_1",
                credentialsSecretRef:
                  "secret_ref_1",
                webhookSecretRef:
                  null,
                config:
                  null,
              },
              secretStore:
                secrets.value,
            },
            {
              createClient:
                () => ({
                  checkout: {
                    sessions: {
                      retrieve,
                      expire:
                        vi.fn(),
                    },
                  },
                }),
            },
          );

        const payments =
          prepared.forOrder(
            order(),
          );

        await expect(
          payments.inspectPayment?.(
            "cs_test_123",
          ),
        ).resolves.toEqual({
          remoteResourceId:
            "cs_test_123",
          state:
            "paid",
        });
      },
    );

    it(
      "maps provider cancellation into expired shared state",
      async () => {
        const secrets =
          secretStore();

        const expire =
          vi.fn(
            async () =>
              session({
                status:
                  "expired",
                payment_status:
                  "unpaid",
              }),
          );

        const prepared =
          await prepareStripeCommercePaymentReconciliation(
            {
              buildProjectId:
                "project_1",
              environment:
                "test",
              connection: {
                id:
                  "connection_1",
                externalAccountRef:
                  "acct_1",
                credentialsSecretRef:
                  "secret_ref_1",
                webhookSecretRef:
                  null,
                config:
                  null,
              },
              secretStore:
                secrets.value,
            },
            {
              createClient:
                () => ({
                  checkout: {
                    sessions: {
                      retrieve:
                        vi.fn(),
                      expire,
                    },
                  },
                }),
            },
          );

        const payments =
          prepared.forOrder(
            order(),
          );

        await expect(
          payments.cancelPayment?.(
            "cs_test_123",
          ),
        ).resolves.toEqual({
          remoteResourceId:
            "cs_test_123",
          state:
            "expired",
        });
      },
    );

    it(
      "rejects remote identity mismatch",
      async () => {
        const secrets =
          secretStore();

        const prepared =
          await prepareStripeCommercePaymentReconciliation(
            {
              buildProjectId:
                "project_1",
              environment:
                "test",
              connection: {
                id:
                  "connection_1",
                externalAccountRef:
                  "acct_1",
                credentialsSecretRef:
                  "secret_ref_1",
                webhookSecretRef:
                  null,
                config:
                  null,
              },
              secretStore:
                secrets.value,
            },
            {
              createClient:
                () => ({
                  checkout: {
                    sessions: {
                      async retrieve() {
                        return session({
                          client_reference_id:
                            "wrong_order",
                        });
                      },
                      expire:
                        vi.fn(),
                    },
                  },
                }),
            },
          );

        const payments =
          prepared.forOrder(
            order(),
          );

        await expect(
          payments.inspectPayment?.(
            "cs_test_123",
          ),
        ).rejects.toMatchObject({
          code:
            "STRIPE_RECONCILIATION_IDENTITY_MISMATCH",
        });
      },
    );
  },
);
