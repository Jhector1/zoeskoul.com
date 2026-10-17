import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type Stripe from "stripe";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  configureStripeCommerceWebhookSecret,
  reconcileStripeCommerceWebhookEvent,
} from "./stripeCommerceWebhook";

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
        "build_1",
    },
    ...overrides,
  } as
    Stripe.Checkout.Session;
}

function event(
  type:
    string,
  checkout =
    session(),
): Stripe.Event {
  return {
    id:
      "evt_1",
    object:
      "event",
    created:
      1,
    livemode:
      false,
    type,
    data: {
      object:
        checkout,
    },
  } as
    Stripe.Event;
}

function reconciliationClient(
  initialProviderRef:
    string |
    null =
      "cs_test_123",
) {
  let providerRef =
    initialProviderRef;

  let paymentStatus =
    "pending";

  let orderStatus =
    "pending";

  let placedAt:
    Date |
    null =
      null;

  let quantity =
    10;

  const orderRow =
    () => ({
      id:
        "order_1",
      cartId:
        "cart_1",
      status:
        orderStatus,
      paymentStatus,
      currency:
        "USD",
      totalMinor:
        1800,
      paymentProvider:
        "stripe",
      paymentEnvironment:
        "test",
      paymentProviderRef:
        providerRef,
      placedAt,
      items: [
        {
          variantId:
            "variant_1",
          quantity:
            2,
          variant: {
            inventory: {
              trackQuantity:
                true,
            },
          },
        },
      ],
    });

  const commerceOrder = {
    findFirst:
      vi.fn(
        async () =>
          orderRow(),
      ),

    findUnique:
      vi.fn(
        async () => ({
          paymentStatus,
        }),
      ),

    updateMany:
      vi.fn(
        async (
          input:
            any,
        ) => {
          if (
            typeof input
              .data
              .paymentProviderRef ===
            "string"
          ) {
            const requestedRef =
              input
                .data
                .paymentProviderRef;

            if (
              orderStatus !==
                "pending" ||
              (
                paymentStatus !==
                  "pending" &&
                paymentStatus !==
                  "authorized"
              ) ||
              (
                providerRef !==
                  null &&
                providerRef !==
                  requestedRef
              )
            ) {
              return {
                count:
                  0,
              };
            }

            providerRef =
              requestedRef;

            return {
              count:
                1,
            };
          }

          if (
            input
              .data
              .paymentStatus ===
            "paid"
          ) {
            if (
              paymentStatus ===
              "paid"
            ) {
              return {
                count:
                  0,
              };
            }

            paymentStatus =
              "paid";

            orderStatus =
              "confirmed";

            placedAt =
              input
                .data
                .placedAt;

            return {
              count:
                1,
            };
          }

          if (
            input
              .data
              .paymentStatus ===
            "failed"
          ) {
            if (
              paymentStatus ===
              "paid"
            ) {
              return {
                count:
                  0,
              };
            }

            paymentStatus =
              "failed";

            return {
              count:
                1,
            };
          }

          return {
            count:
              0,
          };
        },
      ),
  };

  const commerceInventoryItem = {
    updateMany:
      vi.fn(
        async (
          input:
            any,
        ) => {
          quantity -=
            input
              .data
              .quantity
              .decrement;

          return {
            count:
              1,
          };
        },
      ),
  };

  const transactionClient = {
    commerceOrder,
    commerceInventoryItem,
  };

  const client = {
    commerceOrder,
    commerceInventoryItem,

    $transaction:
      vi.fn(
        async (
          callback:
            (
              transaction:
                any,
            ) =>
              Promise<
                unknown
              >,
        ) =>
          callback(
            transactionClient,
          ),
      ),
  } as unknown as
    PrismaClient;

  return {
    client,
    commerceOrder,
    commerceInventoryItem,
    get paymentStatus() {
      return paymentStatus;
    },
    get orderStatus() {
      return orderStatus;
    },
    get quantity() {
      return quantity;
    },
    get providerRef() {
      return providerRef;
    },
  };
}

describe(
  "Stripe commerce webhook reconciliation",
  () => {
    it(
      "marks a verified paid session confirmed and decrements tracked inventory exactly once",
      async () => {
        const fake =
          reconciliationClient();

        const first =
          await reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                event(
                  "checkout.session.completed",
                ),
            },
          );

        expect(
          first,
        ).toEqual({
          status:
            "paid",
          orderId:
            "order_1",
        });

        expect(
          fake.paymentStatus,
        ).toBe(
          "paid",
        );

        expect(
          fake.orderStatus,
        ).toBe(
          "confirmed",
        );

        expect(
          fake.quantity,
        ).toBe(
          8,
        );

        const duplicate =
          await reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                event(
                  "checkout.session.completed",
                ),
            },
          );

        expect(
          duplicate.status,
        ).toBe(
          "already-processed",
        );

        expect(
          fake.quantity,
        ).toBe(
          8,
        );

        expect(
          fake
            .commerceInventoryItem
            .updateMany,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "waits for async success when Checkout completed but payment is still unpaid",
      async () => {
        const fake =
          reconciliationClient();

        const result =
          await reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                event(
                  "checkout.session.completed",
                  session({
                    payment_status:
                      "unpaid",
                  }),
                ),
            },
          );

        expect(
          result.status,
        ).toBe(
          "pending",
        );

        expect(
          fake.paymentStatus,
        ).toBe(
          "pending",
        );

        expect(
          fake.quantity,
        ).toBe(
          10,
        );
      },
    );

    it(
      "adopts a missing trusted provider reference before webhook reconciliation",
      async () => {
        const fake =
          reconciliationClient(
            null,
          );

        expect(
          fake.providerRef,
        ).toBeNull();

        const result =
          await reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                event(
                  "checkout.session.completed",
                ),
            },
          );

        expect(
          result,
        ).toEqual({
          status:
            "paid",
          orderId:
            "order_1",
        });

        expect(
          fake.providerRef,
        ).toBe(
          "cs_test_123",
        );

        expect(
          fake.paymentStatus,
        ).toBe(
          "paid",
        );

        expect(
          fake.orderStatus,
        ).toBe(
          "confirmed",
        );

        expect(
          fake.quantity,
        ).toBe(
          8,
        );
      },
    );

    it(
      "rejects amount mismatches before any fulfillment mutation",
      async () => {
        const fake =
          reconciliationClient();

        await expect(
          reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                event(
                  "checkout.session.completed",
                  session({
                    amount_total:
                      1799,
                  }),
                ),
            },
          ),
        ).rejects.toMatchObject({
          code:
            "STRIPE_WEBHOOK_AMOUNT_MISMATCH",
        });

        expect(
          fake.quantity,
        ).toBe(
          10,
        );
      },
    );

    it(
      "stores a rotated webhook signing secret through the encrypted secret store",
      async () => {
        const deletes:
          string[] =
          [];

        const secretStore = {
          async put() {
            return {
              secretRef:
                "zoebuild-secret:v1:new",
            };
          },

          async read() {
            throw new Error(
              "not used",
            );
          },

          async delete(
            input:
              {
                secretRef:
                  string;
              },
          ) {
            deletes.push(
              input.secretRef,
            );
          },
        } as
          BuildSecretStore;

        const updateMany =
          vi.fn(
            async () => ({
              count:
                1,
            }),
          );

        const client = {
          commerceProviderConnection: {
            async findUnique() {
              return {
                id:
                  "connection_1",
                provider:
                  "stripe",
                environment:
                  "test",
                status:
                  "active",
                webhookSecretRef:
                  "zoebuild-secret:v1:old",
              };
            },
            updateMany,
          },
        } as unknown as
          PrismaClient;

        const result =
          await configureStripeCommerceWebhookSecret(
            client,
            {
              buildProjectId:
                "build_1",
              storeId:
                "store_1",
              environment:
                "test",
              webhookSecret:
                "whsec_example_123456789",
              secretStore,
            },
          );

        expect(
          result.webhookConfigured,
        ).toBe(
          true,
        );

        expect(
          updateMany,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          deletes,
        ).toEqual([
          "zoebuild-secret:v1:old",
        ]);
      },
    );
  },
);
